import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { scoreTheorySessionEssay } from "../services/scoreTheorySessionEssay.js";
import { isCheckerAdmin } from '../utils/checkerAdminScope.js';
import { assertEssayScorer, auditAdminEssayScore } from '../services/essayScoringAuthority.js';
import { assignedForRating, groupPolicyInclude } from '../services/groupRatingPolicy.js';
import { essayViewUser } from '../services/essayViewScope.js';

const getEvent = async (req, res) => {

  // const branchUnitId = req.user.branchUnitId
  const sectorId = req.user.sectorId
  // const sectorId = 8
  const userN = req.user.nik
  // const userN = "10077770"

  try {
    const admin = isCheckerAdmin(essayViewUser(req));
    if (!req.user.branchUnitId) return res.status(403).json({ message: 'Your branch unit is not configured.' });
    const eventId = req.query.eventId === undefined ? null : Number(req.query.eventId);
    if (eventId !== null && (!Number.isSafeInteger(eventId) || eventId <= 0)) {
      return res.status(400).json({ message: "Invalid event ID." });
    }
    const eventWhere = {
      deletedAt: null,
      session: { branchUnitId: req.user.branchUnitId },
      ...(eventId !== null ? { id: eventId } : {}),
      groups: { some: { deletedAt: null, ...(admin ? {} : { checkerGroups: { some: { deletedAt: null, checker: userN } } }) } },
    };
    if (req.query.mode === "options") {
      const event = await prisma.event.findMany({
        where: eventWhere,
        select: { id: true, event: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      return res.json({ event });
    }
    const event = await prisma.event.findMany({
      where: eventWhere,
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
            ...(admin ? {} : { checkerGroups: {
              some: {
                checker: userN, deletedAt: null
              }
            } })
          },
          select: {
            id: true,
            group: true,
            groupMembers: {
              where: {
                deletedAt: null,
                ...(admin ? { member: { not: userN }, userMember: { deletedAt: null, branchUnitId: req.user.branchUnitId } } : {}),
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
                    statusId: 3,
                    ...(admin ? { essaySubmittedAt: { not: null }, OR: [{ theorySessionParticipant: null }, { theorySessionParticipant: { session: { status: 'ENDED' } } }] } : {})
                  },
                  select: {
                    id: true,
                    essayScore: true,
                    appRating: {
                      select: {
                        id: true,
                        ratingId: true,
                        rating: { select: { rating: true } },
                      },
                    },
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
                    ...(admin ? { checker: { not: null }, finalScore: { essaySubmittedAt: { not: null }, isInvalidated: false, deletedAt: null } } : {}),
                  },
                  select: {
                    id: true,
                    appRating: {
                      select: {
                        id: true,
                        ratingId: true,
                        rating: { select: { rating: true } },
                      }
                    },
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    })

    const policies = await prisma.group.findMany({ where: { id: { in: event.flatMap(e => e.groups.map(g => g.id)) } }, include: groupPolicyInclude });
    for (const e of event) for (const g of e.groups) {
      const policy = policies.find(p => p.id === g.id);
      for (const m of g.groupMembers) {
        m.finalScores = m.finalScores.filter(s => admin || assignedForRating(policy, userN, s.appRating?.ratingId));
        m.essayCorrections = m.essayCorrections.filter(s => admin || assignedForRating(policy, userN, s.appRating?.ratingId));
      }
    }
    res.json({event});
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const postEssayAnswer = async (req, res) => {
  try {
    req.user = essayViewUser({ ...req, method: 'POST' });
    const {finalScoreId, persentage, essayCorrection} = req.body
    const mode2Score = await prisma.finalScore.findUnique({ where: { id: Number(finalScoreId) }, select: {
      id: true, statusId: true, isInvalidated: true, deletedAt: true, multipleChoiceScore: true,
      groupMemberId: true, essaySubmittedAt: true,
      appRating: { select: { ratingId: true } },
      configurationVersion: { select: { snapshot: true } },
      theorySessionParticipant: { select: { id: true } },
      groupMember: { select: { groupId: true, group: { select: {
        checkerGroups: { where: { deletedAt: null }, select: { checker: true } },
        event: { select: { sector: { select: { branchUnitId: true } } } },
      } } } },
      essayCorrections: { where: { deletedAt: null, checker: null, score: null },
        select: { id: true, essay: { select: { value: true } } } },
    } });
    if (mode2Score) await assertEssayScorer(mode2Score, req.user, req.body.takeoverReason);
    if (mode2Score?.theorySessionParticipant) return scoreTheorySessionEssay(req, res, mode2Score);
    if (!mode2Score || mode2Score.deletedAt || mode2Score.isInvalidated || mode2Score.statusId !== 3 ||
        (!isCheckerAdmin(req.user) && !mode2Score.groupMember?.group?.checkerGroups?.some((item) => item.checker === req.user.nik)) ||
        Number(mode2Score.groupMember.group.event?.sector?.branchUnitId) !== Number(req.user.branchUnitId)) {
      return res.status(403).json({ message: 'This pending Essay score is not assigned to you.' });
    }
    const submitted = Array.isArray(essayCorrection) ? essayCorrection : [];
    const expected = mode2Score.essayCorrections;
    const submittedIds = submitted.map((item) => Number(item.essayCorrectionId));
    if (!expected.length || submittedIds.length !== expected.length ||
        new Set(submittedIds).size !== expected.length ||
        expected.some((item) => !submittedIds.includes(item.id)) ||
        submitted.some((item) => {
          const stored = expected.find((entry) => entry.id === Number(item.essayCorrectionId));
          const value = Number(stored?.essay?.value);
          const given = Number(item.score);
          return !stored || !Number.isFinite(given) || given < 0 || given > value;
        })) {
      return res.status(400).json({ message: 'Essay scores must belong to one rating and include every pending answer.' });
    }
    
    const score = submitted.map(i => Number(i.score))
    const sumScore = score.reduce((accumulator, currentValue) => accumulator + currentValue, 0);

    const value = expected.map((item) => Number(item.essay?.value || 0))
    const sumValue = value.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    const scoringWeight = mode2Score.configurationVersion?.snapshot?.eventQuestions?.find(q => q.kindOfQuestionId === 1)?.persentage ?? persentage;
    if (sumValue <= 0 || !Number.isFinite(Number(scoringWeight)) || Number(scoringWeight) < 0 || Number(scoringWeight) > 1) {
      return res.status(400).json({ message: 'The Essay scoring weight is invalid.' });
    }

    const essayScore = sumScore/sumValue*100*Number(scoringWeight)
    await prisma.$transaction(async tx => {
      await assertEssayScorer(mode2Score, req.user, req.body.takeoverReason, tx);
      const claimed = await tx.finalScore.updateMany({ where: { id: Number(finalScoreId), statusId: 3, deletedAt: null, isInvalidated: false },
        data: { statusId: 4, essayScore, finalScore: essayScore, essayResultEmailQueuedAt: new Date() } });
      if (claimed.count !== 1) throw Object.assign(new Error('This essay has already been scored. Refresh the list.'), { status: 409 });
      await auditAdminEssayScore(tx, mode2Score, req.user, req.body.takeoverReason, submitted);
      for (const item of submitted) await tx.essayCorrection.update({ where: { id: Number(item.essayCorrectionId) }, data: { score: Number(item.score), checker: req.user.nik } });
      const finalScoreUpdate = await tx.finalScore.findUnique({ where: { id: Number(finalScoreId) }, select: { appRatingId: true } });
      await tx.appRating.update({ where: { id: finalScoreUpdate.appRatingId }, data: { statusId: 4 } });
    });

    res.status(200).json({ success: true, emailPending: true });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
}

export { getEvent, postEssayAnswer };
