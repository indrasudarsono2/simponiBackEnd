import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getIelpCheckerData = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId: branchUnitId
      },
      select: {
        nik: true,
        name: true,
        ielp: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            released: true,
            expired: true,
            institution: true,
            level: true,
            file: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        },
      },
      orderBy: {
        name: 'asc'
      }
    })

    res.json(user)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getMedexCheckerData = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId: branchUnitId
      },
      select: {
        nik: true,
        name: true,
        medex: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            released: true,
            expired: true,
            institution: true,
            file: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        },
      },
      orderBy: {
        name: 'asc'
      }
    })

    res.json(user)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getCompetenceCheckerData = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId: branchUnitId
      },
      select: {
        nik: true,
        name: true,
        competences: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            released: true,
            institution: true,
            file: true,
            rating: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                rating: true
              }
            }
          },
          orderBy: {
            ratingId: 'asc'
          },
        },
      },
      orderBy: {
        name: 'asc'
      }
    })

    res.json(user)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getIelpCheckerData, getMedexCheckerData, getCompetenceCheckerData };
