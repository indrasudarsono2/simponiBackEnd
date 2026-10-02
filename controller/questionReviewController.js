import prisma from "../lib/prisma.js";

const groupSelect = {
  where: { deletedAt: null },
  select: {
    sector: { select: { id: true, sector: true } },
    questionGroup: {
      select: {
        id: true,
        group: true,
        subBranchUnitRating: {
          select: { rating: { select: { id: true, rating: true } } }
        }
      }
    }
  }
};

const getQuestionReview = async (req, res) => {
  try {
    const branchUnitId = Number(req.user?.branchUnitId);
    if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(400).json({ message: "Your account does not have a branch unit." });
    }

    if (req.query.view === "ratings") {
      const assignments = await prisma.subBranchUnitRating.findMany({
        where: { deletedAt: null, sector: { branchUnitId, deletedAt: null } },
        select: { rating: { select: { id: true, rating: true, deletedAt: true } } }
      });
      const ratings = [...new Map(assignments
        .map(({ rating }) => rating)
        .filter((rating) => rating && !rating.deletedAt)
        .map((rating) => [rating.id, { id: rating.id, rating: rating.rating }])).values()]
        .sort((a, b) => (a.rating || "").localeCompare(b.rating || ""));
      return res.json({ ratings });
    }

    const ratingId = Number(req.query.ratingId);
    const type = req.query.type;
    if (!Number.isInteger(ratingId) || ratingId <= 0 || !["ESSAY", "MULTIPLE_CHOICE"].includes(type)) {
      return res.status(400).json({ message: "Select a question type and a valid rating." });
    }
    const assignment = await prisma.subBranchUnitRating.findFirst({
      where: { ratingId, deletedAt: null, sector: { branchUnitId, deletedAt: null } },
      select: { id: true }
    });
    if (!assignment) return res.status(404).json({ message: "Rating is not available in your branch unit." });

    const groupWhere = {
      deletedAt: null,
      questionGroup: {
        deletedAt: null,
        subBranchUnitRating: {
          ratingId,
          deletedAt: null,
          sector: { branchUnitId, deletedAt: null }
        }
      }
    };
    const commonWhere = { branchUnitId, deletedAt: null, isActive: true };
    const orderBy = [{ updatedAt: "desc" }, { id: "desc" }];
    const questions = type === "ESSAY"
      ? await prisma.essay.findMany({
        where: { ...commonWhere, essayQuestionGroups: { some: groupWhere } },
        select: { id: true, question: true, image: true, version: true, updatedAt: true,
          essayQuestionGroups: { ...groupSelect, where: groupWhere } },
        orderBy
      })
      : await prisma.multipleChoice.findMany({
        where: { ...commonWhere, isMats: false, mcQuestionGroups: { some: groupWhere } },
        select: { id: true, question: true, image: true, a: true, b: true, c: true, d: true,
          version: true, updatedAt: true, mcQuestionGroups: { ...groupSelect, where: groupWhere } },
        orderBy
      });

    return res.json({ questions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export { getQuestionReview };
