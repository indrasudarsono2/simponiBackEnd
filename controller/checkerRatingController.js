import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getChecker = async (req, res) => {
  // const sect = 1
  const sect = req.user.sectorId
  // const userN = "10011520"
  const userN = req.user.nik
  // const branchUnitId = 5
  const branchUnitId = req.user.branchUnitId
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId: branchUnitId,
        userRoles: {
          some: {
            roleId: 5
          }
        }
      },
      select: {
        nik: true,
        name: true,
        userRoles: {
          where: {
            deletedAt: null,
            roleId: 5
          },
          select: {
            id: true,
            checkerRatings: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
                rating: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    rating: true
                  }
                }
              }
            }
          }
        },
        sector: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            subBranchUnitRatings: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
                rating: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    rating: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    })

    res.json({user});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postCheckerRating = async (req, res) => {
  try {
    const {nik, ratingId, userRoleId} = req.body

    await prisma.userRoles.update({
      where: {
        id: userRoleId
      },
      data: {
        checkerRatings: {
          deleteMany: {},
          createMany: {
            data: ratingId.map(id => ({ratingId:id}))
          }
        }
      }
    })

    res.json({message: "oke"})
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
}

export { getChecker, postCheckerRating };