import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getDashboardOperational = async (req, res) => {
  // const sect = 8
  const sect = req.user.sectorId
  // const userN = "10011520"
  // const userN = "10077770"
  const userN = req.user.nik
  // const prof = 1
  const prof = req.user.professionId
  try {
    const user = await prisma.user.findFirst({
      where: {
        nik: userN
      },
      include: {
        medex: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        },
        ielp: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        },
        eventUsers: {
          where: {
            applicationDocs: {
              some: {
                statusId: 2
              }
            }
          },
          include: {
            event: true,
            applicationDocs: {
              where: {
                deletedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          },
        }
      },
    })

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postDashboardToken = async(req, res) => {
  try {
    const {applicationDocId, token} = req.body
    const now = dayjs.utc().toDate()
    const tokenDb = await prisma.token.findFirst({
      where: {
        branchUnitId: req.user.branchUnitId,
        startDate: {
          lte: now
        },
        expiredDate: {
          gte: now
        }
      }
    })

    if(tokenDb && tokenDb.token === token){
      await prisma.applicationDoc.update({
        where: {
          id: applicationDocId
        },
        data: {
          briefingDate: dayjs.utc().toDate()
        }
      })
      res.json({message: "ok"});
    }else{
      res.json({message: "Invalid token"})
    }
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getDashboardOperational, postDashboardToken};