import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

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

const formatLocalDate = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const getDailyLogbook = async (req, res) => {
  try {
    // GA version: branchId comes from query param, not from user token
    const branchIdParam = req.query.branchId;
    const dateParam = req.query.date;

    if (!branchIdParam) {
      return res.status(400).json({ message: "Branch ID is required." });
    }

    const branchId = Number(branchIdParam);
    if (Number.isNaN(branchId)) {
      return res.status(400).json({ message: "Valid branch ID is required." });
    }

    const parsedDate = parseLocalDate(dateParam);
    if (!parsedDate) {
      return res.status(400).json({ message: "Valid date (YYYY-MM-DD) is required." });
    }

    const shiftDate = dayjs.utc(dateParam).toDate();

    const dailyReport = await prisma.dutyReport.findMany({
      where: {
        deletedAt: null,
        spv: {
          branchUnit: {
            branchId,
          },
        },
        shiftDate,
      },
      select: {
        id: true,
        shiftDate: true,
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
        onGoingIssueLinks: {
          where: {
            deletedAt: null,
            onGoingIssue: {
              is: {
                deletedAt: null,
              },
            },
          },
          select: {
            id: true,
            dutyReportId: true,
            onGoingIssueId: true,
            attachedAt: true,
            onGoingIssue: {
              select: {
                id: true,
                other: true,
                start: true,
                finish: true,
                isClosed: true,
                equipment: {
                  select: {
                    equipment: true,
                  },
                },
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
                  select: {
                    id: true,
                    message: true,
                    createdAt: true,
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
          },
        },
        supervisorCwp: {
          select: {
            id: true,
            supervisor: true,
            cwpSupervisors: {
              select: {
                id: true,
                cwp: {
                  select: {
                    id: true,
                    cwp: true,
                    rating: {
                      select: {
                        rating: true,
                      },
                    },
                    cwpFrequencies: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        frequency: true,
                        isPrimary: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        shiftName: {
          select: {
            id: true,
            shift: true,
            shifts: {
              select: {
                id: true,
                start: true,
                end: true,
                duration: true,
                isControl: true,
              },
            },
          },
        },
        statusFrequencies: {
          select: {
            id: true,
            statusFreq: {
              select: {
                status: true,
              },
            },
            remark: true,
            cwpFrequencyId: true,
            cwpFrequency: {
              where: {
                deletedAt:null
              },
              select: {
                id: true,
                frequency: true,
                isPrimary: true,
                cwp: {
                  select: {
                    id: true,
                    cwp: true,
                  },
                },
              },
            },
          },
        },
        logBooks: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            userNik: true,
            timeIn: true,
            timeOut: true,
            duration: true,
            isFinal: true,
            user: {
              select: {
                nik: true,
                name: true,
              },
            },
            supervisorLogBook: {
              select: {
                nik: true,
                name: true,
              },
            },
            shift: {
              select: {
                id: true,
                start: true,
                end: true,
                duration: true,
                shiftName: {
                  select: {
                    id: true,
                    shift: true,
                  },
                },
              },
            },
            cwp: {
              select: {
                id: true,
                cwp: true,
                rating: {
                  select: {
                    id: true,
                    rating: true,
                  },
                },
              },
            },
          },
        },
        lhdReports: {
          where: { deletedAt: null },
          select: {
            id: true,
            time: true,
            message: true,
            lhdBook: {
              select: { id: true, code: true, lhd: true },
            },
          },
          orderBy: [{ time: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: {
        shiftDate: "asc",
      },
    });

    // Serialize dates/times
    const serialized = dailyReport.map((report) => ({
      ...report,
      shiftDate: formatLocalDate(report.shiftDate),
      logBooks: report.logBooks?.map((logBook) => ({
        ...logBook,
        timeIn: logBook.timeIn ? formatTime(logBook.timeIn) : null,
        timeOut: logBook.timeOut ? formatTime(logBook.timeOut) : null,
        shift: logBook.shift
          ? {
              ...logBook.shift,
              start: formatTime(logBook.shift.start),
              end: formatTime(logBook.shift.end),
            }
          : null,
      })),
    }));

    res.json({ dailyReport: serialized });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getDailyLogbook };
