import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeCwp = (value = "") => String(value).trim().toUpperCase();

const getBranchUnitSectorIds = async (branchUnitId) => {
  const sectors = await prisma.sector.findMany({
    where: {
      branchUnitId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  return sectors.map((sector) => sector.id);
};

const getRelatedRatings = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const sectorIds = await getBranchUnitSectorIds(branchUnitId);

    if (sectorIds.length === 0) {
      return res.json([]);
    }

    const subBranchUnitRatings = await prisma.subBranchUnitRating.findMany({
      where: {
        sectorId: {
          in: sectorIds,
        },
        deletedAt: null,
        rating: {
          deletedAt: null,
        },
      },
      include: {
        rating: true,
      },
      orderBy: {
        ratingId: "asc",
      },
    });

    const ratingMap = new Map();

    for (const item of subBranchUnitRatings) {
      if (!item.rating) continue;
      ratingMap.set(item.rating.id, item.rating);
    }

    res.json([...ratingMap.values()]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const isRelatedRating = async (branchUnitId, ratingId) => {
  const sectorIds = await getBranchUnitSectorIds(branchUnitId);

  if (sectorIds.length === 0) return false;

  const rating = await prisma.subBranchUnitRating.findFirst({
    where: {
      sectorId: {
        in: sectorIds,
      },
      ratingId,
      deletedAt: null,
      rating: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(rating);
};

const getCwps = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const sectorIds = await getBranchUnitSectorIds(branchUnitId);
    const relatedRatings = sectorIds.length
      ? await prisma.subBranchUnitRating.findMany({
          where: {
            sectorId: {
              in: sectorIds,
            },
            deletedAt: null,
            ratingId: {
              not: null,
            },
          },
          select: {
            ratingId: true,
          },
        })
      : [];
    const ratingIds = [
      ...new Set(
        relatedRatings
          .map((item) => item.ratingId)
          .filter((ratingId) => Number.isInteger(ratingId)),
      ),
    ];

    const cwps = await prisma.cwp.findMany({
      where: {
        deletedAt: null,
        ratingId: {
          in: ratingIds,
        },
      },
      include: {
        rating: true,
      },
      orderBy: {
        cwp: "asc",
      },
    });

    res.json(cwps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addCwp = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const cwp = normalizeCwp(req.body.cwp);
    const ratingId = parsePositiveInt(req.body.ratingId);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!cwp || !ratingId) {
      return res.status(400).json({
        message: "CWP and rating are required.",
      });
    }

    if (!(await isRelatedRating(branchUnitId, ratingId))) {
      return res.status(400).json({
        message: "Selected rating is not related to your branch unit.",
      });
    }

    const existingCwp = await prisma.cwp.findFirst({
      where: {
        cwp,
        ratingId,
        deletedAt: null,
      },
    });

    if (existingCwp) {
      return res.status(409).json({
        message: `CWP ${cwp} already exists for this rating.`,
      });
    }

    const createdCwp = await prisma.cwp.create({
      data: {
        cwp,
        ratingId,
      },
      include: {
        rating: true,
      },
    });

    res.status(201).json({
      success: true,
      cwp: createdCwp,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCwp = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parseInt(req.params.id, 10);
    const cwp = normalizeCwp(req.body.cwp);
    const ratingId = parsePositiveInt(req.body.ratingId);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid CWP ID." });
    }

    if (!cwp || !ratingId) {
      return res.status(400).json({
        message: "CWP and rating are required.",
      });
    }

    if (!(await isRelatedRating(branchUnitId, ratingId))) {
      return res.status(400).json({
        message: "Selected rating is not related to your branch unit.",
      });
    }

    const currentCwp = await prisma.cwp.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!currentCwp) {
      return res.status(404).json({ message: "CWP not found." });
    }

    if (!currentCwp.ratingId) {
      return res.status(403).json({
        message: "This CWP does not have a related rating.",
      });
    }

    if (!(await isRelatedRating(branchUnitId, currentCwp.ratingId))) {
      return res.status(403).json({
        message: "This CWP is not related to your branch unit.",
      });
    }

    const duplicateCwp = await prisma.cwp.findFirst({
      where: {
        id: {
          not: id,
        },
        cwp,
        ratingId,
        deletedAt: null,
      },
    });

    if (duplicateCwp) {
      return res.status(409).json({
        message: `CWP ${cwp} already exists for this rating.`,
      });
    }

    const updatedCwp = await prisma.cwp.update({
      where: {
        id,
      },
      data: {
        cwp,
        ratingId,
      },
      include: {
        rating: true,
      },
    });

    res.json({
      success: true,
      cwp: updatedCwp,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCwp = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parseInt(req.params.id, 10);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid CWP ID." });
    }

    const cwp = await prisma.cwp.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!cwp) {
      return res.status(404).json({ message: "CWP not found." });
    }

    if (!cwp.ratingId) {
      return res.status(403).json({
        message: "This CWP does not have a related rating.",
      });
    }

    if (!(await isRelatedRating(branchUnitId, cwp.ratingId))) {
      return res.status(403).json({
        message: "This CWP is not related to your branch unit.",
      });
    }

    await prisma.cwp.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getCwps, getRelatedRatings, addCwp, updateCwp, deleteCwp };
