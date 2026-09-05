import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { ROLES } from "../middleware/authorize.js";

const normalizeRole = (role) => String(role || "").trim().toUpperCase();
const hasRole = (req, role) => (req.user?.roleNames || []).map(normalizeRole).includes(role);

const getUserCheckerScore = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const data = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null,
        events: {
          some: {
            sector: {
              branchUnitId
            }
          }
        }
      },
      select: {
        id: true,
        remark: true,
        events: {
          where: {
            deletedAt: null,
            sector: {
              branchUnitId
            }
          },
          select: {
            id: true,
            event: true
          }
        }
      }
    })

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postUserCheckerScore = async (req, res) => {
  try {
    const {eventId} = req.body

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: parseInt(eventId),
      },
      select: {
        id: true,
        user: {
          select: {
            name: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null,
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
                    finalScore: true,
                    status: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        status: true
                      }
                    }
                  }
                },
                examinationInvalidations: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    id: true,
                    reason: true,
                    fraudCategory: true,
                    createdAt: true,
                  }
                },
                previews: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                  },
                  take: 1
                }
              },
            }
          }
        }
      }
    })

    const sort = eventUser.sort((a, b) => {
      const name = a.user.name.toUpperCase();
      const name2 = b.user.name.toUpperCase();
      if (name < name2) {
        return -1;
      }
    })

    res.json(sort)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postUserCheckerScoreEvidance = async (req, res) => {
  try {
    const {appRatingId} = req.body
    
    const preview = await prisma.preview.findMany({
      where: {
        deletedAt: null,
        appRatingId
      },
      select: {
        id: true,
        file: true,
        createdAt: true
      }
    })
    res.json(preview)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const invalidateExaminationAttempt = async (req, res) => {
  try {
    if (!hasRole(req, ROLES.CHECKER_ADMIN) && !hasRole(req, ROLES.GENERAL_CHECKER)) {
      return res.status(403).json({ message: "Only CHECKER ADMIN or GENERAL CHECKER may require a re-examination." });
    }

    const appRatingId = Number(req.body?.appRatingId);
    const reason = String(req.body?.reason || "").trim();
    const fraudCategory = String(req.body?.fraudCategory || "").trim() || null;

    if (!Number.isInteger(appRatingId) || appRatingId <= 0) {
      return res.status(400).json({ message: "A valid appRatingId is required." });
    }
    if (reason.length < 10 || reason.length > 2000) {
      return res.status(400).json({ message: "Reason must contain between 10 and 2000 characters." });
    }
    if (fraudCategory && fraudCategory.length > 100) {
      return res.status(400).json({ message: "Fraud category is too long." });
    }

    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null },
      select: {
        id: true,
        applicationDoc: {
          select: {
            eventUser: {
              select: {
                event: {
                  select: {
                    id: true,
                    sector: { select: { branchUnitId: true } },
                    eventQuestions: {
                      where: { deletedAt: null },
                      select: { kindOfQuestionId: true }
                    }
                  }
                }
              }
            }
          }
        },
        previews: {
          where: { deletedAt: null },
          select: { id: true },
          take: 1
        },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false },
          orderBy: { id: "desc" },
          select: { id: true, eventId: true, statusId: true, finalScore: true },
          take: 1
        }
      }
    });

    if (!appRating) return res.status(404).json({ message: "Examination rating was not found." });
    if (appRating.previews.length === 0) {
      return res.status(409).json({ message: "This examination has no evidence to support invalidation." });
    }

    const event = appRating.applicationDoc?.eventUser?.event;
    if (!event) return res.status(409).json({ message: "The examination event could not be identified." });
    if (hasRole(req, ROLES.CHECKER_ADMIN) && Number(event.sector?.branchUnitId) !== Number(req.user.branchUnitId)) {
      return res.status(403).json({ message: "This examination is outside your branch unit." });
    }

    const currentScore = appRating.finalScores[0];
    if (!currentScore) return res.status(409).json({ message: "There is no active final score to invalidate." });
    const hasEssay = event.eventQuestions.some((question) => question.kindOfQuestionId === 1);
    const retryStatusId = hasEssay ? 1 : 4;

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.finalScore.updateMany({
        where: { id: currentScore.id, appRatingId, deletedAt: null, isInvalidated: false },
        data: {
          isInvalidated: true,
          invalidatedAt: now,
          invalidatedBy: req.user.nik,
          invalidationReason: reason
        }
      });
      if (updated.count !== 1) throw new Error("This attempt has already been invalidated.");

      await tx.examinationInvalidation.create({
        data: {
          appRatingId,
          finalScoreId: currentScore.id,
          invalidatedBy: req.user.nik,
          reason,
          fraudCategory,
          previousStatusId: currentScore.statusId,
          previousScore: currentScore.finalScore
        }
      });
      await tx.userRating.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      await tx.essayCorrection.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      await tx.multipleChoiceCorrection.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      await tx.monitorTime.deleteMany({ where: { appRatingId } });
      await tx.matsQuestionSelection.deleteMany({ where: { appRatingId, eventId: event.id } });
      await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: retryStatusId } });

      return { finalScoreId: currentScore.id };
    });

    return res.json({
      message: "The attempt was invalidated. The user may now re-execute the examination.",
      appRatingId,
      ...result
    });
  } catch (error) {
    const status = error.message === "This attempt has already been invalidated." ? 409 : 500;
    return res.status(status).json({ message: error.message });
  }
};

const getUserCheckerPractical = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const data = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null,
        events: {
          some: {
            sector: {
              branchUnitId
            }
          }
        }
      },
      select: {
        id: true,
        remark: true,
        events: {
          where: {
            deletedAt: null,
            sector: {
              branchUnitId
            }
          },
          select: {
            id: true,
            event: true
          }
        }
      }
    })

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postUserCheckerPractical = async (req, res) => {
  try {
    const {eventId} = req.body

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: parseInt(eventId),
      },
      select: {
        id: true,
        user: {
          select: {
            name: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null,
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
                status: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    status: true
                  }
                },
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
                    deletedAt: null
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
                    },
                    checkerGroup: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        userChecker: {
                          select: {
                            name: true
                          }
                        }
                      }
                    }
                  }
                },
                practicalRecheckAuthorization: {
                  select: {
                    id: true,
                    status: true,
                    reason: true,
                    createdAt: true
                  }
                }
              }
            }
          }
        }
      }
    })

    const sort = eventUser.sort((a, b) => {
      const name = a.user.name.toUpperCase();
      const name2 = b.user.name.toUpperCase();
      if (name < name2) {
        return -1;
      }
    })

    res.json(sort)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const grantPracticalRecheck = async (req, res) => {
  try {
    const appRatingId = Number(req.body?.appRatingId);
    const reason = String(req.body?.reason || "").trim();
    if (!Number.isInteger(appRatingId) || appRatingId <= 0) {
      return res.status(400).json({ message: "A valid appRatingId is required." });
    }
    if (reason.length < 10 || reason.length > 2000) {
      return res.status(400).json({ message: "Reason must contain between 10 and 2000 characters." });
    }
    if (req.body?.confirmation !== "GRANT ONE PRACTICAL RECHECK") {
      return res.status(400).json({ message: "The confirmation phrase is incorrect." });
    }

    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null },
      select: {
        id: true,
        status: { select: { status: true } },
        practicalRecheckAuthorization: { select: { id: true } },
        practicalTests: {
          where: { deletedAt: null },
          select: { id: true, score: true, checkerGroupId: true }
        },
        applicationDoc: {
          select: {
            eventUser: {
              select: {
                event: {
                  select: {
                    id: true,
                    passingGrade: true,
                    sector: { select: { branchUnitId: true } }
                  }
                }
              }
            }
          }
        },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false },
          orderBy: { id: "desc" },
          take: 1,
          select: { id: true }
        }
      }
    });

    if (!appRating) return res.status(404).json({ message: "App rating was not found." });
    if (appRating.status?.status !== "FAILED") {
      return res.status(409).json({ message: "Only a failed practical examination can receive discretion." });
    }
    if (appRating.practicalRecheckAuthorization) {
      return res.status(409).json({ message: "A practical recheck has already been granted for this rating." });
    }
    const event = appRating.applicationDoc?.eventUser?.event;
    if (!event || event.passingGrade == null) {
      return res.status(409).json({ message: "The related event or passing grade is unavailable." });
    }
    if (Number(event.sector?.branchUnitId) !== Number(req.user.branchUnitId)) {
      return res.status(403).json({ message: "This examination is outside your branch unit." });
    }
    if (!appRating.practicalTests.length || appRating.practicalTests.some((test) => test.score == null)) {
      return res.status(409).json({ message: "All original practical tests must be completed before recheck discretion." });
    }
    const finalScore = appRating.finalScores[0];
    if (!finalScore) return res.status(409).json({ message: "The related final score was not found." });

    const recheckStatus = await prisma.status.findFirst({
      where: { status: "PRACTICAL RECHECK", deletedAt: null },
      select: { id: true }
    });
    if (!recheckStatus) return res.status(500).json({ message: "PRACTICAL RECHECK status is not configured." });

    const authorization = await prisma.$transaction(async (tx) => {
      const created = await tx.practicalRecheckAuthorization.create({
        data: {
          appRatingId,
          grantedBy: req.user.nik,
          reason,
          passingGrade: event.passingGrade,
          attempts: {
            create: appRating.practicalTests.map((test) => ({
              practicalTestId: test.id,
              checkerGroupId: test.checkerGroupId
            }))
          }
        },
        include: { attempts: true }
      });
      await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: recheckStatus.id } });
      await tx.finalScore.update({ where: { id: finalScore.id }, data: { statusId: recheckStatus.id } });
      await tx.userRating.updateMany({
        where: { finalScoreId: finalScore.id, deletedAt: null },
        data: { deletedAt: new Date() }
      });
      return created;
    });

    res.status(201).json({ message: "One-time practical recheck granted for all practical tests.", authorization });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export { getUserCheckerScore, postUserCheckerScore, postUserCheckerScoreEvidance, invalidateExaminationAttempt, getUserCheckerPractical, postUserCheckerPractical, grantPracticalRecheck };
