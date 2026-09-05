import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getRatingSummary = async (req, res) => {
  const branchUnitId = req.user.branchUnitId;
  // const branchUnitId = 17
  try {
    const now = dayjs().utc().toDate();
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId,
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        userRatings: {
          where: {
            deletedAt: null,
            expireddate: {
              gte: now
            }
          },
          select: {
            id: true,
            expireddate: true,
            rating: {
              where: {
                deletedAt: null,
              },
              select: {
                rating: true
              }
            }
          }
        }
      }
    })

    const sortUser = user.sort((a, b) => {
      const nameA = a.name.toUpperCase();
      const nameB = b.name.toUpperCase();

      if (nameA < nameB) {
        return -1
      }

      if (nameA > nameB) {
        return 1
      }
    })

    res.json(sortUser)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getRatingSummary } ;
