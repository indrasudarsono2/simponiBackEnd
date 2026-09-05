import prisma from "../lib/prisma.js";
import {
  buildFinalScoreCwpSnapshot,
  saveFinalScoreCwpSnapshot,
} from "../services/finalScoreCwpSnapshot.js";

const apply = process.argv.includes("--apply");

try {
  const finalScores = await prisma.finalScore.findMany({
    where: {
      deletedAt: null,
      isInvalidated: false,
      eventId: { not: null },
      appRatingId: { not: null },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const report = {
    mode: apply ? "apply" : "preview",
    total: finalScores.length,
    ready: 0,
    created: 0,
    skipped: 0,
    historical: 0,
    currentConfigFallback: 0,
    unresolved: [],
  };

  for (const { id } of finalScores) {
    const plan = await buildFinalScoreCwpSnapshot(prisma, id, "BACKFILL");
    if (plan.status === "skipped") {
      report.skipped += 1;
      continue;
    }
    if (plan.status !== "ready") {
      report.unresolved.push({ finalScoreId: id, reason: plan.reason });
      continue;
    }

    report.ready += 1;
    if (plan.snapshotSource === "BACKFILL_HISTORICAL") report.historical += 1;
    if (plan.snapshotSource === "BACKFILL_CURRENT_CONFIG") {
      report.currentConfigFallback += 1;
    }
    if (apply) {
      await saveFinalScoreCwpSnapshot(prisma, plan);
      report.created += 1;
    }
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect();
}
