import prisma from "../lib/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);

const getELogbookUser = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const nik = req.user.nik;

    const whereClause = {
      deletedAt: null,
      userNik: nik,
    };

    if (startDate || endDate) {
      whereClause.dutyReport = {};

      if (startDate) {
        whereClause.dutyReport.shiftDate = {
          gte: dayjs.utc(startDate).startOf("day").toDate(),
        };
      }

      if (endDate) {
        whereClause.dutyReport.shiftDate = {
          ...(whereClause.dutyReport.shiftDate || {}),
          lte: dayjs.utc(endDate).endOf("day").toDate(),
        };
      }
    }

    const logbook = await prisma.logBook.findMany({
      where: whereClause,
      select: {
        user: {
          select: {
            name: true,
          },
        },
        supervisorLogBook: {
          select: {
            name: true,
          },
        },
        cwp: {
          select: {
            cwp: true,
            rating: {
              select: {
                rating: true,
              },
            },
          },
        },
        shift: {
          select: {
            shiftName: {
              select: {
                shift: true,
              },
            },
          },
        },
        isFinal: true,
        duration: true,
        dutyReport: {
          select: {
            shiftDate: true,
          },
        },
        timeIn: true,
        timeOut: true
      },
      orderBy: {
        createdAt: "asc",
      },
    });
   
    res.json(logbook);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getELogbookUser };

