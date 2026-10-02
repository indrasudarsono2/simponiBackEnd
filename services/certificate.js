import { randomUUID } from "node:crypto";

const certificateSelect = {
  id: true,
  finalScoreId: true,
  publicId: true,
  number: true,
  status: true,
  snapshot: true,
  issuedAt: true,
  revokedAt: true,
};

const kindLabel = (kind) => {
  const normalized = String(kind || "").trim().toUpperCase();
  if (normalized === "PRACTICAL" || normalized === "LIVE") return "Live";
  if (normalized === "SIMULATOR") return "Simulator";
  return kind || "Practical";
};

export const revokeCertificatesForFinalScore = (tx, finalScoreId, reason) =>
  tx.certificate.updateMany({
    where: { finalScoreId, status: "VALID" },
    data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason },
  });

export const issueCertificate = async (tx, finalScoreId) => {
  const result = await tx.finalScore.findUnique({
    where: { id: finalScoreId },
    select: {
      id: true,
      deletedAt: true,
      isInvalidated: true,
      essayScore: true,
      multipleChoiceScore: true,
      finalScore: true,
      status: { select: { status: true } },
      userRatings: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, userId: true, createdAt: true },
      },
      appRating: {
        select: {
          deletedAt: true,
          rating: { select: { rating: true } },
          applicationDoc: {
            select: {
              deletedAt: true,
              userNik: true,
              user: { select: { name: true } },
            },
          },
          practicalTests: {
            where: { deletedAt: null },
            orderBy: { id: "asc" },
            select: {
              id: true,
              score: true,
              updatedAt: true,
              kindOfPractical: { select: { kind: true } },
            },
          },
          practicalRecheckAuthorization: {
            select: {
              status: true,
              attempts: {
                select: { practicalTestId: true, score: true, updatedAt: true },
              },
            },
          },
        },
      },
      event: {
        select: {
          event: true,
          startDate: true,
          finishDate: true,
          isPractical: true,
          isSimulator: true,
          practicalPassingGrade: true,
          sector: {
            select: {
              branchUnit: {
                select: { unit: true, branch: { select: { branch: true } } },
              },
            },
          },
        },
      },
    },
  });

  const rating = result?.userRatings[0];
  const appRating = result?.appRating;
  const event = result?.event;
  if (!result || result.deletedAt || result.isInvalidated || result.status?.status !== "SUCCESS" ||
      !rating || !appRating || appRating.deletedAt || appRating.applicationDoc?.deletedAt ||
      rating.userId !== appRating.applicationDoc?.userNik ||
      !event || (!event.isPractical && !event.isSimulator)) {
    throw new Error("CERTIFICATE_NOT_ELIGIBLE");
  }

  const recheck = appRating.practicalRecheckAuthorization;
  if (recheck && recheck.status !== "SUCCESS") {
    throw new Error("CERTIFICATE_NOT_ELIGIBLE");
  }
  const replacementScores = recheck?.status === "SUCCESS"
    ? new Map(recheck.attempts.map((attempt) => [attempt.practicalTestId, attempt]))
    : new Map();
  const practical = appRating.practicalTests.map((test) => {
    const replacement = replacementScores.get(test.id);
    const effectiveScore = replacement?.score ?? test.score;
    return {
      kind: kindLabel(test.kindOfPractical?.kind),
      score: effectiveScore,
      passed: effectiveScore != null && Number(effectiveScore) >= Number(event.practicalPassingGrade),
      scoredAt: replacement?.updatedAt || test.updatedAt,
    };
  });
  const requiredKinds = [event.isPractical && "Live", event.isSimulator && "Simulator"].filter(Boolean);
  if (!practical.length || !requiredKinds.every((kind) => practical.some((item) => item.kind === kind && item.passed)) ||
      practical.some((item) => !item.passed)) {
    throw new Error("CERTIFICATE_NOT_ELIGIBLE");
  }

  const existing = await tx.certificate.findFirst({
    where: { finalScoreId, status: "VALID" },
    select: certificateSelect,
  });
  if (existing) return existing;

  const last = await tx.certificate.findFirst({
    where: { finalScoreId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version || 0) + 1;
  const baseNumber = `PERFORMA/PC/${String(rating.id).padStart(6, "0")}`;
  const number = version === 1 ? baseNumber : `${baseNumber}/R${version}`;
  const issuedAt = version === 1 ? rating.createdAt : new Date();
  const snapshot = {
    name: appRating.applicationDoc.user?.name || "",
    rating: appRating.rating?.rating || "",
    eventName: event.event || "",
    startDate: event.startDate,
    finishDate: event.finishDate,
    branch: event.sector?.branchUnit?.branch?.branch || "",
    branchUnit: event.sector?.branchUnit?.unit || "",
    theory: {
      essayScore: result.essayScore,
      multipleChoiceScore: result.multipleChoiceScore,
      finalScore: result.finalScore,
    },
    practical,
  };
  return tx.certificate.create({
    data: {
      finalScoreId,
      userRatingId: rating.id,
      version,
      publicId: randomUUID(),
      number,
      status: "VALID",
      snapshot,
      issuedAt,
    },
    select: certificateSelect,
  });
};
