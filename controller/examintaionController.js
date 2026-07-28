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
    essay: {
      deletedAt: null,
      isActive: true,
    },
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

const getRandomMultipleChoiceByGroup = async ({ sectorId, questionGroupId, quantity }) => {
  const takeQty = Number(quantity) || 0;
  if (takeQty <= 0) return [];

  const whereClause = {
    deletedAt: null,
    sectorId,
    questionGroupId,
    multipleChoice: {
      deletedAt: null,
      isActive: true,
    },
  };

  const total = await prisma.mcQuestionGroup.count({
    where: whereClause,
  });

  if (total === 0) return [];

  if (total <= takeQty) {
    return prisma.mcQuestionGroup.findMany({
      where: whereClause,
      select: {
        multipleChoice: {
          select: {
            id: true,
            branchUnitId: true,
            question: true,
            a: true,
            b: true,
            c: true,
            d: true,
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

  const firstBatch = await prisma.mcQuestionGroup.findMany({
    where: whereClause,
    select: {
      multipleChoice: {
        select: {
          id: true,
          branchUnitId: true,
          question: true,
          a: true,
          b: true,
          c: true,
          d: true,
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
  const secondBatch = await prisma.mcQuestionGroup.findMany({
    where: whereClause,
    select: {
      multipleChoice: {
        select: {
          id: true,
          branchUnitId: true,
          question: true,
          a: true,
          b: true,
          c: true,
          d: true,
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

const getRandomMatsQuestions = async ({ appRatingId, eventId }) => {
  const existingSelections = await prisma.matsQuestionSelection.findMany({
    where: { appRatingId, eventId },
    select: {
      multipleChoice: {
        select: { id: true, branchUnitId: true, question: true, a: true, b: true, c: true, d: true, image: true },
      },
    },
    orderBy: { slot: "asc" },
  });
  if (existingSelections.length > 0) {
    return {
      quantity: existingSelections.length,
      questions: existingSelections.map(({ multipleChoice }) => ({ multipleChoice })),
    };
  }

  const configuration = await prisma.matsConfiguration.findUnique({ where: { id: 1 } });
  const quantity = Number(configuration?.quantity) || 0;
  if (quantity <= 0) return { quantity: 0, questions: [] };

  const candidates = await prisma.multipleChoice.findMany({
    where: { isMats: true, isActive: true, deletedAt: null },
    select: { id: true, branchUnitId: true, question: true, a: true, b: true, c: true, d: true, image: true },
  });
  if (candidates.length < quantity) {
    throw new Error(`MATS requires ${quantity} questions, but only ${candidates.length} active questions are available.`);
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
  }
  const selected = candidates.slice(0, quantity);
  await prisma.matsQuestionSelection.createMany({
    data: selected.map(({ id: multipleChoiceId }, slot) => ({ appRatingId, eventId, multipleChoiceId, slot })),
    skipDuplicates: true,
  });
  const persisted = await prisma.matsQuestionSelection.findMany({
    where: { appRatingId, eventId },
    select: {
      multipleChoice: {
        select: { id: true, branchUnitId: true, question: true, a: true, b: true, c: true, d: true, image: true },
      },
    },
    orderBy: { slot: "asc" },
  });
  return { quantity: persisted.length, questions: persisted.map(({ multipleChoice }) => ({ multipleChoice })) };
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
              some: {
                deletedAt: null,
                statusId: 2,
                briefingDate: {
                  not: null
                },
                userNik: userN,
              }
            }
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
            deletedAt: null,
            applicationDocs: {
              some: {
                deletedAt: null,
                appRatings: {
                  some: {
                    statusId: {
                      notIn: [6, 7]
                    }
                  }
                },
                userNik: userN
              }
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
                },
                userNik: userN
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
                        deletedAt: null,
                        isInvalidated: false,
                        statusId: {
                          notIn: [5, 6, 7]
                        }
                      }
                    },
                    examinationInvalidations: {
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      select: {
                        id: true,
                        createdAt: true
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
    const event = await prisma.event.findFirst({
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
              some: {
                deletedAt: null
              }
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
                    },
                    monitorTimes: {
                      where: {
                        deletedAt: null,
                      },
                      select: {
                        time: true
                      }
                    }
                  },
                }
              }
            }
          }
        }
      }
    })

    const takeIt =
      event?.eventUsers?.[0]?.applicationDocs?.[0]?.appRatings?.[0]?.rating
        ?.subBranchUnitRatings?.[0]?.questionGroups || [];

    if (
      !event?.eventUsers?.[0] ||
      !event?.groups?.[0]?.groupMembers?.[0] ||
      takeIt.length === 0
    ) {
      return res.status(404).json({
        message: "Application document data not found for this event user.",
      });
    }

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
    if (!eventQuestion) {
      return res.status(404).json({ message: "Essay event question not found." });
    }
    
    const monitorTime = await prisma.monitorTime.findFirst({
      where: {
        appRatingId,
        eventQuestionId: eventQuestion.id
      }
    })

    const eventUserId = event.eventUsers[0].id
    const groupMemberId = event.groups[0].groupMembers[0].id
    const eventDuration = event.eventQuestions.find(d => d.kindOfQuestionId === 1)?.minutes || 0
    const monitor = event.eventUsers[0].applicationDocs[0].appRatings[0].monitorTimes[0] ? event.eventUsers[0].applicationDocs[0].appRatings[0].monitorTimes : {time: 0};
    const timeLeft = eventDuration-monitor.time
    // const randomNumbers = [];
    const randomNumbers = [1,2,3];
    
    // for (let i = 0; i < 3; i++) {
    //   // Math.random() * (max - min + 1) + min
    //   const pick = Math.floor(Math.random() * ((timeLeft * 0.7) + 1));
    //   randomNumbers.push(pick);
    // }

    randomNumbers.sort((a, b) => a - b);

    res.json({essay, eventQuestion, appRatingId, monitorTime, eventUserId, groupMemberId, eventId, randomNumbers})

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
        finalScores: {
          create: {
            eventId,
            statusId: 3,
            groupMemberId,
            essayScore: 0,
            multipleChoiceScore: 0,
            finalScore: 0,
            essayCorrections: {
              createMany: {
                data: essay.map(e => ({groupMemberId, essayId: e.essayId, answer:e.answer, appRatingId }))
              }
            }
          },
        },
        monitorTimes: {
          deleteMany: {}
        }
      },
    })

    res.status(200).json({message: "success"});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getMultipleChoiceQuestion = async (req, res) => {
  const sect = req.user.sectorId
  // const sect = 8
  const nik = req.user.nik
  // const nik = "10077773"
  try {
    const {eventId, appRatingId} = req.body
    // console.log(eventId, appRatingId)
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
              some: {
                deletedAt: null
              }
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
                                kindOfQuestionId: 2
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
                    },
                    monitorTimes: {
                      where: {
                        deletedAt: null,
                      },
                      select: {
                        time: true
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

    const takeIt =
      event?.eventUsers?.[0]?.applicationDocs?.[0]?.appRatings?.[0]?.rating
        ?.subBranchUnitRatings?.[0]?.questionGroups || [];

    if (
      !event?.eventUsers?.[0] ||
      !event?.groups?.[0]?.groupMembers?.[0]
    ) {
      return res.status(404).json({
        message: "Application document data not found for this event user.",
      });
    }
    
    const multipleChoice = []
    for(let i in takeIt){
      const randomItem = await getRandomMultipleChoiceByGroup({
        sectorId: event.sectorId,
        questionGroupId: takeIt[i].id,
        quantity: takeIt[i].quantity,
      });
      
      takeIt[i].multipleChoice = randomItem
      multipleChoice.push(takeIt[i])
    }

    const mats = await getRandomMatsQuestions({ appRatingId, eventId: event.id });
    if (mats.quantity > 0) {
      multipleChoice.push({
        id: "MATS",
        group: "MATS",
        quantity: mats.quantity,
        isMats: true,
        multipleChoice: mats.questions,
      });
    }

    const eventQuestion = event.eventQuestions.find(d => d.kindOfQuestionId === 2);
    if (!eventQuestion) {
      return res.status(404).json({ message: "Multiple choice event question not found." });
    }
    
    const monitorTime = await prisma.monitorTime.findFirst({
      where: {
        appRatingId,
        eventQuestionId: eventQuestion.id
      }
    })

    const eventUserId = event.eventUsers[0].id
    const groupMemberId = event.groups[0].groupMembers[0].id
    const eventDuration = event.eventQuestions.find(d => d.kindOfQuestionId === 2)?.minutes || 0
    const monitor = event.eventUsers[0].applicationDocs[0].appRatings[0].monitorTimes[0] ? event.eventUsers[0].applicationDocs[0].appRatings[0].monitorTimes[0] : {time: 0};
    const timeLeft = eventDuration-monitor.time
   
    // const randomNumbers = [];
    const randomNumbers = [1,2,3];

    // for (let i = 0; i < 3; i++) {
    //   // Math.random() * (max - min + 1) + min
    //   const pick = Math.floor(Math.random() * ((timeLeft * 0.7) + 1));
    //   randomNumbers.push(pick);
    // }

    randomNumbers.sort((a, b) => a - b);

    res.json({multipleChoice, eventQuestion, appRatingId, monitorTime, eventUserId, groupMemberId, eventId, randomNumbers})

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postMultipleChoiceAnswer = async (req, res) => {
  try {
    const {multipleChoice, appRatingId, eventUserId, groupMemberId, eventId} = req.body
    const event = await prisma.event.findUnique({
      where: {
        id: eventId
      },
      select: {
        id: true,
        passingGrade: true,
        isPractical: true,
        isSimulator: true,
        eventQuestions: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            kindOfQuestionId: true,
            persentage: true,
          }
        },
        forExpiredDate: true
      }
    })

    if (!Array.isArray(multipleChoice) || multipleChoice.length === 0) {
      return res.status(400).json({ message: "Multiple-choice answers are required." });
    }
    const mcId = multipleChoice.map(d => Number(d.multipleChoiceId));
    if (mcId.some((id) => !Number.isInteger(id) || id <= 0) || new Set(mcId).size !== mcId.length) {
      return res.status(400).json({ message: "Invalid or duplicate multiple-choice question IDs." });
    }
    const persentage = event.eventQuestions.find(d => d.kindOfQuestionId ===2)
    if (!persentage) return res.status(400).json({ message: "Multiple-choice event configuration not found." });

    const multipleChoiceDatadbm = await prisma.multipleChoice.findMany({
      where: {
        id: {
          in: mcId
        },
        OR: [
          {
            isMats: true,
            branchUnitId: null,
            matsSelections: { some: { appRatingId, eventId } },
          },
          {
            isMats: false,
            branchUnitId: req.user.branchUnitId,
            deletedAt: null,
            isActive: true,
          },
        ],
      },
      select: {
        id: true,
        question: true,
        a: true,
        b: true,
        c: true,
        d: true,
        key: true,
        isMats: true
      }
    })

    if (multipleChoiceDatadbm.length !== mcId.length) {
      return res.status(400).json({ message: "One or more submitted questions are not valid for this examination." });
    }
    const selectedMats = await prisma.matsQuestionSelection.findMany({
      where: { appRatingId, eventId }, select: { multipleChoiceId: true },
    });
    const submittedMatsIds = multipleChoiceDatadbm.filter((item) => item.isMats).map((item) => item.id).sort((a, b) => a - b);
    const selectedMatsIds = selectedMats.map((item) => item.multipleChoiceId).sort((a, b) => a - b);
    if (submittedMatsIds.length !== selectedMatsIds.length || submittedMatsIds.some((id, index) => id !== selectedMatsIds[index])) {
      return res.status(400).json({ message: "The submitted MATS questions do not match those assigned to this examination." });
    }

    const correction = (multipleChoiceDatadbm, multipleChoice) => {
      let trueOption = 0;
      let falseAnswer = []
      for (let i in multipleChoice){
        const now = multipleChoiceDatadbm.find(d => d.id === Number(multipleChoice[i].multipleChoiceId))
        if (!now) continue;
        if(now.key === multipleChoice[i].answer){
          trueOption++
          multipleChoice[i].isTrue = true
        }else{
          delete now.key
          falseAnswer.push(now)
          multipleChoice[i].isTrue = false
        }
      }

      return {trueOption, falseAnswer}
    }

    const inputAppRating = async (appRatingId, statusAppRating, eventId, statusScore, groupMemberId, essayScore, mcValue, finalValue, multipleChoice, fnlScore, finalScoreId) => {
      const createFinalScore = {
        create: {create: {
            eventId,
            statusId: statusScore,
            groupMemberId,
            essayScore,
            multipleChoiceScore: mcValue,
            finalScore: finalValue,
            multipleChoiceCorrections: {
              createMany: {
                data: multipleChoice.map(m => ({groupMemberId, multipleChoiceId: m.multipleChoiceId, answer: m.answer, appRatingId, isTrue: m.isTrue}))
              }
            }
          },
        },
        update: {update: {
            where: {id: finalScoreId},
            data: {
              eventId,
              statusId: statusScore,
              groupMemberId,
              essayScore,
              multipleChoiceScore: mcValue,
              finalScore: finalValue,
              multipleChoiceCorrections: {
                createMany: {
                  data: multipleChoice.map(m => ({groupMemberId, multipleChoiceId: m.multipleChoiceId, answer: m.answer, appRatingId, isTrue: m.isTrue}))
                }
              }
            }
          }
        }
      }
      const finalScr = createFinalScore[`${fnlScore}`]
      return prisma.appRating.update({
        where: {
          id: appRatingId
        },
        data: {
          statusId: statusAppRating,
          finalScores: finalScr,
          monitorTimes: {
            deleteMany: {}
          }
        },
        include: {
          finalScores: {
            where: { deletedAt: null, isInvalidated: false },
            orderBy: { id: "desc" },
            take: 1
          }
        }
      })
    }

    const inputUserRating = async (ratingId, finalScoreId, expDate) => {
      const existing = await prisma.userRating.findFirst({
        where: { finalScoreId, deletedAt: null }
      });
      if (existing) return existing;
      await prisma.userRating.create({
        data: {
          rating: {
            connect: {
              id: ratingId
            }
          },
          user: {
            connect: {
              nik: req.user.nik
            }
          },
          finalScore: {
            connect: {
              id: finalScoreId
            }
          },
          expireddate: dayjs.utc(expDate).toDate()
        }
      })
    }

    const requiresPractical = event.isPractical || event.isSimulator;
    const waitingPracticalStatus = requiresPractical
      ? await prisma.status.findFirst({
          where: { status: "WAITING PRACTICAL", deletedAt: null },
          select: { id: true }
        })
      : null;
    if (requiresPractical && !waitingPracticalStatus) {
      return res.status(500).json({ message: "WAITING PRACTICAL status is not configured." });
    }

    const {trueOption, falseAnswer} = correction(multipleChoiceDatadbm, multipleChoice);
    const mcValue = trueOption/multipleChoice.length * 100 * persentage.persentage
    const finalScore = await prisma.finalScore.findMany({
      where: {
        eventId,
        appRatingId,
        deletedAt: null,
        isInvalidated: false
      },
      orderBy: {
        id: 'asc'
      },
      include: {
        appRating: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            ratingId: true
          }
        }
      }
    })
    
    if(event.eventQuestions.length > 1){
      // const finalValue = finalScore[finalScore.length - 1].essayScore + mcValue
      const finalValue = 88
      const fnlScore = "update"
      const finalScoreId = finalScore[finalScore.length-1].id;
      const essayScore = finalScore[finalScore.length - 1].essayScore
      const theoryPassed = finalValue >= event.passingGrade;
      const calculatedStatusScore = finalValue < event.passingGrade ? 6 :
                          finalValue >= event.passingGrade &&
                          finalScore[0].statusId !== 6 ? 7 :
                          finalValue >= event.passingGrade &&
                          finalScore[0].statusId === 6 ? 5 : null;
      const calculatedAppRatingStatus = finalScore.length === 1 && finalValue >= event.passingGrade ? 7 :
                              finalScore.length === 1 && finalValue < event.passingGrade ? 5:
                              finalScore.length > 1 && finalValue >= event.passingGrade ? 7:
                              finalScore.length > 1 && finalValue < event.passingGrade ? 6 : null;
      const statusScore = theoryPassed && requiresPractical
        ? waitingPracticalStatus.id
        : calculatedStatusScore;
      const statusAppRating = theoryPassed && requiresPractical
        ? waitingPracticalStatus.id
        : calculatedAppRatingStatus;
      await inputAppRating(appRatingId, statusAppRating, eventId, statusScore, groupMemberId, essayScore, mcValue, finalValue, multipleChoice, fnlScore, finalScoreId)
      
      const essayCorrection = await prisma.essayCorrection.findMany({
        where: {
          finalScoreId: finalScore[finalScore.length - 1].id
        },
        select: {
          id: true,
          essay: {
            where: {
              deletedAt: null
            },
            select: {
              id: true,
              question: true,
              value: true
            }
          },
          score: true,
          checkerUser: {
            where: {
              deletedAt: null
            },
            select: {
              name: true
            }
          }
        }
      })

      if(theoryPassed && !requiresPractical){
        const ratId = finalScore[finalScore.length - 1].appRating.ratingId
        await inputUserRating(ratId, finalScoreId, event.forExpiredDate)
      }
      const passingGrade = event.passingGrade
      // const json = {
      //   falseAnswer,
      //   finalValue,
      //   essayCorrection
      // }
      // const string = JSON.stringify(json, null, 2)
      // fs.writeFileSync('../exam.json', string, 'utf-8');
      res.status(200).json({falseAnswer, finalValue, essayCorrection, passingGrade, awaitingPractical: theoryPassed && requiresPractical});
    }else{
      const previousStatusId = finalScore[0]?.statusId;
      const theoryPassed = mcValue >= event.passingGrade;
      const calculatedStatusScore = mcValue < event.passingGrade ? 6 :
                          mcValue >= event.passingGrade && 
                          previousStatusId !== 6 ? 7 : 
                          mcValue >= event.passingGrade &&
                          previousStatusId === 6 ? 5 : null;
      const calculatedAppRatingStatus = finalScore.length === 1 && mcValue >= event.passingGrade ? 7 :
                              finalScore.length === 1 && mcValue < event.passingGrade ? 5:
                              finalScore.length > 1 && mcValue >= event.passingGrade ? 7:
                              finalScore.length > 1 && mcValue < event.passingGrade ? 6 : null;
      const statusScore = theoryPassed && requiresPractical
        ? waitingPracticalStatus.id
        : calculatedStatusScore;
      const statusAppRating = theoryPassed && requiresPractical
        ? waitingPracticalStatus.id
        : calculatedAppRatingStatus;
      const essayScore = 0
      const finalValue = mcValue
      const fnlScore = "create"
      const updatedAppRating = await inputAppRating(appRatingId, statusAppRating, eventId, statusScore, groupMemberId, essayScore, mcValue, finalValue, multipleChoice, fnlScore)
      if (theoryPassed && !requiresPractical) {
        const createdFinalScore = updatedAppRating.finalScores[0];
        if (createdFinalScore) {
          await inputUserRating(updatedAppRating.ratingId, createdFinalScore.id, event.forExpiredDate);
        }
      }
      res.status(200).json({falseAnswer, finalValue, passingGrade: event.passingGrade, awaitingPractical: theoryPassed && requiresPractical});
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getExamination, getEssayQuestion, postEssayAnswer, getMultipleChoiceQuestion, postMultipleChoiceAnswer };
