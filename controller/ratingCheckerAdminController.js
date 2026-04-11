import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

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
    await prisma.subBranchUnitRating.create({
      data: {
        sectorId: sectorId,
        ratingId: ratingId
      }
    });
  
    res.status(201).json({ success: true, message: `Rating added to sector ${sectorId}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRatingCheckerAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const { sectorId, ratingId } = req.body;
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