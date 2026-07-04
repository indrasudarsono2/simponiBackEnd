import prisma from "./lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatLocalDate = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getTodayLocalDateRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
  ));
  const end = new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
  ));

  return { start, end };
};

const serializeTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const sortShiftDetails = (shiftDetails = []) =>
  [...shiftDetails].sort((first, second) => {
    const firstStart = serializeTime(first.start) || "00:00";
    const secondStart = serializeTime(second.start) || "00:00";

    return firstStart.localeCompare(secondStart);
  });

const serializeDutyReport = (dutyReport) => ({
  ...dutyReport,
  shiftDate: formatLocalDate(dutyReport.shiftDate),
  shiftName: dutyReport.shiftName
    ? {
        ...dutyReport.shiftName,
        shifts: sortShiftDetails(dutyReport.shiftName.shifts || []).map((shift) => ({
          ...shift,
          start: serializeTime(shift.start),
          end: serializeTime(shift.end),
        })),
      }
    : null,
});

const dutyReportInclude = {
  supervisorCwp: {
    include: {
      cwpSupervisors: {
        where: {
          deletedAt: null,
          cwp: {
            is: {
              deletedAt: null,
            },
          },
        },
        include: {
          cwp: {
            include: {
              rating: true,
              cwpFrequencies: {
                where: {
                  deletedAt: null,
                },
                include: {
                  statusFrequencies: {
                    where: {
                      deletedAt: null,
                    },
                    include: {
                      statusFreq: true,
                    },
                    orderBy: {
                      updatedAt: "desc",
                    },
                  },
                },
                orderBy: [
                  {
                    isPrimary: "desc",
                  },
                  {
                    frequency: "asc",
                  },
                ],
              },
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  },
  shiftName: {
    include: {
      shifts: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
  spv: {
    select: {
      nik: true,
      name: true,
    },
  },
  statusFrequencies: {
    where: {
      deletedAt: null,
    },
    include: {
      statusFreq: true,
      cwpFrequency: {
        include: {
          cwp: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  },
};

const loadDutyReports = async () => {
  const dutyReportId = parsePositiveInt(process.argv[2]);
  const { start, end } = getTodayLocalDateRange();

  const dutyReports = await prisma.dutyReport.findMany({
    where: {
      ...(dutyReportId
        ? { id: dutyReportId }
        : {
            shiftDate: {
              gte: start,
              lt: end,
            },
          }),
      deletedAt: null,
    },
    include: dutyReportInclude,
    orderBy: [
      {
        shiftDate: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  console.log(JSON.stringify(dutyReports.map(serializeDutyReport), null, 2));
};

loadDutyReports()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
