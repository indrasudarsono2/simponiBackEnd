import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { ROLES } from "../middleware/authorize.js";

const hasRole = (req, role) => (req.user?.roleNames || []).some(
  (item) => String(item || "").trim().toUpperCase() === role,
);

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
    let { eventUserId } = req.body;
    const memberNik = String(req.body?.memberNik || "").trim();

    if (memberNik) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const startDateValue = req.body?.startDate;
      const endDateValue = req.body?.endDate;
      let eventCreatedAt;

      if (startDateValue || endDateValue) {
        if (!datePattern.test(String(startDateValue || "")) || !datePattern.test(String(endDateValue || ""))) {
          return res.status(400).json({ message: "Both dates are required and must use YYYY-MM-DD format." });
        }
        const startDate = new Date(`${startDateValue}T00:00:00.000+07:00`);
        const endDate = new Date(`${endDateValue}T23:59:59.999+07:00`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date range." });
        }
        if (startDate > endDate) {
          return res.status(400).json({ message: "Start date cannot be later than end date." });
        }
        eventCreatedAt = { gte: startDate, lte: endDate };
      }

      const member = await prisma.user.findFirst({
        where: {
          nik: memberNik,
          branchUnitId: req.user.branchUnitId,
          deletedAt: null
        },
        select: {
          eventUsers: {
            where: {
              deletedAt: null,
              event: {
                is: {
                  deletedAt: null,
                  ...(eventCreatedAt ? { createdAt: eventCreatedAt } : {})
                }
              }
            },
            select: { id: true }
          }
        }
      });
      if (!member) return res.status(404).json({ message: "Member was not found in your branch unit." });
      eventUserId = member.eventUsers.map((item) => item.id);
    }

    if (!Array.isArray(eventUserId)) {
      return res.status(400).json({ message: "Member or event selection is required." });
    }

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
                deletedAt: null,
                isInvalidated: false
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
                    mandatoryItem: { select: { id: true, mandatory: true } },
                    multipleChoice: {
                      select: {
                        id: true,
                        isMats: true,
                        mandatoryItem: { select: { id: true, mandatory: true } },
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
    const matsStatisticMap = {};
    const matsDetailByFinalScore = {};

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
          if (!matsDetailByFinalScore[finalScoreKey]) {
            matsDetailByFinalScore[finalScoreKey] = {
              finalScoreId: finalScore.id,
              createdAt: finalScore.createdAt,
              number: application.number || null,
              rating: rating.rating?.rating || null,
              groupStatisticsMap: {},
            };
          }

          const ratingName = rating.rating?.rating || "UNKNOWN";
          ensureRatingBucket(allByRatingMap, ratingName);

          for (const correction of finalScore.multipleChoiceCorrections || []) {
            if (correction.multipleChoice?.isMats) {
              const groupName = correction.mandatoryItem?.mandatory || correction.multipleChoice.mandatoryItem?.mandatory;
              if (!groupName) continue;
              ensureGroupBucket(allByRatingMap[ratingName].statisticMap, groupName);
              ensureGroupBucket(detailByFinalScore[finalScoreKey].groupStatisticsMap, groupName);
              ensureGroupBucket(matsStatisticMap, groupName);
              ensureGroupBucket(matsDetailByFinalScore[finalScoreKey].groupStatisticsMap, groupName);
              const targets = [
                allByRatingMap[ratingName].statisticMap[groupName],
                detailByFinalScore[finalScoreKey].groupStatisticsMap[groupName],
                matsStatisticMap[groupName],
                matsDetailByFinalScore[finalScoreKey].groupStatisticsMap[groupName],
              ];
              if (correction.isTrue === true) {
                for (const target of targets) target.isTrue += 1;
              } else {
                for (const target of targets) target.isFalse += 1;
              }
              for (const target of targets) target.total += 1;
              continue;
            }
            const questionGroups = correction.multipleChoice?.mcQuestionGroups || [];

            for (const mcGroup of questionGroups) {
              const groupName = mcGroup.questionGroup?.group;
              if (!groupName) continue;
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

    for (const groupStat of Object.values(matsStatisticMap)) {
      groupStat.percentageTrue = groupStat.total > 0
        ? (groupStat.isTrue / groupStat.total) * 100
        : 0;
    }

    for (const detailItem of Object.values(matsDetailByFinalScore)) {
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
      mats: {
        statistic: Object.values(matsStatisticMap),
      },
      matsDetail: Object.values(matsDetailByFinalScore).map((item) => ({
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
  const isGeneralAdmin = hasRole(req, ROLES.GENERAL_ADMIN);
  const requestedType = String(req.query.type || "ALL").trim().toUpperCase();
  try {
    if (requestedType === "MATS" && !isGeneralAdmin) {
      return res.status(403).json({ message: "Only General Admin can access MATS question statistics." });
    }
    const questionWhere = isGeneralAdmin
      ? {
          deletedAt: null,
          ...(requestedType === "MATS" ? { isMats: true } : requestedType === "REGULAR" ? { isMats: false } : {}),
        }
      : { deletedAt: null, branchUnitId: req.user.branchUnitId, isMats: false };

    const correctionWhere = { deletedAt: null };
    const eventId = Number(req.query.eventId);
    const ratingId = Number(req.query.ratingId);
    const branchId = Number(req.query.branchId);
    const sectorId = Number(req.query.sectorId);
    if ([eventId, ratingId, branchId, sectorId].some(Number.isInteger)) {
      correctionWhere.finalScore = {
        ...(Number.isInteger(eventId) ? { eventId } : {}),
        ...(Number.isInteger(ratingId) ? { appRating: { is: { ratingId } } } : {}),
        ...((Number.isInteger(branchId) || Number.isInteger(sectorId)) ? {
          event: { is: { sector: { is: {
            ...(Number.isInteger(sectorId) ? { id: sectorId } : {}),
            ...(Number.isInteger(branchId) ? { branchUnit: { is: { branchId } } } : {}),
          } } } },
        } : {}),
      };
    }
    const question = await prisma.multipleChoice.findMany({
      where: questionWhere,
      select: {
        id: true,
        isMats: true,
        question: true,
        a: true,
        b: true,
        c: true,
        d: true,
        multipleChoiceCorections: {
          where: correctionWhere,
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
        isMats: item.isMats,
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
  const questionId = Number(req.params.id);
  try {
    if (!Number.isInteger(questionId) || questionId <= 0) return res.status(400).json({ message: "Invalid question ID." });
    const isGeneralAdmin = hasRole(req, ROLES.GENERAL_ADMIN);
    const question = await prisma.multipleChoice.findFirst({
      where: {
        id: questionId,
        deletedAt: null,
        ...(isGeneralAdmin ? {} : { branchUnitId: req.user.branchUnitId, isMats: false }),
      },
      select: {
        id: true,
        isMats: true,
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
    if (!question) return res.status(404).json({ message: "Question not found." });
    res.json(question)
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
}

export { getMember, postMember, getQuestion, getQuestionDetail };
