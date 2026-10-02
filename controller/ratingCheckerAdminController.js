import prisma from "../lib/prisma.js";
import config from "../utils/config.js";

const getRatingCheckerAdmins = async (req, res) => {
  try {
    const sectors = await prisma.sector.findMany({
      where: {
        branchUnitId: req.user.branchUnitId,
        deletedAt: null
      },
      select: {
        id: true,
        sector: true,
        branchUnitId: true,
        branchUnit: {
          select: {
            id: true,
            unit: true,
            branchId: true,
            branch: {
              select: {
                id: true,
                branch: true
              }
            }
          }
        }
      }
    }); // Example using Prisma ORM

    const subBrancUnitRating = await prisma.subBranchUnitRating.findMany({
        where: {
          sectorId: {
            in: sectors.map(sector => sector.id)
          },
          deletedAt: null
        },
        include: {
          rating: true,
          sector: true
        }
      }
    );

    // Logic to fetch regions (e.g., from a database)
    res.json({subBrancUnitRating, sectors});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllRating = async (req, res) => {
  try {
    const ratings = await prisma.rating.findMany({
      where: {
        deletedAt: null
      }
    });

    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addRatingCheckerAdmins = async (req, res) => {
  try {
    const { sectorId, ratingId } = req.body;
    const parsedSectorId = Number(sectorId);
    const parsedRatingId = Number(ratingId);
    if (!Number.isInteger(parsedSectorId) || !Number.isInteger(parsedRatingId)) {
      return res.status(400).json({ message: "A valid sector and rating are required." });
    }

    const [sector, rating, existing] = await Promise.all([
      prisma.sector.findFirst({
        where: {
          id: parsedSectorId,
          branchUnitId: req.user.branchUnitId,
          deletedAt: null
        },
        select: { id: true }
      }),
      prisma.rating.findFirst({
        where: { id: parsedRatingId, deletedAt: null },
        select: { id: true }
      }),
      prisma.subBranchUnitRating.findFirst({
        where: { sectorId: parsedSectorId, ratingId: parsedRatingId, deletedAt: null },
        select: { id: true }
      })
    ]);
    if (!sector) {
      return res.status(403).json({ message: "The selected sector is outside your branch unit." });
    }
    if (!rating) {
      return res.status(400).json({ message: "The selected rating is unavailable." });
    }
    if (existing) {
      return res.status(409).json({ message: "This rating is already assigned to the selected sector." });
    }

    await prisma.subBranchUnitRating.create({
      data: {
        sectorId: parsedSectorId,
        ratingId: parsedRatingId
      }
    });
  
    res.status(201).json({ success: true, message: `Rating added to sector ${parsedSectorId}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRatingCheckerAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const { sectorId, ratingId } = req.body;
    const assignment = await prisma.subBranchUnitRating.findFirst({
      where: {
        id: parseInt(id),
        deletedAt: null,
        sector: { is: { branchUnitId: req.user.branchUnitId, deletedAt: null } }
      },
      select: { id: true }
    });
    const targetSector = await prisma.sector.findFirst({
      where: { id: Number(sectorId), branchUnitId: req.user.branchUnitId, deletedAt: null },
      select: { id: true }
    });
    if (!assignment || !targetSector) {
      return res.status(403).json({ message: "The rating assignment is outside your branch unit." });
    }
      await prisma.subBranchUnitRating.update({
      where: { id: parseInt(id) },
      data: {
        sectorId: sectorId,
        ratingId: ratingId
  }
    });
    res.json({ success: true, sectorId: id, name: `Sector` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteRatingCheckerAdminById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
    const assignment = await prisma.subBranchUnitRating.findFirst({
      where: {
        id: parseInt(id),
        deletedAt: null,
        sector: { is: { branchUnitId: req.user.branchUnitId, deletedAt: null } }
      },
      select: { id: true }
    });
    if (!assignment) {
      return res.status(404).json({ message: "Rating assignment was not found in your branch unit." });
    }
   
      await prisma.subBranchUnitRating.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, sectorId: id, name: `Sector ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getRatingCheckerAdmins, getAllRating, addRatingCheckerAdmins, getRatingCheckerAdminById, deleteRatingCheckerAdminById };
