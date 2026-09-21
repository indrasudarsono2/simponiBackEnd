import prisma from "../lib/prisma.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseJakartaDate = (value, endOfDay = false) => {
  if (!DATE_PATTERN.test(String(value || ""))) return null;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value}T${time}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getScoreRecap = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { branch: "asc" },
      select: { id: true, branch: true }
    });

    const { startDate, endDate, branchId, mode, eventIds } = req.query;
    if (!mode) return res.json({ branches, professions: [], events: [], rows: [] });

    const isAllBranches = String(branchId || "").toLowerCase() === "all";
    const parsedBranchId = Number(branchId);
    if (!isAllBranches && (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0)) {
      return res.status(400).json({ message: "Invalid branch selection." });
    }

    if (mode === "professions") {
      if (isAllBranches) {
        const professionRecords = await prisma.profession.findMany({
          where: {
            deletedAt: null,
            professionInBranches: {
              some: { deletedAt: null, branch: { is: { deletedAt: null } } }
            }
          },
          orderBy: { profession: "asc" },
          select: { id: true, profession: true }
        });
        const professions = professionRecords.filter(
          (profession) => String(profession.profession || "").trim().toUpperCase() !== "DOCTOR"
        );
        return res.json({
          branches,
          professions: professions.map((profession) => ({ id: profession.id, profession })),
          events: [],
          rows: []
        });
      }
      const professionRecords = await prisma.professionInBranch.findMany({
        where: {
          deletedAt: null,
          branchId: parsedBranchId,
          profession: { is: { deletedAt: null } }
        },
        orderBy: { profession: { profession: "asc" } },
        select: {
          id: true,
          profession: { select: { id: true, profession: true } }
        }
      });
      const professions = professionRecords.filter(
        (item) => String(item.profession?.profession || "").trim().toUpperCase() !== "DOCTOR"
      );
      return res.json({ branches, professions, events: [], rows: [] });
    }

    const start = parseJakartaDate(startDate);
    const end = parseJakartaDate(endDate, true);
    if (!start || !end) {
      return res.status(400).json({ message: "Start date and end date must use YYYY-MM-DD format." });
    }
    if (start > end) {
      return res.status(400).json({ message: "Start date cannot be later than end date." });
    }

    const professionId = Number(req.query.professionId);
    const professionInBranchId = Number(req.query.professionInBranchId);
    if (isAllBranches) {
      if (!Number.isInteger(professionId) || professionId <= 0) {
        return res.status(400).json({ message: "Invalid profession selection." });
      }
      const professionExists = await prisma.professionInBranch.findFirst({
        where: {
          professionId,
          deletedAt: null,
          profession: { is: { deletedAt: null } },
          branch: { is: { deletedAt: null } }
        },
        select: { id: true }
      });
      if (!professionExists) return res.status(400).json({ message: "Invalid profession selection." });
    } else {
      if (!Number.isInteger(professionInBranchId) || professionInBranchId <= 0) {
        return res.status(400).json({ message: "Invalid profession selection." });
      }
      const professionBelongsToBranch = await prisma.professionInBranch.findFirst({
        where: { id: professionInBranchId, branchId: parsedBranchId, deletedAt: null },
        select: { id: true }
      });
      if (!professionBelongsToBranch) {
        return res.status(400).json({ message: "The selected profession is not available in this branch." });
      }
    }

    if (mode === "events") {
      const events = await prisma.event.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: start, lte: end },
          sector: {
            is: {
              branchUnit: { is: { branchId: parsedBranchId, deletedAt: null } }
            }
          },
          eventUsers: {
            some: {
              deletedAt: null,
              user: { is: { professionInBranchId, deletedAt: null } }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { event: "asc" }],
        select: { id: true, event: true, createdAt: true, startDate: true, finishDate: true }
      });
      return res.json({ branches, professions: [], events, rows: [] });
    }

    const parsedEventIds = String(eventIds || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (mode !== "scores" || (!isAllBranches && parsedEventIds.length === 0)) {
      return res.status(400).json({ message: "Select at least one event to load the score recap." });
    }

    const eventFilter = {
      deletedAt: null,
      createdAt: { gte: start, lte: end },
      ...(!isAllBranches && {
        sector: { is: { branchUnit: { is: { branchId: parsedBranchId, deletedAt: null } } } }
      })
    };
    const userProfessionFilter = isAllBranches
      ? { professionInBranch: { is: { deletedAt: null, professionId } } }
      : { professionInBranchId };

    const finalScores = await prisma.finalScore.findMany({
      where: {
        deletedAt: null,
        isInvalidated: false,
        ...(!isAllBranches && { eventId: { in: parsedEventIds } }),
        event: { is: eventFilter },
        appRating: {
          is: {
            deletedAt: null,
            applicationDoc: {
              is: {
                deletedAt: null,
                user: {
                  is: {
                    deletedAt: null,
                    ...userProfessionFilter
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        finalScore: true,
        multipleChoiceScore: true,
        essayScore: true,
        createdAt: true,
        status: { select: { status: true } },
        event: {
          select: {
            event: true,
            startDate: true,
            finishDate: true,
            passingGrade: true,
            remarkDoc: { select: { remark: true } },
            sector: {
              select: {
                branchUnit: {
                  select: { branch: { select: { id: true, branch: true } } }
                }
              }
            }
          }
        },
        appRating: {
          select: {
            id: true,
            rating: { select: { rating: true } },
            previews: {
              where: { deletedAt: null },
              select: { id: true },
              take: 1
            },
            applicationDoc: {
              include: {
                status: true,
                ielp: true,
                medex: true,
                logbook: true,
                license: true,
                appRatings: { include: { rating: true } },
                eventUser: {
                  include: {
                    event: { include: { remarkDoc: true } }
                  }
                },
                user: {
                  include: {
                    gender: true,
                    branch: true,
                    competences: { include: { rating: true } }
                  }
                },
                ojtUser: true,
                verifications: true
              }
            },
            practicalTests: {
              where: { deletedAt: null },
              select: {
                score: true,
                kindOfPractical: { select: { kind: true } },
                checkerGroup: {
                  select: { userChecker: { select: { nik: true, name: true } } }
                }
              }
            },
            practicalRecheckAuthorization: {
              select: {
                status: true,
                attempts: {
                  select: {
                    score: true,
                    practicalTest: {
                      select: { kindOfPractical: { select: { kind: true } } }
                    },
                    checkerGroup: {
                      select: { userChecker: { select: { nik: true, name: true } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const rows = finalScores.map((item) => {
      const rating = item.appRating;
      const recheck = rating?.practicalRecheckAuthorization;
      const originalPracticalScores = (rating?.practicalTests || []).map((test) => ({
        attempt: 1,
        kind: test.kindOfPractical?.kind || null,
        score: test.score,
        checker: test.checkerGroup?.userChecker || null
      }));
      const recheckPracticalScores = (recheck?.attempts || [])
        .filter((attempt) => attempt.score != null)
        .map((attempt) => ({
          attempt: 2,
          kind: attempt.practicalTest?.kindOfPractical?.kind || null,
          score: attempt.score,
          checker: attempt.checkerGroup?.userChecker || null
        }));

      return {
        id: item.id,
        appRatingId: rating?.id || null,
        hasEvidence: (rating?.previews?.length || 0) > 0,
        scoreDate: item.createdAt,
        event: item.event,
        remarkDoc: item.event?.remarkDoc?.remark || null,
        branch: item.event?.sector?.branchUnit?.branch || null,
        user: {
          nik: rating?.applicationDoc?.user?.nik || null,
          name: rating?.applicationDoc?.user?.name || null
        },
        applicationDocument: rating?.applicationDoc?.number || null,
        relatedDocuments: rating?.applicationDoc ? {
          applicationDocument: rating.applicationDoc,
          userData: rating.applicationDoc.user
        } : null,
        rating: rating?.rating?.rating || null,
        multipleChoiceScore: item.multipleChoiceScore,
        essayScore: item.essayScore,
        theoryScore: item.finalScore,
        practicalScores: [...originalPracticalScores, ...recheckPracticalScores],
        status: item.status?.status || null
      };
    });

    res.json({ branches, professions: [], events: [], rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCheckers = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { branch: "asc" },
      select: { id: true, branch: true }
    });

    const branchId = String(req.query.branchId || "").trim();
    if (!branchId) return res.json({ branches, checkers: [] });

    const isAllBranches = branchId.toLowerCase() === "all";
    const parsedBranchId = Number(branchId);
    if (!isAllBranches && (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0)) {
      return res.status(400).json({ message: "Invalid branch selection." });
    }
    if (!isAllBranches && !branches.some((branch) => branch.id === parsedBranchId)) {
      return res.status(400).json({ message: "The selected branch is not available." });
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(!isAllBranches && { branchId: parsedBranchId }),
        branch: { is: { deletedAt: null } },
        userRoles: {
          some: {
            deletedAt: null,
            roles: { is: { deletedAt: null, role: "CHECKER" } }
          }
        }
      },
      orderBy: [{ branch: { branch: "asc" } }, { name: "asc" }],
      select: {
        nik: true,
        name: true,
        branch: { select: { id: true, branch: true } },
        branchUnit: { select: { id: true, unit: true } },
        sector: { select: { id: true, sector: true } },
        userRoles: {
          where: {
            deletedAt: null,
            roles: { is: { deletedAt: null, role: "CHECKER" } }
          },
          select: {
            id: true,
            checkerRatings: {
              where: { deletedAt: null, rating: { is: { deletedAt: null } } },
              orderBy: { rating: { rating: "asc" } },
              select: {
                id: true,
                rating: { select: { id: true, rating: true } }
              }
            }
          }
        }
      }
    });

    const checkers = users.map((user) => {
      const ratingsById = new Map();
      for (const userRole of user.userRoles) {
        for (const checkerRating of userRole.checkerRatings) {
          if (checkerRating.rating) ratingsById.set(checkerRating.rating.id, checkerRating.rating);
        }
      }
      return {
        nik: user.nik,
        name: user.name,
        branch: user.branch,
        branchUnit: user.branchUnit,
        sector: user.sector,
        checkerRatings: [...ratingsById.values()]
      };
    });

    return res.json({ branches, checkers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export { getScoreRecap, getCheckers };
