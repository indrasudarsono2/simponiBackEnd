import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getRandomEssayByGroup = async ({ sectorId, questionGroupId, quantity }) => {
  const takeQty = Number(quantity) || 0;
  if (takeQty <= 0) return [];

  const whereClause = {
    deletedAt: null,
    sectorId,
    questionGroupId,
  };

  const total = await prisma.essayQuestionGroup.count({
    where: whereClause,
  });

  if (total === 0) return [];

  if (total <= takeQty) {
    return prisma.essayQuestionGroup.findMany({
      where: whereClause,
      select: {
        essay: {
          select: {
            id: true,
            branchUnitId: true,
            question: true,
            image: true
          }
        }
      },
      orderBy: {
        id: "asc",
      },
    });
  }

  const skip = Math.floor(Math.random() * total);

  const firstBatch = await prisma.essayQuestionGroup.findMany({
    where: whereClause,
    select: {
      essay: {
        select: {
            id: true,
            branchUnitId: true,
            question: true,
            image: true
          }
      }
    },
    orderBy: {
      id: "asc",
    },
    skip,
    take: takeQty,
  });

  if (firstBatch.length >= takeQty) return firstBatch;

  const remaining = takeQty - firstBatch.length;
  const secondBatch = await prisma.essayQuestionGroup.findMany({
    where: whereClause,
    select: {
      essay: {
        select: {
            id: true,
            branchUnitId: true,
            question: true,
            image: true
          }
      }
    },
    orderBy: {
      id: "asc",
    },
    take: remaining,
  });

  return [...firstBatch, ...secondBatch];
};

const getExamination = async (req, res) => {
  // const sect = 1
  // const sect = req.user.sectorId
  // const userN = "10077770"
  const userN = req.user.nik
  // const prof = 1
  // const prof = req.user.professionId
  try {
    const now = dayjs.utc().toDate();
    const event = await prisma.event.findFirst({
      where: {
        startDate: {
          lte: now,
        },
        finishDate: {
          gte: now
        },
        eventUsers: {
          some: {
            applicationDocs: {
              deletedAt: null,
              statusId: 2,
              briefingDate: {
                not: null
              },
              userNik: userN,
            },
          }
        }
      },
      select: {
        id: true,
        event: true,
        passingGrade: true,
        eventQuestions: {
          where: {
            deletedAt: null
          }, 
          select: {
            id: true,
            quantity: true,
            persentage: true,
            minutes: true,
            kindOfQuestion: {
              select: {
                question: true
              }
            }
          },
          orderBy: {
            kindOfQuestionId: "asc"
          }
        },
        eventUsers: {
          where: {
            deletedAt:null,
            applicationDocs: {
              isNot:null,
            }
          },
          select: {
            id: true,
            applicationDocs: {
              where: {
                deletedAt: null,
                appRatings: {
                  some: {
                    statusId: {
                      notIn: [6,7]
                    }
                  }
                }
              },
              select: {
                id: true,
                appRatings: {
                  where: {
                    deletedAt: null,
                    statusId: {
                      notIn: [6, 7]
                    }
                  },
                  select: {
                    id: true,
                    rating: true,
                    statusId: true,
                    finalScores: {
                      where: {
                        statusId: {
                          notIn: [5, 6, 7]
                        }
                      }
                    }
                  }
                }
              }
            },
            attendaces: {
              where: {
                deletedAt:null
              },
              select: {
                room:true
              }
            }
          }
        }
      }
    })

    res.json({event})
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEssayQuestion = async (req, res) => {
  const sect = req.user.sectorId
  // const sect = 8
  const nik = req.user.nik
  // const nik = "10077770"
  try {
    const {eventId, appRatingId} = req.body
    
    const event = await prisma.event.findUnique({
      where: {
        id: parseInt(eventId)
      },
      select: {
        id: true,
        sectorId: true,
        eventQuestions: true,
        groups: {
          where: {
            deletedAt: null,
            groupMembers: {
              some: {
                member: nik
              }
            }
          },
          select: {
            groupMembers: {
              where: {
                deletedAt: null,
                member: nik
              },
              select: {
                id: true
              }
            }
          }
        },
        eventUsers: {
          where: {
            deletedAt: null,
            applicationDocs: {
              isNot: null
            },
            userNik: nik
          },
          select: {
            id: true,
            applicationDocs: {
              where: {
                deletedAt: null,
                appRatings: {
                  some: {
                    id: appRatingId
                  }
                }
              },
              select: {
                id: true,
                appRatings: {
                  where: {
                    id: appRatingId,
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    rating: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        rating: true,
                        subBranchUnitRatings: {
                          where: {
                            deletedAt: null,
                            sectorId: sect
                          },
                          select: {
                            id: true,
                            questionGroups: {
                              where: {
                                deletedAt: null,
                                kindOfQuestionId: 1
                              },
                              select: {
                                id: true,
                                quantity: true,
                                group: true
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })

    const takeIt = event.eventUsers[0].applicationDocs.appRatings[0].rating.subBranchUnitRatings[0].questionGroups

    const essay = []
    for(let i in takeIt){
      const randomItem = await getRandomEssayByGroup({
        sectorId: event.sectorId,
        questionGroupId: takeIt[i].id,
        quantity: takeIt[i].quantity,
      });
      
      takeIt[i].essay = randomItem
      essay.push(takeIt[i])
      // break;
    }

    const eventQuestion = event.eventQuestions.find(d => d.kindOfQuestionId === 1);
    
    const monitorTime = await prisma.monitorTime.findFirst({
      where: {
        appRatingId,
        eventQuestionId: eventQuestion.id
      }
    })

    const eventUserId = event.eventUsers[0].id
    const groupMemberId = event.groups[0].groupMembers[0].id
    
    res.json({essay, eventQuestion, appRatingId, monitorTime, eventUserId, groupMemberId, eventId})

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postEssayAnswer = async (req, res) => {
  try {
    const {essay, appRatingId, eventUserId, groupMemberId, eventId} = req.body
    await prisma.appRating.update({
      where: {
        id: appRatingId
      },
      data: {
        statusId: 3,
        essayCorrections: {
          createMany: {
            data: essay.map(e => ({groupMemberId, essayId: e.essayId, answer:e.answer }))
          }
        },
        finalScores: {
          create: {
            eventId,
            statusId: 3,
            essayScore: 0,
            multipleChoiceScore: 0,
            finalScore: 0
          }
        },
        monitorTimes: {
          deleteMany: {}
        }
      },
    })
    // await prisma.essayCorrection.createMany({
    //   data: essay.map(e => ({appRatingId, groupMemberId, essayId: e.essayId, answer:e.answer }))
    // })

    res.status(200).json({message: "success"});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getExamination, getEssayQuestion, postEssayAnswer };
