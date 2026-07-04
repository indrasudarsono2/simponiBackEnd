import prisma from "./lib/prisma.js";

const dutyReportId = Number(process.argv[2] || 27);

const dutyReport = await prisma.dutyReport.findFirst({
  where: { id: dutyReportId, deletedAt: null },
  include: {
    supervisorCwp: {
      include: {
        cwpSupervisors: {
          where: { deletedAt: null },
          include: {
            cwp: {
              include: {
                rating: true,
                cwpFrequencies: {
                  where: { deletedAt: null },
                  include: {
                    statusFrequencies: {
                      where: { dutyReportId, deletedAt: null },
                      include: { statusFreq: true },
                      orderBy: { updatedAt: "desc" },
                    },
                  },
                  orderBy: [{ isPrimary: "desc" }, { frequency: "asc" }],
                },
              },
            },
          },
        },
      },
    },
    statusFrequencies: {
      where: { deletedAt: null },
      include: { statusFreq: true },
    },
  },
});

const statusFrequencyMap = new Map(
  (dutyReport?.statusFrequencies || [])
    .filter((statusFrequency) => statusFrequency.cwpFrequencyId)
    .map((statusFrequency) => [statusFrequency.cwpFrequencyId, statusFrequency]),
);

const rows = (dutyReport?.supervisorCwp?.cwpSupervisors || []).flatMap((cwpSupervisor) =>
  (cwpSupervisor.cwp?.cwpFrequencies || []).map((cwpFrequency) => {
    const statusFrequency =
      statusFrequencyMap.get(cwpFrequency.id) ||
      cwpFrequency.statusFrequencies?.[0] ||
      null;

    return {
      cwp: cwpSupervisor.cwp?.cwp,
      cwpFrequencyId: cwpFrequency.id,
      frequency: cwpFrequency.frequency,
      statusFreqId: statusFrequency?.statusFreqId || null,
      status: statusFrequency?.statusFreq?.status || null,
      remark: statusFrequency?.remark || "",
    };
  }),
);

console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
