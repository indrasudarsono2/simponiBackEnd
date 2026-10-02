import prisma from "../lib/prisma.js";

const hasUsableFile = (record) => Boolean(record?.file?.trim());
const isFuture = (value, now) => value && new Date(value).getTime() > now.getTime();

export const getOperationalGuide = async (req, res) => {
  try {
    const nik = req.user.nik;
    const now = new Date();
    const [licenses, logbooks, ielps, medexes, competences, eventUser] = await Promise.all([
      prisma.license.findMany({ where: { userNik: nik, deletedAt: null }, orderBy: { id: "desc" }, select: { file: true, expiredDate: true } }),
      prisma.logBookUser.findMany({ where: { userNik: nik, deletedAt: null }, orderBy: { id: "desc" }, select: { file: true } }),
      prisma.ielp.findMany({ where: { userNik: nik, deletedAt: null, isCurrent: true, isConfirmed: true, verificationStatus: "APPROVED" }, orderBy: { id: "desc" }, select: { file: true, level: true, expired: true } }),
      prisma.medex.findMany({ where: { userNik: nik, deletedAt: null, isCurrent: true, isConfirmed: true, verificationStatus: "APPROVED" }, orderBy: { id: "desc" }, select: { file: true, expired: true } }),
      prisma.competence.findMany({ where: { userId: nik, deletedAt: null }, orderBy: { id: "desc" }, select: { ratingId: true, file: true } }),
      prisma.eventUser.findFirst({
        where: { userNik: nik, deletedAt: null, event: { deletedAt: null, startDate: { lte: now }, finishDate: { gte: now } } },
        orderBy: { id: "desc" },
        select: {
          id: true,
          event: { select: { id: true, event: true, remarkDoc: { select: { remark: true } } } },
          applicationDocs: {
            where: { deletedAt: null }, orderBy: { id: "desc" }, take: 1,
            select: {
              id: true, statusId: true, briefingDate: true, ojtRecommendationStatus: true,
              appRatings: { where: { deletedAt: null }, select: { ratingId: true, proposalLetter: { select: { status: true } } } },
            },
          },
        },
      }),
    ]);

    const applicationDoc = eventUser?.applicationDocs?.[0] || null;
    const remark = String(eventUser?.event?.remarkDoc?.remark || "").trim().toUpperCase();
    const proposedRatingIds = applicationDoc?.appRatings?.map((rating) => rating.ratingId).filter(Boolean) || [];
    const competenceReady = proposedRatingIds.length
      ? proposedRatingIds.every((ratingId) => competences.some((item) => item.ratingId === ratingId && (remark !== "PENERBITAN" || hasUsableFile(item))))
      : competences.some((item) => remark !== "PENERBITAN" || hasUsableFile(item));
    const letterValidated = Boolean(applicationDoc?.appRatings?.length &&
      applicationDoc.appRatings.every((rating) => rating.proposalLetter?.status === "VALIDATED") &&
      (remark !== "PENERBITAN" || applicationDoc.ojtRecommendationStatus === "ACCEPTED"));

    return res.json({
      event: eventUser?.event ? { id: eventUser.event.id, name: eventUser.event.event, remark } : null,
      applicationDocId: applicationDoc?.id || null,
      checks: {
        license: licenses.some((item) => hasUsableFile(item) && (!item.expiredDate || isFuture(item.expiredDate, now))),
        logbook: logbooks.some(hasUsableFile),
        ielp: ielps.some((item) => hasUsableFile(item) && (item.level === "6" || isFuture(item.expired, now))),
        medex: medexes.some((item) => hasUsableFile(item) && isFuture(item.expired, now)),
        competence: competenceReady,
        application: Boolean(applicationDoc),
        letter: letterValidated,
        checker: applicationDoc?.statusId === 2,
        briefing: Boolean(applicationDoc?.briefingDate),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
