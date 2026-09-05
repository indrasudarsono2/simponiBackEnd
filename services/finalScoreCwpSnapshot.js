const temporalWindow = (at) => ({
  createdAt: { lte: at },
  OR: [{ deletedAt: null }, { deletedAt: { gt: at } }],
});

const loadAssignments = (prisma, sectorId, ratingId, at, historical) =>
  prisma.sectorCwp.findMany({
    where: {
      sectorId,
      ...(historical ? temporalWindow(at) : { deletedAt: null }),
      cwp: {
        is: {
          ratingId,
          ...(historical ? temporalWindow(at) : { deletedAt: null }),
        },
      },
    },
    select: {
      cwp: {
        select: {
          id: true,
          cwp: true,
          cwpFrequencies: {
            where: historical ? temporalWindow(at) : { deletedAt: null },
            select: { frequency: true, isPrimary: true },
            orderBy: [{ isPrimary: "desc" }, { frequency: "asc" }],
          },
        },
      },
    },
  });

export const buildFinalScoreCwpSnapshot = async (prisma, finalScoreId, mode = "LIVE") => {
  const finalScore = await prisma.finalScore.findUnique({
    where: { id: finalScoreId },
    select: {
      id: true,
      createdAt: true,
      event: { select: { sector: { select: { id: true, sector: true } } } },
      appRating: { select: { ratingId: true } },
      cwpSnapshots: { select: { id: true, snapshotSource: true } },
    },
  });

  const sector = finalScore?.event?.sector;
  const ratingId = finalScore?.appRating?.ratingId;
  if (!finalScore || !sector || !ratingId) {
    return { status: "unresolved", finalScoreId, reason: "Missing event sector or rating" };
  }
  if (finalScore.cwpSnapshots.length > 0) {
    return { status: "skipped", finalScoreId, count: finalScore.cwpSnapshots.length };
  }

  const historical = mode !== "LIVE";
  let assignments = await loadAssignments(
    prisma,
    sector.id,
    ratingId,
    finalScore.createdAt,
    historical,
  );
  let snapshotSource = mode;

  if (historical && assignments.length === 0) {
    assignments = await loadAssignments(
      prisma,
      sector.id,
      ratingId,
      finalScore.createdAt,
      false,
    );
    snapshotSource = "BACKFILL_CURRENT_CONFIG";
  } else if (historical) {
    snapshotSource = "BACKFILL_HISTORICAL";
  }

  const cwps = assignments
    .map((assignment) => assignment.cwp)
    .filter(Boolean)
    .map((cwp) => ({
      cwpId: cwp.id,
      cwpName: cwp.cwp || `CWP ${cwp.id}`,
      sectorId: sector.id,
      sectorName: sector.sector || `Sector ${sector.id}`,
      snapshotSource,
      frequencies: cwp.cwpFrequencies
        .filter((item) => item.frequency)
        .map((item) => ({
          frequency: item.frequency,
          isPrimary: Boolean(item.isPrimary),
        })),
    }));

  return {
    status: cwps.length ? "ready" : "unresolved",
    finalScoreId,
    snapshotSource,
    cwps,
    reason: cwps.length ? null : "No matching CWP assignment",
  };
};

export const saveFinalScoreCwpSnapshot = async (prisma, plan) => {
  if (plan.status !== "ready") return plan;

  await prisma.$transaction(
    plan.cwps.map((cwp) =>
      prisma.finalScoreCwp.create({
        data: {
          finalScoreId: plan.finalScoreId,
          cwpId: cwp.cwpId,
          cwpName: cwp.cwpName,
          sectorId: cwp.sectorId,
          sectorName: cwp.sectorName,
          snapshotSource: cwp.snapshotSource,
          frequencies: { create: cwp.frequencies },
        },
      }),
    ),
  );

  return { ...plan, status: "created", count: plan.cwps.length };
};

export const ensureFinalScoreCwpSnapshot = async (prisma, finalScoreId) => {
  const plan = await buildFinalScoreCwpSnapshot(prisma, finalScoreId, "LIVE");
  return saveFinalScoreCwpSnapshot(prisma, plan);
};
