import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getBranchUnitId = (req) => req.user?.branchUnitId;

const getBranchUnitSectors = async (branchUnitId) =>
  prisma.sector.findMany({
    where: {
      branchUnitId,
      deletedAt: null,
    },
    select: {
      id: true,
      sector: true,
    },
    orderBy: {
      sector: "asc",
    },
  });

const getRelatedCwpIds = async (branchUnitId) => {
  const sectors = await getBranchUnitSectors(branchUnitId);
  const sectorIds = sectors.map((sector) => sector.id);

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

const getSectorCwps = async (req, res) => {
  try {
    const branchUnitId = getBranchUnitId(req);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const sectors = await prisma.sector.findMany({
      where: {
        branchUnitId,
        deletedAt: null,
      },
      include: {
        sectorCwps: {
          where: {
            deletedAt: null,
            cwp: {
              deletedAt: null,
            },
          },
          include: {
            cwp: {
              include: {
                rating: true,
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
      orderBy: {
        sector: "asc",
      },
    });

    res.json(sectors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSectorCwpOptions = async (req, res) => {
  try {
    const branchUnitId = getBranchUnitId(req);
    const sectorId = parsePositiveInt(req.query.sectorId);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const sectors = await getBranchUnitSectors(branchUnitId);
    if (sectorId && !sectors.some((sector) => sector.id === sectorId)) {
      return res.status(404).json({ message: "Sector not found." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);
    const assignedToOtherSectors = relatedCwpIds.length
      ? await prisma.sectorCwp.findMany({
          where: {
            deletedAt: null,
            cwpId: { in: relatedCwpIds },
            ...(sectorId ? { sectorId: { not: sectorId } } : {}),
          },
          select: { cwpId: true },
        })
      : [];
    const unavailableCwpIds = new Set(
      assignedToOtherSectors
        .map((assignment) => assignment.cwpId)
        .filter((cwpId) => Number.isInteger(cwpId)),
    );
    const availableCwpIds = relatedCwpIds.filter(
      (cwpId) => !unavailableCwpIds.has(cwpId),
    );
    const cwps = availableCwpIds.length
      ? await prisma.cwp.findMany({
          where: {
            id: {
              in: availableCwpIds,
            },
            deletedAt: null,
          },
          include: {
            rating: true,
          },
          orderBy: {
            cwp: "asc",
          },
        })
      : [];

    res.json({ sectors, cwps });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateSectorCwps = async (req, res) => {
  try {
    const branchUnitId = getBranchUnitId(req);
    const paramsSectorId = parsePositiveInt(req.params.sectorId);
    const sectorId = parsePositiveInt(req.body.sectorId) || paramsSectorId;
    const cwpIds = Array.isArray(req.body.cwpIds)
      ? [
          ...new Set(
            req.body.cwpIds
              .map((cwpId) => parsePositiveInt(cwpId))
              .filter(Boolean),
          ),
        ]
      : [];

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!sectorId) {
      return res.status(400).json({ message: "Sector is required." });
    }

    const sector = await prisma.sector.findFirst({
      where: {
        id: sectorId,
        branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        sector: true,
      },
    });

    if (!sector) {
      return res.status(404).json({ message: "Sector not found." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);
    const invalidCwpIds = cwpIds.filter((cwpId) => !relatedCwpIds.includes(cwpId));

    if (invalidCwpIds.length > 0) {
      return res.status(400).json({
        message: "One or more selected CWP are not related to your branch unit.",
      });
    }

    const assignmentsInOtherSectors = cwpIds.length
      ? await prisma.sectorCwp.findMany({
          where: {
            cwpId: { in: cwpIds },
            sectorId: { not: sectorId },
            deletedAt: null,
          },
          select: {
            cwpId: true,
            cwp: { select: { cwp: true } },
            sector: { select: { sector: true } },
          },
        })
      : [];

    if (assignmentsInOtherSectors.length > 0) {
      const assignments = assignmentsInOtherSectors
        .map(
          (item) =>
            `${item.cwp?.cwp || `CWP ${item.cwpId}`} (${item.sector?.sector || "another sector"})`,
        )
        .join(", ");
      return res.status(409).json({
        message: `The following CWP are already assigned: ${assignments}.`,
      });
    }

    const currentSectorCwps = await prisma.sectorCwp.findMany({
      where: {
        sectorId,
      },
    });

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const sectorCwp of currentSectorCwps) {
        if (!sectorCwp.cwpId) continue;

        const shouldBeActive = cwpIds.includes(sectorCwp.cwpId);
        if (!shouldBeActive && !sectorCwp.deletedAt) {
          await tx.sectorCwp.update({
            where: {
              id: sectorCwp.id,
            },
            data: {
              deletedAt: now,
            },
          });
        }
      }

      for (const cwpId of cwpIds) {
        const existingSectorCwp = currentSectorCwps.find(
          (sectorCwp) => sectorCwp.cwpId === cwpId,
        );

        if (existingSectorCwp) {
          if (existingSectorCwp.deletedAt) {
            await tx.sectorCwp.update({
              where: {
                id: existingSectorCwp.id,
              },
              data: {
                deletedAt: null,
              },
            });
          }
          continue;
        }

        await tx.sectorCwp.create({
          data: {
            sectorId,
            cwpId,
          },
        });
      }
    });

    res.json({
      success: true,
      message: `CWP assignment for sector ${sector.sector || sector.id} has been updated.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getSectorCwps, getSectorCwpOptions, updateSectorCwps };
