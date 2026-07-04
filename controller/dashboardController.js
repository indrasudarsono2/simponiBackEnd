import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const dashboardBriefingInclude = {
  speakerUser: {
    select: {
      name: true,
    },
  },
  contentOfBriefings: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  },
  briefingDestinations: {
    where: {
      deletedAt: null,
    },
    include: {
      professionInBranch: {
        select: {
          id: true,
          profession: {
            select: {
              profession: true,
            },
          },
        },
      },
    },
  },
};

const getDashboardOperational = async (req, res) => {
  // const sect = 8
  const sect = req.user.sectorId
  // const userN = "10011520"
  // const userN = "10077770"
  const userN = req.user.nik
  // const prof = 1
  const prof = req.user.professionId
  try {
    const user = await prisma.user.findFirst({
      where: {
        nik: userN
      },
      include: {
        medex: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        },
        ielp: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        },
        eventUsers: {
          where: {
            applicationDocs: {
              some: {
                statusId: 2
              }
            }
          },
          include: {
            event: true,
            applicationDocs: {
              where: {
                deletedAt: null
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          },
        }
      },
    })

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postDashboardToken = async(req, res) => {
  try {
    const {applicationDocId, token} = req.body
    const now = dayjs.utc().toDate()
    const tokenDb = await prisma.token.findFirst({
      where: {
        branchUnitId: req.user.branchUnitId,
        startDate: {
          lte: now
        },
        expiredDate: {
          gte: now
        }
      }
    })

    if(tokenDb && tokenDb.token === token){
      await prisma.applicationDoc.update({
        where: {
          id: applicationDocId
        },
        data: {
          briefingDate: dayjs.utc().toDate()
        }
      })
      res.json({message: "ok"});
    }else{
      res.json({message: "Invalid token"})
    }
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getDashboardBriefings = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    let professionId = req.user?.professionId;
    let professionInBranchId = req.user?.professionInBranchId;

    if (!branchId) {
      return res.json([]);
    }

    if ((!professionId || !professionInBranchId) && req.user?.nik) {
      const user = await prisma.user.findFirst({
        where: {
          nik: req.user.nik,
          deletedAt: null,
        },
        select: {
          professionId: true,
          professionInBranchId: true,
        },
      });

      professionId = professionId || user?.professionId || null;
      professionInBranchId = user?.professionInBranchId || null;
    }

    if (!professionId && !professionInBranchId) {
      return res.json([]);
    }

    const briefings = await prisma.briefing.findMany({
      where: {
        branchId,
        kindOfBriefingId: 1,
        deletedAt: null,
        briefingDestinations: {
          some: {
            deletedAt: null,
            professionInBranch: {
              branchId,
              deletedAt: null,
              ...(professionId
                ? {
                    professionId,
                  }
                : {
                    id: professionInBranchId,
                  }),
            },
          },
        },
      },
      include: dashboardBriefingInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(briefings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDashboardAdmin = async (req, res, scope) => {
  try {
    const roleNames = (req.user?.roles || [])
      .map((userRole) => userRole?.roles?.role)
      .filter(Boolean);

    const branchScoped = scope === "branch";
    const branchUnitScoped = scope === "branchUnit";
    const requiredRole = branchUnitScoped
      ? "BRANCH UNIT ADMIN"
      : branchScoped
        ? "BRANCH ADMIN"
        : "GENERAL ADMIN";
    if (!roleNames.includes(requiredRole)) {
      return res.status(403).json({
        success: false,
        message: `${requiredRole} access is required.`,
      });
    }

    const branchId = branchScoped || branchUnitScoped ? req.user?.branchId : null;
    const branchUnitId = branchUnitScoped ? req.user?.branchUnitId : null;
    if ((branchScoped || branchUnitScoped) && !branchId) {
      return res.status(400).json({
        success: false,
        message: "Branch data is required for this dashboard.",
      });
    }
    if (branchUnitScoped && !branchUnitId) {
      return res.status(400).json({
        success: false,
        message: "Branch unit data is required for this dashboard.",
      });
    }

    const branchFilter = branchId ? { branchId } : {};
    const userScopeFilter = branchUnitId ? { branchUnitId } : branchFilter;
    const userFilter = { deletedAt: null, ...userScopeFilter };
    const userRelationFilter = { deletedAt: null, ...userScopeFilter };
    const issueScopeFilter = branchUnitId
      ? {
          dutyReportLinks: {
            some: {
              deletedAt: null,
              dutyReport: { supervisorCwp: { branchUnitId } },
            },
          },
        }
      : branchFilter;

    const now = new Date();
    const nextThirtyDays = new Date(now);
    nextThirtyDays.setDate(nextThirtyDays.getDate() + 30);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const [
      users,
      branches,
      branchUnits,
      sectors,
      roles,
      professions,
      roleDistribution,
      branchList,
      branchUserCounts,
      expiredLicenses,
      expiringLicenses,
      recentUsers,
      activeDutyLogBooks,
      ongoingIssues,
      medexRecords,
      ielpRecords,
      ratingRecords,
    ] = await Promise.all([
      prisma.user.count({ where: userFilter }),
      prisma.branch.count({ where: { deletedAt: null, ...(branchId ? { id: branchId } : {}) } }),
      prisma.branchUnit.count({
        where: {
          deletedAt: null,
          ...(branchUnitId ? { id: branchUnitId } : branchFilter),
        },
      }),
      prisma.sector.count({
        where: {
          deletedAt: null,
          ...(branchUnitId
            ? { branchUnitId }
            : branchId
              ? { branchUnit: { branchId } }
              : {}),
        },
      }),
      prisma.roles.count({
        where: {
          deletedAt: null,
          ...(branchId
            ? { userRoles: { some: { deletedAt: null, user: userRelationFilter } } }
            : {}),
        },
      }),
      prisma.profession.count({
        where: {
          deletedAt: null,
          ...(branchUnitId
            ? {
                professionInBranches: {
                  some: {
                    deletedAt: null,
                    users: { some: userRelationFilter },
                  },
                },
              }
            : branchId
              ? { professionInBranches: { some: { branchId, deletedAt: null } } }
              : {}),
        },
      }),
      prisma.roles.findMany({
        where: {
          deletedAt: null,
          ...(branchId
            ? { userRoles: { some: { deletedAt: null, user: userRelationFilter } } }
            : {}),
        },
        select: {
          id: true,
          role: true,
          _count: {
            select: {
              userRoles: {
                where: { deletedAt: null, user: userRelationFilter },
              },
            },
          },
        },
        orderBy: { role: "asc" },
      }),
      prisma.branch.findMany({
        where: { deletedAt: null, ...(branchId ? { id: branchId } : {}) },
        select: { id: true, branch: true },
        orderBy: { branch: "asc" },
      }),
      prisma.user.groupBy({
        by: ["branchId"],
        where: {
          deletedAt: null,
          branchId: branchId || { not: null },
        },
        _count: { _all: true },
      }),
      prisma.license.count({
        where: {
          deletedAt: null,
          expiredDate: { lt: now },
          ...(branchId ? { user: userRelationFilter } : {}),
        },
      }),
      prisma.license.count({
        where: {
          deletedAt: null,
          expiredDate: { gte: now, lte: nextThirtyDays },
          ...(branchId ? { user: userRelationFilter } : {}),
        },
      }),
      prisma.user.findMany({
        where: userFilter,
        select: {
          nik: true,
          name: true,
          createdAt: true,
          branch: { select: { branch: true } },
          userRoles: {
            where: { deletedAt: null },
            select: { roles: { select: { role: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.logBook.findMany({
        where: {
          deletedAt: null,
          isFinal: false,
          timeIn: { not: null },
          user: userRelationFilter,
        },
        select: {
          id: true,
          userNik: true,
          timeIn: true,
          user: {
            select: {
              name: true,
              branch: { select: { branch: true } },
              branchUnit: { select: { unit: true } },
              professionInBranch: {
                select: { profession: { select: { profession: true } } },
              },
              medex: {
                where: { deletedAt: null },
                select: { expired: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
              ielp: {
                where: { deletedAt: null },
                select: { expired: true, level: true },
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
              userRatings: {
                where: { deletedAt: null, rating: { deletedAt: null } },
                select: {
                  expireddate: true,
                  rating: { select: { rating: true } },
                },
                orderBy: { updatedAt: "desc" },
              },
            },
          },
          cwp: {
            select: {
              id: true,
              cwp: true,
              rating: { select: { rating: true } },
            },
          },
          shift: {
            select: {
              shiftName: { select: { shift: true } },
            },
          },
          dutyReport: {
            select: { id: true, shiftDate: true },
          },
        },
        orderBy: { timeIn: "desc" },
      }),
      prisma.onGoingIssue.findMany({
        where: {
          deletedAt: null,
          start: { gte: oneMonthAgo },
          ...issueScopeFilter,
        },
        select: {
          id: true,
          other: true,
          start: true,
          finish: true,
          isClosed: true,
          updatedAt: true,
          escalationEnabled: true,
          branch: { select: { branch: true } },
          equipment: { select: { equipment: true } },
          reporterUser: { select: { nik: true, name: true } },
          messages: {
            where: { deletedAt: null },
            select: { message: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          escalations: {
            where: { deletedAt: null },
            select: {
              status: true,
              dueAt: true,
              triggeredAt: true,
              escalationLevel: { select: { level: true } },
            },
            orderBy: { dueAt: "desc" },
            take: 1,
          },
          dutyReportLinks: {
            where: { deletedAt: null },
            select: {
              dutyReportId: true,
              attachedAt: true,
              dutyReport: {
                select: {
                  shiftDate: true,
                  shiftName: { select: { shift: true } },
                },
              },
            },
            orderBy: { attachedAt: "desc" },
          },
        },
        orderBy: { start: "desc" },
        take: 100,
      }),
      prisma.medex.findMany({
        where: {
          deletedAt: null,
          expired: { not: null },
          user: userRelationFilter,
        },
        select: {
          id: true,
          userNik: true,
          expired: true,
          user: {
            select: {
              name: true,
              branch: { select: { branch: true } },
              branchUnit: { select: { unit: true } },
              professionInBranch: {
                select: { profession: { select: { profession: true } } },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.ielp.findMany({
        where: {
          deletedAt: null,
          expired: { not: null },
          user: userRelationFilter,
        },
        select: {
          id: true,
          userNik: true,
          level: true,
          expired: true,
          user: {
            select: {
              name: true,
              branch: { select: { branch: true } },
              branchUnit: { select: { unit: true } },
              professionInBranch: {
                select: { profession: { select: { profession: true } } },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.userRating.findMany({
        where: {
          deletedAt: null,
          expireddate: { not: null },
          user: userRelationFilter,
          rating: { deletedAt: null },
        },
        select: {
          id: true,
          userId: true,
          ratingId: true,
          expireddate: true,
          rating: { select: { rating: true } },
          user: {
            select: {
              name: true,
              branch: { select: { branch: true } },
              branchUnit: { select: { unit: true } },
              professionInBranch: {
                select: { profession: { select: { profession: true } } },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const usersByBranch = new Map(
      branchUserCounts.map((item) => [item.branchId, item._count._all]),
    );
    const latestByKey = (records, getKey) =>
      Array.from(
        records
          .reduce((latest, record) => {
            const key = getKey(record);
            if (key && !latest.has(key)) latest.set(key, record);
            return latest;
          }, new Map())
          .values(),
      );
    const needsExpirationAttention = (value) =>
      value && new Date(value).getTime() <= nextThirtyDays.getTime();
    const serializeCredentialUser = (record) => ({
      nik: record.userNik || record.userId || null,
      name: record.user?.name || null,
      branch: record.user?.branch?.branch || null,
      branchUnit: record.user?.branchUnit?.unit || null,
      profession:
        record.user?.professionInBranch?.profession?.profession || null,
    });

    const medexAttention = latestByKey(
      medexRecords,
      (record) => record.userNik,
    )
      .filter((record) => needsExpirationAttention(record.expired))
      .map((record) => ({
        id: record.id,
        ...serializeCredentialUser(record),
        expiredAt: record.expired,
      }));
    const ielpAttention = latestByKey(
      ielpRecords,
      (record) => record.userNik,
    )
      .filter((record) => needsExpirationAttention(record.expired))
      .map((record) => ({
        id: record.id,
        ...serializeCredentialUser(record),
        level: record.level,
        expiredAt: record.expired,
      }));
    const ratingAttention = latestByKey(
      ratingRecords,
      (record) => `${record.userId || ""}:${record.ratingId || ""}`,
    )
      .filter((record) => needsExpirationAttention(record.expireddate))
      .map((record) => ({
        id: record.id,
        ...serializeCredentialUser(record),
        rating: record.rating?.rating || "Unspecified",
        expiredAt: record.expireddate,
      }));

    return res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        users,
        branches,
        branchUnits,
        sectors,
        roles,
        professions,
      },
      licenses: {
        expired: expiredLicenses,
        expiringWithin30Days: expiringLicenses,
      },
      expirationAttention: {
        ratings: ratingAttention,
        medex: medexAttention,
        ielp: ielpAttention,
      },
      roleDistribution: roleDistribution.map((item) => ({
        role: item.role || "Unspecified",
        users: item._count.userRoles,
      })),
      branchDistribution: branchList
        .map((item) => ({
          branch: item.branch || "Unspecified",
          users: usersByBranch.get(item.id) || 0,
        }))
        .sort((a, b) => b.users - a.users),
      recentUsers: recentUsers.map((user) => ({
        nik: user.nik,
        name: user.name,
        branch: user.branch?.branch || null,
        roles: user.userRoles
          .map((userRole) => userRole.roles?.role)
          .filter(Boolean),
        createdAt: user.createdAt,
      })),
      activeDutyUsers: Array.from(
        new Map(
          activeDutyLogBooks.map((logBook) => [logBook.userNik, logBook]),
        ).values(),
      ).map((logBook) => ({
        logBookId: logBook.id,
        nik: logBook.userNik,
        name: logBook.user?.name || null,
        branch: logBook.user?.branch?.branch || null,
        branchUnit: logBook.user?.branchUnit?.unit || null,
        timeIn: logBook.timeIn,
        medexExpired: logBook.user?.medex?.[0]?.expired || null,
        ielpExpired: logBook.user?.ielp?.[0]?.expired || null,
        ielpLevel: logBook.user?.ielp?.[0]?.level || null,
        ratings: (logBook.user?.userRatings || []).map((userRating) => ({
          name: userRating.rating?.rating || "Unspecified",
          expiredAt: userRating.expireddate,
        })),
        shift: logBook.shift?.shiftName?.shift || null,
        dutyReportId: logBook.dutyReport?.id || null,
        dutyDate: logBook.dutyReport?.shiftDate || null,
        cwp: logBook.cwp
          ? {
              id: logBook.cwp.id,
              name: logBook.cwp.cwp,
              rating: logBook.cwp.rating?.rating || null,
            }
          : null,
      })),
      ongoingIssues: ongoingIssues.map((issue) => ({
        id: issue.id,
        branch: issue.branch?.branch || null,
        equipment: issue.equipment?.equipment || null,
        description: issue.other || issue.messages?.[0]?.message || null,
        latestMessage: issue.messages?.[0]?.message || null,
        relatedMessages: issue.messages.map((message) => ({
          message: message.message,
          createdAt: message.createdAt,
        })),
        reporterNik: issue.reporterUser?.nik || null,
        reporterName: issue.reporterUser?.name || null,
        start: issue.start,
        finish: issue.finish,
        isClosed: issue.isClosed,
        updatedAt: issue.updatedAt,
        escalationEnabled: issue.escalationEnabled,
        escalation: issue.escalations?.[0]
          ? {
              level: issue.escalations[0].escalationLevel?.level || null,
              status: issue.escalations[0].status,
              dueAt: issue.escalations[0].dueAt,
              triggeredAt: issue.escalations[0].triggeredAt,
            }
          : null,
        dutyReports: issue.dutyReportLinks.map((link) => ({
          id: link.dutyReportId,
          attachedAt: link.attachedAt,
          shiftDate: link.dutyReport.shiftDate,
          shift: link.dutyReport.shiftName?.shift || null,
        })),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getDashboardGeneralAdmin = (req, res) =>
  getDashboardAdmin(req, res, "general");

const getDashboardBranchAdmin = (req, res) =>
  getDashboardAdmin(req, res, "branch");

const getDashboardBranchUnitAdmin = (req, res) =>
  getDashboardAdmin(req, res, "branchUnit");

export {
  getDashboardOperational,
  getDashboardGeneralAdmin,
  getDashboardBranchAdmin,
  getDashboardBranchUnitAdmin,
  postDashboardToken,
  getDashboardBriefings,
};
