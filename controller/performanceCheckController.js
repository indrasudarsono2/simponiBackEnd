import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getEvent = async (req, res) => {

  // const branchUnitId = req.user.branchUnitId
  const sectorId = req.user.sectorId
  // const sectorId = 8
  const userN = req.user.nik
  // const userN = "10077770"

  try {
    const event = await prisma.event.findMany({
      where: {
        sectorId,
        groups: {
          some: {
            checkerGroups: {
              some: {
                deletedAt: null,
                checker: userN
              }
            }
          }
        }
      },
      select: {
        id: true,
        event: true,
        sector: {
          where: {
            deletedAt: null
          },
          select: {
            sector: true,
            branchUnit: {
              select: {
                unit: true
              }
            },
          }
        },
        remarkDoc: {
          where: {
            deletedAt: null
          },
          select: {
            remark: true
          }
        },
        session: {
          where: {
            deletedAt: null
          },
          select: {
            session: true
          }
        },
        groups: {
          where: {
            deletedAt: null,
            checkerGroups: {
              some: {
                checker: userN
              }
            }
          },
          select: {
            id: true,
            group: true,
            groupMembers: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
                userMember: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    name: true,
                  }
                },
                finalScores: {
                  where: {
                    deletedAt: null,
                    isInvalidated: false,
                    statusId: 3
                  },
                  select: {
                    id: true,
                    essayScore: true,
                    essayCorrections: {
                      where: {
                        deletedAt: null,
                        checker: null,
                        score: null
                      },
                      select: {
                        id: true,
                        answer: true,
                        essay: {
                          where: {
                            deletedAt: null,
                          },
                          select: {
                            id: true,
                            question: true,
                            answer: true,
                            image: true,
                            value: true
                          }
                        }
                      }
                    }
                  }
                },
                essayCorrections: {
                  where: {
                    deletedAt: null,
                    checker: userN,
                  },
                  select: {
                    id: true,
                    essay: {
                      select: {
                        question: true,
                        value: true
                      }
                    },
                    answer: true,
                    score: true,
                  }
                }
              }
            }
          }
        },
        eventQuestions: {
          where: {
            deletedAt: null,
            kindOfQuestionId: 1
          },
          select: {
            id: true,
            persentage: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json({event});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postEssayAnswer = async (req, res) => {
  try {
    const {finalScoreId, persentage, essayCorrection} = req.body
    
    const score = essayCorrection.map(i => i.score)
    const sumScore = score.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    
    const value = essayCorrection.map(j => j.value)
    const sumValue = value.reduce((accumulator, currentValue) => accumulator + currentValue, 0);

    const essayScore = sumScore/sumValue*100*persentage
    await prisma.$transaction(
      essayCorrection.map((item) =>
        prisma.essayCorrection.update({
          where: { id: item.essayCorrectionId },
          data: { score: item.score, checker:req.user.nik }
        })
      )
    );

    const finalScoreUpdate = await prisma.finalScore.update({
      where: {
        id: finalScoreId
      },
      data: {
        statusId: 4,
        essayScore: essayScore,
        finalScore: essayScore
      }
    })

    await prisma.appRating.update({
      where: {
        id: finalScoreUpdate.appRatingId
      },
      data: {
        statusId: 4
      }
    })

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getEvent, postEssayAnswer };
