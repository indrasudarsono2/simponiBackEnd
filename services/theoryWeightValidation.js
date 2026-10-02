import prisma from "../lib/prisma.js";

export const theoryWeightError = async (eventId) => {
  const rows = await prisma.eventQuestion.findMany({
    where: { eventId: Number(eventId), deletedAt: null, kindOfQuestionId: { in: [1, 2] } },
    select: { kindOfQuestionId: true, persentage: true },
  });
  const distinct = new Set(rows.map((row) => row.kindOfQuestionId));
  const total = rows.reduce((sum, row) => sum + Number(row.persentage || 0), 0);
  if (!rows.length || rows.length !== distinct.size || Math.abs(total - 1) > 0.000001) {
    return `Essay and Multiple Choice percentages must total 100% before examination starts. Current total: ${(total * 100).toFixed(0)}%.`;
  }
  return null;
};
