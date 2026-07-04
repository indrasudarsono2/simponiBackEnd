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

/**
 * GET /personalLogbook/users
 * Returns users who share the same branchUnitId as the logged-in user.
 */
const getUsersByBranchUnit = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const users = await prisma.user.findMany({
      where: {
        branchUnitId,
        deletedAt: null,
      },
      select: {
        nik: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET /personalLogbook
 * Returns personal logbook entries for a specific user within a date range.
 * Query params: startDate (YYYY-MM-DDTHH:mm:ss), endDate (YYYY-MM-DDTHH:mm:ss), userNik
 */
const getPersonalLogbook = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const { startDate, endDate, userNik } = req.query;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Valid startDate and endDate are required." });
    }

    if (!userNik) {
      return res.status(400).json({ message: "User NIK is required." });
    }

    // Verify the requested user belongs to the same branchUnitId
    const targetUser = await prisma.user.findFirst({
      where: {
        nik: userNik,
        branchUnitId,
        deletedAt: null,
      },
      select: {
        nik: true,
        name: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ message: "User not found in your branch unit." });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format for startDate or endDate." });
    }

    const logBooks = await prisma.logBook.findMany({
      where: {
        userNik,
        deletedAt: null,
        dutyReport: {
          shiftDate: {
            gte: start,
            lte: end,
          },
          deletedAt: null,
        },
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
        dutyReport: {
          select: {
            id: true,
            shiftDate: true,
            spv: {
              select: {
                name: true,
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
          },
        },
      },
      orderBy: {
        timeIn: "asc",
      },
    });

    // Serialize dates/times
    const serialized = logBooks.map((logBook) => ({
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
      dutyReport: logBook.dutyReport
        ? {
            ...logBook.dutyReport,
            shiftDate: formatLocalDate(logBook.dutyReport.shiftDate),
            shiftName: logBook.dutyReport.shiftName
              ? {
                  ...logBook.dutyReport.shiftName,
                  shifts: logBook.dutyReport.shiftName.shifts?.map((s) => ({
                    ...s,
                    start: formatTime(s.start),
                    end: formatTime(s.end),
                  })),
                }
              : null,
          }
        : null,
    }));

    res.json({ logBooks: serialized, user: targetUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getUsersByBranchUnit, getPersonalLogbook };