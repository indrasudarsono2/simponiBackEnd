import prisma from "../lib/prisma.js";
import { issueCertificate } from "../services/certificate.js";

const apply = process.argv.includes("--apply");

try {
  const ratings = await prisma.userRating.findMany({
    where: {
      deletedAt: null,
      finalScore: {
        deletedAt: null,
        isInvalidated: false,
        status: { status: "SUCCESS" },
      },
    },
    select: { finalScoreId: true },
  });
  const ids = [...new Set(ratings.map((rating) => rating.finalScoreId).filter(Boolean))];
  let created = 0;
  let skipped = 0;
  for (const id of ids) {
    const existing = await prisma.certificate.findFirst({
      where: { finalScoreId: id, status: "VALID" },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }
    if (!apply) {
      console.log(`Would issue certificate for finalScore ${id}`);
      continue;
    }
    try {
      const certificate = await prisma.$transaction((tx) => issueCertificate(tx, id));
      console.log(`Issued ${certificate.number} for finalScore ${id}`);
      created++;
    } catch (error) {
      console.warn(`Skipped finalScore ${id}: ${error.message}`);
      skipped++;
    }
  }
  console.log(JSON.stringify({ apply, candidates: ids.length, created, skipped }));
} finally {
  await prisma.$disconnect();
}
