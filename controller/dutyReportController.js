import prisma from "../lib/prisma.js";

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

const parseLocalDate = (value = "") => {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const parseLocalDateRange = (value = "") => {
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }

  return { start, end };
};

const parseDutyReportDateWindow = (value = "") => {
  const range = parseLocalDateRange(value);

  if (!range) return null;

  return {
    start: range.start,
    end: new Date(range.end.getTime() - 1),
  };
};

const formatTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const parseTimeToMinutes = (value) => {
  const time = formatTime(value);
  if (!time) return null;

  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const sortShiftDetails = (shiftDetails = []) =>
  [...shiftDetails].sort((first, second) => {
    const firstStart = parseTimeToMinutes(first.start);
    const firstEnd = parseTimeToMinutes(first.end);
    const secondStart = parseTimeToMinutes(second.start);
    const secondEnd = parseTimeToMinutes(second.end);
    const firstIsOvernight =
      firstStart !== null && firstEnd !== null && firstStart > firstEnd;
    const secondIsOvernight =
      secondStart !== null && secondEnd !== null && secondStart > secondEnd;

    if (firstIsOvernight !== secondIsOvernight) {
      return firstIsOvernight ? -1 : 1;
    }

    return (firstStart ?? 0) - (secondStart ?? 0);
  });

const serializeShiftDetail = (shift) => ({
  ...shift,
  start: formatTime(shift.start),
  end: formatTime(shift.end),
});

const serializeShiftName = (shiftName) =>
  shiftName
    ? {
        ...shiftName,
        shifts: sortShiftDetails(shiftName.shifts || []).map(serializeShiftDetail),
      }
    : null;

const serializeDutyReport = (dutyReport) => ({
  ...dutyReport,
  shiftDate: formatLocalDate(dutyReport.shiftDate),
  shiftName: serializeShiftName(dutyReport.shiftName),
});

const verifyDutyReportBranchUnit = async (branchUnitId, dutyReportId) => {
  if (!branchUnitId || !dutyReportId) return null;

  return prisma.dutyReport.findFirst({
    where: {
      id: dutyReportId,
      deletedAt: null,
      supervisorCwp: {
        is: {
          branchUnitId,
          deletedAt: null,
        },
      },
    },
    include: {
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
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
                    cwpFrequencies: {
                    where: {
                      deletedAt: null,
                    },
                    include: {
                        statusFrequencies: {
                        where: {
                          deletedAt: null,
                          dutyReportId,
                        },
                        include: {
                          statusFreq: true,
                          dutyReport: true,
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
    },
  });
};

const getShiftNameWithDetails = async (branchUnitId, shiftNameId) =>
  prisma.shiftName.findFirst({
    where: {
      id: shiftNameId,
      branchUnitId,
      deletedAt: null,
    },
    include: {
      shifts: {
        where: {
          deletedAt: null,
        },
      },
    },
  });

const getDutyReports = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const shiftDate = parseLocalDate(req.query.date);
    const shiftDateRange = parseDutyReportDateWindow(req.query.date);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!req.query.date) {
      return res.json([]);
    }

    if (!shiftDate || !shiftDateRange) {
      return res.status(400).json({
        message: "Date must use yyyy-mm-dd format in local time.",
      });
    }

    const dutyReports = await prisma.dutyReport.findMany({
      where: {
        deletedAt: null,
        shiftDate: {
          gte: shiftDateRange.start,
          lte: shiftDateRange.end,
        },
        supervisorCwp: {
          is: {
            branchUnitId,
          },
        },
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
              },
              include: {
                cwp: {
                  include: {
                    rating: true,
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
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
        onGoingIssue: {
          include: {
            equipment: true,
          },
        },
        onGoingIssueLinks: {
          where: {
            deletedAt: null,
            onGoingIssue: {
              is: {
                deletedAt: null,
              },
            },
          },
          include: {
            onGoingIssue: {
              include: {
                equipment: true,
                reporterUser: {
                  select: {
                    nik: true,
                    name: true,
                  },
                },
                messages: {
                  where: {
                    deletedAt: null,
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                },
              },
            },
          },
          orderBy: {
            attachedAt: "asc",
          },
        },
        spv: {
          select: {
            name: true,
            nik: true,
          },
        },
      },
      orderBy: [
        {
          shiftDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    res.json(dutyReports.map(serializeDutyReport));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDutyReportRecap = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = req.user?.nik;
    const shiftDate = parseLocalDate(req.query.date);

    if (!branchUnitId || !supervisor) {
      return res.status(401).json({ message: "User data is missing." });
    }

    if (!req.query.date) {
      return res.json([]);
    }

    if (!shiftDate) {
      return res.status(400).json({
        message: "Date must use yyyy-mm-dd format in local time.",
      });
    }

    const dutyReports = await prisma.dutyReport.findMany({
      where: {
        deletedAt: null,
        supervisor,
        shiftDate,
        supervisorCwp: {
          is: {
            branchUnitId,
          },
        },
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
              },
              include: {
                cwp: {
                  include: {
                    rating: true,
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
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
        onGoingIssue: {
          include: {
            equipment: true,
          },
        },
        onGoingIssueLinks: {
          where: {
            deletedAt: null,
            onGoingIssue: {
              is: { deletedAt: null },
            },
          },
          include: {
            onGoingIssue: {
              include: {
                equipment: true,
                reporterUser: {
                  select: { nik: true, name: true },
                },
                messages: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                },
              },
            },
          },
          orderBy: { attachedAt: "asc" },
        },
        spv: {
          select: {
            name: true,
            nik: true,
          },
        },
        logBooks: {
          where: {
            deletedAt: null,
          },
          include: {
            user: {
              select: {
                name: true,
                nik: true,
              },
            },
            cwp: true,
            shift: true,
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
        },
        lhdReports: {
          where: { deletedAt: null },
          include: {
            lhdBook: {
              select: { id: true, code: true, lhd: true },
            },
          },
          orderBy: [{ time: "asc" }, { createdAt: "asc" }],
        },
        otherReports: {
          where: { deletedAt: null },
          orderBy: [{ time: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [
        {
          shiftDate: "desc",
        },
        {
          shiftNameId: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });

    res.json(
      dutyReports.map((dutyReport) => {
        const serializedDutyReport = serializeDutyReport(dutyReport);

        return {
          ...serializedDutyReport,
          supervisorCwp: serializedDutyReport.supervisorCwp
            ? {
                ...serializedDutyReport.supervisorCwp,
                cwpSupervisors: (
                  serializedDutyReport.supervisorCwp.cwpSupervisors || []
                ).map((cwpSupervisor) => ({
                  ...cwpSupervisor,
                  cwp: cwpSupervisor.cwp
                    ? {
                        ...cwpSupervisor.cwp,
                        cwpFrequencies: (
                          cwpSupervisor.cwp.cwpFrequencies || []
                        ).map((cwpFrequency) => ({
                          ...cwpFrequency,
                          statusFrequencies: (
                            cwpFrequency.statusFrequencies || []
                          ).filter(
                            (statusFrequency) =>
                              statusFrequency.dutyReportId === dutyReport.id,
                          ),
                        })),
                      }
                    : null,
                })),
              }
            : null,
        };
      }),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createSupervisorDutyReport = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = req.user?.nik;
    const supervisorId = parsePositiveInt(req.body.supervisorId);
    const shiftNameId = parsePositiveInt(req.body.shiftNameId);
    const shiftDate = parseLocalDate(req.body.date);

    if (!branchUnitId || !supervisor) {
      return res.status(401).json({ message: "User data is missing." });
    }

    if (!supervisorId || !shiftNameId || !req.body.date) {
      return res.status(400).json({
        message: "Supervisor, shift, and date are required.",
      });
    }

    if (!shiftDate) {
      return res.status(400).json({
        message: "Date must use yyyy-mm-dd format in local time.",
      });
    }

    const supervisorData = await prisma.supervisor.findFirst({
      where: {
        id: supervisorId,
        branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!supervisorData) {
      return res.status(404).json({ message: "Supervisor not found." });
    }

    const shiftName = await getShiftNameWithDetails(branchUnitId, shiftNameId);

    if (!shiftName) {
      return res.status(404).json({ message: "Shift not found." });
    }

    const existingDutyReport = await prisma.dutyReport.findFirst({
      where: {
        supervisorId,
        shiftNameId,
        shiftDate,
        deletedAt: null,
      },
    });

    if (existingDutyReport) {
      return res.json({
        success: true,
        alreadyExists: true,
        message: "Duty report already exists for this shift, supervisor, and date.",
        dutyReport: serializeDutyReport(existingDutyReport),
      });
    }

    const dutyReport = await prisma.dutyReport.create({
      data: {
        supervisorId,
        shiftNameId,
        shiftDate,
        supervisor,
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
              },
              include: {
                cwp: {
                  include: {
                    rating: true,
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
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
        onGoingIssue: {
          include: {
            equipment: true,
          },
        },
        spv: {
          select: {
            name: true,
            nik: true,
          },
        },
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
    });

    res.status(201).json({
      success: true,
      dutyReport: serializeDutyReport(dutyReport),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDutyReportDeletionSummary = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const dutyReportId = parsePositiveInt(req.params.id);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Valid duty report ID is required." });
    }

    const dutyReport = await prisma.dutyReport.findFirst({
      where: {
        id: dutyReportId,
        deletedAt: null,
        supervisorCwp: { is: { branchUnitId, deletedAt: null } },
      },
      select: {
        id: true,
        shiftDate: true,
        onGoingIssueId: true,
        supervisorCwp: { select: { supervisor: true } },
        shiftName: { select: { shift: true } },
        onGoingIssueLinks: {
          where: { deletedAt: null },
          select: { onGoingIssueId: true },
        },
      },
    });

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const [statusFrequencies, logBooks, lhdReports, otherReports] = await Promise.all([
      prisma.statusFrequency.count({
        where: { dutyReportId, deletedAt: null },
      }),
      prisma.logBook.count({ where: { dutyReportId, deletedAt: null } }),
      prisma.lhdReport.count({ where: { dutyReportId, deletedAt: null } }),
      prisma.otherReport.count({ where: { dutyReportId, deletedAt: null } }),
    ]);

    const issueIds = new Set(
      dutyReport.onGoingIssueLinks.map((link) => link.onGoingIssueId),
    );
    if (dutyReport.onGoingIssueId) issueIds.add(dutyReport.onGoingIssueId);

    res.json({
      dutyReport: {
        id: dutyReport.id,
        shiftDate: formatLocalDate(dutyReport.shiftDate),
        supervisorAssignment: dutyReport.supervisorCwp?.supervisor || null,
        shift: dutyReport.shiftName?.shift || null,
      },
      dependencies: {
        onGoingIssues: issueIds.size,
        statusFrequencies,
        logBooks,
        lhdReports,
        otherReports,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteDutyReport = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const dutyReportId = parsePositiveInt(req.params.id);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Valid duty report ID is required." });
    }

    const dutyReport = await verifyDutyReportBranchUnit(branchUnitId, dutyReportId);
    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const deletedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const [statusFrequencies, logBooks, lhdReports, otherReports, issueLinks] =
        await Promise.all([
          tx.statusFrequency.updateMany({
            where: { dutyReportId, deletedAt: null },
            data: { deletedAt },
          }),
          tx.logBook.updateMany({
            where: { dutyReportId, deletedAt: null },
            data: { deletedAt },
          }),
          tx.lhdReport.updateMany({
            where: { dutyReportId, deletedAt: null },
            data: { deletedAt },
          }),
          tx.otherReport.updateMany({
            where: { dutyReportId, deletedAt: null },
            data: { deletedAt },
          }),
          tx.dutyReportOnGoingIssue.updateMany({
            where: { dutyReportId, deletedAt: null },
            data: { deletedAt },
          }),
        ]);

      await tx.dutyReport.update({
        where: { id: dutyReportId },
        data: { deletedAt },
      });

      return {
        statusFrequencies: statusFrequencies.count,
        logBooks: logBooks.count,
        lhdReports: lhdReports.count,
        otherReports: otherReports.count,
        issueLinks: issueLinks.count,
      };
    });

    res.json({
      success: true,
      message: "Duty report and its related operational records were deleted.",
      deleted: result,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTodayLocalDate = () => {
  const now = new Date();
  return new Date(Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
  ));
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

const getMyDutyReports = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = req.user?.nik;
    const { start, end } = getTodayLocalDateRange();

    if (!branchUnitId || !supervisor) {
      return res.status(401).json({ message: "User data is missing." });
    }

    const dutyReports = await prisma.dutyReport.findMany({
      where: {
        supervisor,
        shiftDate: {
          gte: start,
          lt: end,
        },
        deletedAt: null,
        supervisorCwp: {
          is: {
            branchUnitId,
            deletedAt: null,
          },
        },
        shiftName: {
          branchUnitId,
          deletedAt: null,
        },
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
              },
              include: {
                cwp: {
                  include: {
                    rating: true,
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
                    cwpFrequencies: {
                      where: {
                        deletedAt: null,
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
        onGoingIssue: {
          include: {
            equipment: true,
          },
        },
        spv: {
          select: {
            name: true,
            nik: true,
          },
        },
      },
      orderBy: [
        {
          shiftDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    res.json(
      dutyReports.map((dutyReport) => {
        const serializedDutyReport = serializeDutyReport(dutyReport);
        const frequencyStatus = dutyReport.supervisorCwp
          ? [
              {
                ...dutyReport.supervisorCwp,
                cwpSupervisors: (
                  dutyReport.supervisorCwp.cwpSupervisors || []
                ).map((cwpSupervisor) => ({
                  ...cwpSupervisor,
                  cwp: cwpSupervisor.cwp
                    ? {
                        ...cwpSupervisor.cwp,
                        cwpFrequencies: (
                          cwpSupervisor.cwp.cwpFrequencies || []
                        ).map((cwpFrequency) => ({
                          ...cwpFrequency,
                          statusFrequencies: (
                            cwpFrequency.statusFrequencies || []
                          ).filter(
                            (statusFrequency) =>
                              statusFrequency.dutyReportId === dutyReport.id,
                          ),
                        })),
                      }
                    : null,
                })),
              },
            ]
          : [];

        return {
          ...serializedDutyReport,
          frequencyStatus,
        };
      }),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getStatusFreqOptions = async (req, res) => {
  try {
    const statusOptions = await prisma.statusFreq.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: {
        status: "asc",
      },
    });

    res.json(statusOptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDutyReportFrequencies = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Duty report is required." });
    }

    const dutyReport = await prisma.dutyReport.findFirst({
      where: {
        id: dutyReportId,
        deletedAt: null,
        supervisorCwp: {
          is: {
            branchUnitId,
            deletedAt: null,
          },
        },
      },
      include: {
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
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
                    cwpFrequencies: {
                      where: {
                        deletedAt: null,
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
        statusFrequencies: {
          where: {
            deletedAt: null,
          },
          include: {
            statusFreq: true,
            dutyReport: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        },
      },
    });

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const statusOptions = await prisma.statusFreq.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: {
        status: "asc",
      },
    });

    const statusFrequencyMap = new Map(
      (dutyReport.statusFrequencies || [])
        .filter((statusFrequency) => statusFrequency.cwpFrequencyId)
        .map((statusFrequency) => [
          statusFrequency.cwpFrequencyId,
          statusFrequency,
        ]),
    );

    const rows = (dutyReport.supervisorCwp?.cwpSupervisors || []).flatMap(
      (cwpSupervisor) =>
        (cwpSupervisor.cwp?.cwpFrequencies || []).map((cwpFrequency) => {
        const cwp = cwpSupervisor.cwp;
        const statusFrequency =
          statusFrequencyMap.get(cwpFrequency.id) ||
          cwpFrequency.statusFrequencies?.[0] ||
          null;

        return {
          cwpId: cwp?.id || null,
          cwp: cwp?.cwp || null,
          rating: cwp?.rating?.rating || null,
          cwpFrequencyId: cwpFrequency.id,
          frequency: cwpFrequency.frequency,
          isPrimary: cwpFrequency.isPrimary,
          statusFrequencyId: statusFrequency?.id || null,
          statusFreqId: statusFrequency?.statusFreqId || null,
          status: statusFrequency?.statusFreq?.status || null,
          remark: statusFrequency?.remark || "",
        };
      }),
    );

    res.json({
      dutyReportId,
      statusOptions,
      statusFrequencies: dutyReport.statusFrequencies || [],
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const saveDutyReportFrequency = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const cwpFrequencyId = parsePositiveInt(req.params.cwpFrequencyId);
    const statusFreqId = parsePositiveInt(req.body.statusFreqId);
    const remark = String(req.body.remark || "").trim();

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!dutyReportId || !cwpFrequencyId) {
      return res.status(400).json({
        message: "Duty report and frequency are required.",
      });
    }

    if (!statusFreqId) {
      return res.status(400).json({ message: "Status frequency is required." });
    }

    const dutyReport = await verifyDutyReportBranchUnit(branchUnitId, dutyReportId);

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const relatedCwpFrequencyIds = new Set(
      (dutyReport.supervisorCwp?.cwpSupervisors || []).flatMap((cwpSupervisor) =>
        (cwpSupervisor.cwp?.cwpFrequencies || []).map(
          (cwpFrequency) => cwpFrequency.id,
        ),
      ),
    );

    if (!relatedCwpFrequencyIds.has(cwpFrequencyId)) {
      return res.status(403).json({
        message: "Selected frequency is not related to this duty report.",
      });
    }

    const statusFreq = await prisma.statusFreq.findFirst({
      where: {
        id: statusFreqId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!statusFreq) {
      return res.status(404).json({ message: "Status frequency not found." });
    }

    const existingStatusFrequency = await prisma.statusFrequency.findFirst({
      where: {
        dutyReportId,
        cwpFrequencyId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
      orderBy: {
        id: "desc",
      },
    });

    const statusFrequency = existingStatusFrequency
      ? await prisma.statusFrequency.update({
          where: {
            id: existingStatusFrequency.id,
          },
          data: {
            statusFreqId,
            remark,
          },
          include: {
            statusFreq: true,
            dutyReport: true,
          },
        })
      : await prisma.statusFrequency.create({
          data: {
            dutyReportId,
            cwpFrequencyId,
            statusFreqId,
            remark,
          },
          include: {
            statusFreq: true,
            dutyReport: true,
          },
        });

    res.json({
      success: true,
      message: "Frequency status has been saved.",
      statusFrequency,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getDutyReports,
  getDutyReportRecap,
  createSupervisorDutyReport,
  getDutyReportDeletionSummary,
  deleteDutyReport,
  getMyDutyReports,
  getStatusFreqOptions,
  getDutyReportFrequencies,
  saveDutyReportFrequency,
};
