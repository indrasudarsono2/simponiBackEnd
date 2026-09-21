import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getRatingSummary = async (req, res) => {
  const branchUnitId = req.user.branchUnitId;
  // const branchUnitId = 17
  try {
    const now = dayjs().utc().toDate();
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId,
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        applicationDocs: {
          where: { deletedAt: null },
          select: {
            appRatings: {
              where: {
                deletedAt: null,
                examinationInvalidations: { some: {} }
              },
              select: {
                id: true,
                ratingId: true,
                rating: { select: { rating: true } },
                examinationInvalidations: {
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  select: { id: true, createdAt: true }
                },
                finalScores: {
                  where: { deletedAt: null, isInvalidated: false },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  select: { id: true, createdAt: true }
                }
              }
            }
          }
        },
        userRatings: {
          where: {
            deletedAt: null,
            expireddate: {
              gte: now
            }
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" }
          ],
          select: {
            id: true,
            ratingId: true,
            expireddate: true,
            createdAt: true,
            rating: {
              where: {
                deletedAt: null,
              },
              select: {
                rating: true
              }
            }
          }
        }
      }
    })

    const usersWithLatestRatings = user.map((item) => {
      const candidates = item.userRatings.map((userRating) => ({
        ...userRating,
        status: "ACTIVE",
        appRatingId: null,
        effectiveAt: userRating.createdAt
      }));

      for (const applicationDoc of item.applicationDocs) {
        for (const appRating of applicationDoc.appRatings) {
          const invalidation = appRating.examinationInvalidations[0];
          if (!invalidation || appRating.finalScores.length > 0) continue;
          candidates.push({
            id: -invalidation.id,
            ratingId: appRating.ratingId,
            expireddate: null,
            createdAt: invalidation.createdAt,
            rating: appRating.rating,
            status: "RE_EXAMINATION_REQUIRED",
            appRatingId: appRating.id,
            effectiveAt: invalidation.createdAt
          });
        }
      }

      candidates.sort((a, b) => {
        const dateDifference = new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime();
        return dateDifference || b.id - a.id;
      });

      const seenRatingIds = new Set();
      const latestRatings = candidates.filter((userRating) => {
        const key = userRating.ratingId == null
          ? `missing-${userRating.id}`
          : String(userRating.ratingId);
        if (seenRatingIds.has(key)) return false;
        seenRatingIds.add(key);
        return true;
      });

      const { applicationDocs, ...userWithoutApplications } = item;
      return { ...userWithoutApplications, userRatings: latestRatings };
    });

    const sortUser = usersWithLatestRatings.sort((a, b) => {
      const nameA = String(a.name || "").toUpperCase();
      const nameB = String(b.name || "").toUpperCase();

      if (nameA < nameB) {
        return -1
      }

      if (nameA > nameB) {
        return 1
      }

      return 0
    })

    res.json(sortUser)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getRatingSummary } ;
