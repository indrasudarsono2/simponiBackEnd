import prisma from "./lib/prisma.js";

const start = new Date(Date.UTC(2026, 5, 25, 0, 0, 0));
const end = new Date(Date.UTC(2026, 5, 26, 23, 59, 59, 999));
const branchUnitId = 17;

const result = await prisma.dutyReport.findMany({
  where: {
    deletedAt: null,
    shiftDate: { gte: start, lte: end },
    supervisorCwp: { is: { branchUnitId, deletedAt: null } },
    shiftName: { branchUnitId, deletedAt: null },
  },
  include: {
    supervisorCwp: { include: { cwpSupervisors: { include: { cwp: true } } } },
    shiftName: { include: { shifts: true } },
    onGoingIssue: true,
    spv: { select: { nik: true, name: true } },
  },
});

console.log(JSON.stringify({ rowCount: result.length, ids: result.map((row) => row.id) }, null, 2));
await prisma.$disconnect();
