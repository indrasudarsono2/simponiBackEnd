import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getBranchUnitId = (req) => req.user?.branchUnitId;

const normalizeFrequency = (value = "") => String(value).trim().toUpperCase();

const parseBoolean = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

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

const getRelatedCwpIds = async (branchUnitId) => {
  const sectorIds = await getBranchUnitSectorIds(branchUnitId);

  if (sectorIds.length === 0) return [];

  const relatedRatings = await prisma.subBranchUnitRating.findMany({
    where: {
      sectorId: {
        in: sectorIds,
      },
      ratingId: {
        not: null,
      },
      deletedAt: null,
      rating: {
        deletedAt: null,
      },
    },
    select: {
      ratingId: true,
    },
  });

  const ratingIds = [
    ...new Set(
      relatedRatings
        .map((item) => item.ratingId)
        .filter((ratingId) => Number.isInteger(ratingId)),
    ),
  ];

  if (ratingIds.length === 0) return [];

  const cwps = await prisma.cwp.findMany({
    where: {
      deletedAt: null,
      ratingId: {
        in: ratingIds,
      },
    },
    select: {
      id: true,
    },
  });

  return cwps.map((cwp) => cwp.id);
};

const getCwpFrequencies = async (req, res) => {
  try {
    const branchUnitId = getBranchUnitId(req);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);

    const cwps = relatedCwpIds.length
      ? await prisma.cwp.findMany({
          where: {
            id: {
              in: relatedCwpIds,
            },
            deletedAt: null,
          },
          include: {
            rating: true,
            cwpFrequencies: {
              where: {
                deletedAt: null,
              },
              orderBy: [
                {
                  isPrimary: "desc",
                },
                {
                  frequency: "asc",
                },
              ],
            },
          },
          orderBy: {
            cwp: "asc",
          },
        })
      : [];

    res.json(cwps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCwpFrequencies = async (req, res) => {
  try {
    const branchUnitId = getBranchUnitId(req);
    const cwpId = parsePositiveInt(req.params.cwpId);
    const frequencies = Array.isArray(req.body.frequencies)
      ? req.body.frequencies
      : [];

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!cwpId) {
      return res.status(400).json({ message: "CWP is required." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);

    if (!relatedCwpIds.includes(cwpId)) {
      return res.status(403).json({
        message: "Selected CWP is not related to your branch unit.",
      });
    }

    const cwp = await prisma.cwp.findFirst({
      where: {
        id: cwpId,
        deletedAt: null,
      },
      select: {
        id: true,
        cwp: true,
      },
    });

    if (!cwp) {
      return res.status(404).json({ message: "CWP not found." });
    }

    const normalizedFrequencies = frequencies
      .map((item) => ({
        frequency: normalizeFrequency(item.frequency),
        isPrimary: parseBoolean(item.isPrimary),
      }))
      .filter((item) => item.frequency);

    const duplicateFrequency = normalizedFrequencies.find(
      (item, index) =>
        normalizedFrequencies.findIndex(
          (other) => other.frequency === item.frequency,
        ) !== index,
    );

    if (duplicateFrequency) {
      return res.status(409).json({
        message: `Frequency ${duplicateFrequency.frequency} is duplicated.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.cwpFrequency.updateMany({
        where: {
          cwpId,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      if (normalizedFrequencies.length) {
        await tx.cwpFrequency.createMany({
          data: normalizedFrequencies.map((item) => ({
            cwpId,
            frequency: item.frequency,
            isPrimary: item.isPrimary,
          })),
        });
      }
    });

    res.json({
      success: true,
      message: `Frequencies for CWP ${cwp.cwp || cwp.id} have been updated.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getCwpFrequencies, updateCwpFrequencies };
