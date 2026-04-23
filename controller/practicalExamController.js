import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

dayjs.extend(utc);

const getPractical = async(req, res) => {
  try {
    const userN = req.user.nik
    // const userN = "10077770"
    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        appRatings: {
          some: {
            finalScores:{
              some: {
                statusId: {
                  in: [5, 7]
                },
                groupMember: {
                  group: {
                    checkerGroups: {
                      some: {
                        checker: userN
                      }
                    }
                  }
                }
              }
            },
          }
        }
      },
      select: {
        id: true,
        number: true,
        user: {
          select: {
            name: true
          }
        },
        appRatings: {
          where: {
            deletedAt: null,
            finalScores: {
              some: {
                statusId: {
                  in: [5,7]
                }
              }
            }
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
            },
            practicalTests: {
              where: {
                deletedAt: null,
                checkerGroup: {
                  checker: userN
                }
              },
              select: {
                id: true,
                score: true,
                file: true,
                kindOfPractical: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    kind: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json({applicationDoc})
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const putPractical = async (req, res) => {
  try {
    const {id} = req.params
    const {score} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null

    const existingPractialTest = await prisma.practicalTest.findFirst({
      where: {
        id: parseInt(id),
      },
      select: {
        file: true
      }
    })

    if(file && existingPractialTest && existingPractialTest.file){
      const oldFile = path.join(process.cwd(), existingPractialTest.file)
      if(fs.existsSync(oldFile)){
        await fs.promises.unlink(oldFile)
      }
    }

    const putPrac = {
      score: parseInt(score)
    }

    if(file){
      putPrac.file = `/uploads/practicalTest/${file.filename}`
    }

    await prisma.practicalTest.update({
      where: {
        id: parseInt(id)
      },
      data: putPrac
    })

    res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
}

export {getPractical, putPractical};