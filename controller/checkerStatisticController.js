import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getMember = async (req, res) => {
  // const branchUnitId = 17
  const branchUnitId = req.user.branchUnitId
  try {
    const member = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId
      },
      select: {
        nik: true,
        name: true,
        eventUsers: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            event: {
              where: {
                deletedAt: null,
              },
              select: {
                id: true,
                event: true
              }
            }
          }
        }
      }
    })

    res.json(member)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postMember = async (req, res) => {
  try {
    const { eventUserId } = req.body;

    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        eventUserId: {
          in : eventUserId
        }
      },
      select: {
        id: true,
        number: true,
        appRatings: {
          where: {
            deletedAt: null
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
            finalScores: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                createdAt: true,
                multipleChoiceCorrections: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    isTrue: true,
                    multipleChoice: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        mcQuestionGroups: {
                          where: {
                            deletedAt: null
                          },
                          select: {
                            id: true,
                            questionGroup: {
                              where: {
                                deletedAt: null
                              },
                              select: {
                                id: true,
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

    const allByRatingMap = {};
    const detailByFinalScore = {};

    const ensureGroupBucket = (targetMap, groupName) => {
      if (!targetMap[groupName]) {
        targetMap[groupName] = {
          group: groupName,
          isTrue: 0,
          isFalse: 0,
          total: 0,
          percentageTrue: 0,
        };
      }
    };

    const ensureRatingBucket = (targetMap, ratingName) => {
      const key = ratingName || "UNKNOWN";
      if (!targetMap[key]) {
        targetMap[key] = {
          rating: key,
          statisticMap: {},
        };
      }
    };

    for (const application of applicationDoc) {
      for (const rating of application.appRatings || []) {
        for (const finalScore of rating.finalScores || []) {
          const finalScoreKey = String(finalScore.id);
          if (!detailByFinalScore[finalScoreKey]) {
            detailByFinalScore[finalScoreKey] = {
              finalScoreId: finalScore.id,
              createdAt: finalScore.createdAt,
              number: application.number || null,
              rating: rating.rating?.rating || null,
              groupStatisticsMap: {},
            };
          }

          for (const correction of finalScore.multipleChoiceCorrections || []) {
            const questionGroups = correction.multipleChoice?.mcQuestionGroups || [];

            for (const mcGroup of questionGroups) {
              const groupName = mcGroup.questionGroup?.group;
              if (!groupName) continue;
              const ratingName = rating.rating?.rating || "UNKNOWN";

              ensureRatingBucket(allByRatingMap, ratingName);
              ensureGroupBucket(allByRatingMap[ratingName].statisticMap, groupName);
              ensureGroupBucket(detailByFinalScore[finalScoreKey].groupStatisticsMap, groupName);

              if (correction.isTrue === true) {
                allByRatingMap[ratingName].statisticMap[groupName].isTrue += 1;
                detailByFinalScore[finalScoreKey].groupStatisticsMap[groupName].isTrue += 1;
              } else if (correction.isTrue === false) {
                allByRatingMap[ratingName].statisticMap[groupName].isFalse += 1;
                detailByFinalScore[finalScoreKey].groupStatisticsMap[groupName].isFalse += 1;
              }

              allByRatingMap[ratingName].statisticMap[groupName].total += 1;
              detailByFinalScore[finalScoreKey].groupStatisticsMap[groupName].total += 1;
            }
          }
        }
      }
    }

    for (const ratingBucket of Object.values(allByRatingMap)) {
      for (const groupStat of Object.values(ratingBucket.statisticMap)) {
        groupStat.percentageTrue = groupStat.total > 0
          ? (groupStat.isTrue / groupStat.total) * 100
          : 0;
      }
    }

    for (const detailItem of Object.values(detailByFinalScore)) {
      for (const groupStat of Object.values(detailItem.groupStatisticsMap)) {
        groupStat.percentageTrue = groupStat.total > 0
          ? (groupStat.isTrue / groupStat.total) * 100
          : 0;
      }
    }

    const groupStatistic = {
      all: {
        rating: Object.values(allByRatingMap).map((item) => ({
          rating: item.rating,
          statistic: Object.values(item.statisticMap),
        })),
      },
      detail: Object.values(detailByFinalScore).map((item) => ({
        finalScoreId: item.finalScoreId,
        createdAt: item.createdAt,
        number: item.number,
        rating: item.rating,
        groupStatistics: Object.values(item.groupStatisticsMap),
      })),
    };

    res.json(groupStatistic)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getQuestion = async (req, res) => {
  const branchUnitId = 17
  // const branchUnitId = req.user.branchUnitId
  try {
    const question = await prisma.multipleChoice.findMany({
      where: {
        deletedAt: null,
        branchUnitId
      },
      select: {
        id: true,
        question: true,
        a: true,
        b: true,
        c: true,
        d: true,
        multipleChoiceCorections: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            isTrue: true,
            answer: true,
          }
        }
      }
    })

    const questionSummary = question.map((item) => {
      const corrections = item.multipleChoiceCorections || [];
      let isTrue = 0;
      let isFalse = 0;
      const answerSummary = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
      };

      for (const correction of corrections) {
        if (correction.isTrue === true) {
          isTrue += 1;
        } else if (correction.isTrue === false) {
          isFalse += 1;
        }

        const answerKey = typeof correction.answer === "string"
          ? correction.answer.toUpperCase()
          : null;
        if (answerKey && Object.prototype.hasOwnProperty.call(answerSummary, answerKey)) {
          answerSummary[answerKey] += 1;
        }
      }

      const total = isTrue + isFalse;
      const percentageTrue = total > 0 ? (isTrue / total) * 100 : 0;

      return {
        id: item.id,
        question: item.question,
        a: item.a,
        b: item.b,
        c: item.c,
        d: item.d,
        isTrue,
        isFalse,
        total,
        percentageTrue,
        answerSummary,
      };
    });

    res.json(questionSummary)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getQuestionDetail = async (req, res) => {
  const { questionId } = req.params;
  try {
    console.log(questionId);
    const question = await prisma.multipleChoice.findUnique({
      where: {
        id: parseInt(questionId),
      },
      select: {
        id: true,
        question: true,
        a: true,
        b: true,
        c: true,
        d: true,
        multipleChoiceCorections: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            answer: true,
          }
        }
      }
    })

    // res.json(question)
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
}

export { getMember, postMember, getQuestion, getQuestionDetail };
