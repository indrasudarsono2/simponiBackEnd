import prisma from "../lib/prisma.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getOptions = async (_req, res) => {
  try {
    const [branches, units] = await Promise.all([
      prisma.branch.findMany({
        where: { deletedAt: null },
        select: { id: true, branch: true },
        orderBy: { branch: "asc" },
      }),
      prisma.branchUnit.findMany({
      where: { deletedAt: null },
      select: { id: true, branchId: true, unit: true },
      orderBy: [{ branchId: "asc" }, { unit: "asc" }],
      }),
    ]);
    res.json({ branches, units });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPerformance = async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const branchUnitId = Number(req.body?.branchUnitId);
    if (!Number.isInteger(branchId) || branchId <= 0 || !Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(400).json({ message: "Select a branch and branch unit." });
    }

    const unit = await prisma.branchUnit.findFirst({
      where: { id: branchUnitId, branchId, deletedAt: null, branch: { is: { deletedAt: null } } },
      select: { id: true, unit: true, branch: { select: { branch: true } } },
    });
    if (!unit) return res.status(404).json({ message: "Branch unit not found." });

    const startValue = req.body?.startDate;
    const endValue = req.body?.endDate;
    if (!DATE_PATTERN.test(String(startValue || "")) || !DATE_PATTERN.test(String(endValue || ""))) {
      return res.status(400).json({ message: "Both dates must use YYYY-MM-DD format." });
    }
    const start = new Date(`${startValue}T00:00:00.000+07:00`);
    const end = new Date(`${endValue}T23:59:59.999+07:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ message: "Invalid date range." });
    }
    const eventDate = { gte: start, lte: end };

    const scores = await prisma.finalScore.findMany({
      where: {
        deletedAt: null,
        isInvalidated: false,
        appRating: {
          is: {
            deletedAt: null,
            applicationDoc: {
              is: {
                deletedAt: null,
                eventUser: {
                  is: {
                    deletedAt: null,
                    user: { is: { branchId, branchUnitId, deletedAt: null } },
                    event: { is: { deletedAt: null, createdAt: eventDate } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        finalScore: true,
        essayScore: true,
        multipleChoiceScore: true,
        status: { select: { status: true } },
        appRating: {
          select: {
            ratingId: true,
            rating: { select: { rating: true } },
            applicationDoc: {
              select: {
                userNik: true,
                eventUser: { select: { eventId: true } },
              },
            },
          },
        },
        multipleChoiceCorrections: {
          where: { deletedAt: null },
          select: {
            isTrue: true,
            mandatoryItem: { select: { id: true, mandatory: true } },
            multipleChoice: {
              select: {
                isMats: true,
                mandatoryItem: { select: { id: true, mandatory: true } },
                mcQuestionGroups: {
                  where: { deletedAt: null },
                  select: { questionGroup: { select: { group: true } } },
                },
              },
            },
          },
        },
      },
    });

    // One latest valid attempt for each user, event, and rating. Earlier rechecks
    // remain in the database but must not inflate branch-unit headline results.
    const latest = new Map();
    for (const score of scores) {
      const app = score.appRating?.applicationDoc;
      const ratingId = score.appRating?.ratingId;
      if (!app?.userNik || !app.eventUser?.eventId || !ratingId) continue;
      const key = `${app.userNik}:${app.eventUser.eventId}:${ratingId}`;
      if (!latest.has(key)) latest.set(key, score);
    }

    const ratings = new Map();
    const mats = new Map();
    for (const score of latest.values()) {
      const ratingId = score.appRating.ratingId;
      if (!ratings.has(ratingId)) ratings.set(ratingId, {
        ratingId,
        rating: score.appRating.rating?.rating || `Rating ${ratingId}`,
        members: new Set(),
        examinations: 0,
        scored: 0,
        sumTheory: 0,
        sumEssay: 0,
        essayCount: 0,
        sumMultipleChoice: 0,
        multipleChoiceCount: 0,
        passed: 0,
        failed: 0,
        groups: new Map(),
      });
      const item = ratings.get(ratingId);
      item.members.add(score.appRating.applicationDoc.userNik);
      item.examinations += 1;
      if (score.finalScore != null) {
        item.scored += 1;
        item.sumTheory += score.finalScore;
      }
      if (score.essayScore != null) {
        item.essayCount += 1;
        item.sumEssay += score.essayScore;
      }
      if (score.multipleChoiceScore != null) {
        item.multipleChoiceCount += 1;
        item.sumMultipleChoice += score.multipleChoiceScore;
      }
      const result = String(score.status?.status || "").toUpperCase();
      if (result === "SUCCESS") item.passed += 1;
      if (result === "FAILED") item.failed += 1;

      for (const correction of score.multipleChoiceCorrections) {
        if (correction.multipleChoice?.isMats) {
          const mandatory = correction.mandatoryItem || correction.multipleChoice.mandatoryItem;
          if (mandatory?.id && mandatory.mandatory) {
            if (!mats.has(mandatory.id)) mats.set(mandatory.id, { group: mandatory.mandatory, isTrue: 0, isFalse: 0, total: 0 });
            const item = mats.get(mandatory.id);
            item.total += 1;
            if (correction.isTrue === true) item.isTrue += 1;
            else item.isFalse += 1;
          }
          continue;
        }
        const groupNames = new Set(
          (correction.multipleChoice?.mcQuestionGroups || [])
            .map((link) => link.questionGroup?.group)
            .filter(Boolean),
        );
        for (const name of groupNames) {
          if (!item.groups.has(name)) item.groups.set(name, { group: name, correct: 0, total: 0 });
          const group = item.groups.get(name);
          group.total += 1;
          if (correction.isTrue === true) group.correct += 1;
        }
      }
    }

    res.json({
      branchUnit: unit,
      mats: [...mats.values()].map((item) => ({
        ...item,
        percentageTrue: item.total ? (item.isTrue / item.total) * 100 : 0,
      })).sort((a, b) => a.group.localeCompare(b.group)),
      ratings: [...ratings.values()].map((item) => ({
        ratingId: item.ratingId,
        rating: item.rating,
        members: item.members.size,
        examinations: item.examinations,
        scored: item.scored,
        averageTheory: item.scored ? item.sumTheory / item.scored : null,
        averageEssay: item.essayCount ? item.sumEssay / item.essayCount : null,
        averageMultipleChoice: item.multipleChoiceCount ? item.sumMultipleChoice / item.multipleChoiceCount : null,
        passed: item.passed,
        failed: item.failed,
        groups: [...item.groups.values()].map((group) => ({
          group: group.group,
          isTrue: group.correct,
          isFalse: group.total - group.correct,
          total: group.total,
          percentageTrue: group.total ? (group.correct / group.total) * 100 : 0,
        })).sort((a, b) => a.group.localeCompare(b.group)),
      })).sort((a, b) => a.rating.localeCompare(b.rating)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getOptions, getPerformance };
