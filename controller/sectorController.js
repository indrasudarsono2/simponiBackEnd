import prisma from "../lib/prisma.js";
import config from "../utils/config.js";

const getSectors = async (req, res) => {
  try {
    const sectors = await prisma.sector.findMany({
      where: {
        branchUnitId: parseInt(req.user.branchUnitId),
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
    // Logic to fetch regions (e.g., from a database)
    res.json(sectors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sectorGetBranchUnit = async (req, res) => {
  try {
    const branchUnit = await prisma.branchUnit.findFirst({
    where: {
      id: req.user.branchUnitId
      // id: 4
    },
    include: {
      branch: true
    }
  });
    res.json(branchUnit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const addSector = async (req, res) => {
  try {
    const { sector } = req.body;
    const branchUnitId = Number(req.user?.branchUnitId);
    if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }
    await prisma.sector.create({
      data: {
        branchUnitId,
        sector: sector
      }
    });
  
    res.status(201).json({ success: true, message: `Sector ${sector} added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSectorById = async (req, res) => {
  try {
    const { id } = req.params;
    const { sector } = req.body;
    const existingSector = await prisma.sector.findFirst({
      where: {
        id: parseInt(id),
        branchUnitId: req.user.branchUnitId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!existingSector) {
      return res.status(404).json({ message: "Sector not found." });
    }
    await prisma.sector.update({
      where: { id: existingSector.id },
      data: { sector: sector }
    });
    res.json({ success: true, sectorId: id, name: `Sector ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteSectorById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;

    await prisma.sector.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now },
    });
    
    await prisma.user.updateMany({
      where: {
        sectorId: parseInt(id)
      },
      data: {
        sectorId: null
      }
    })

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getSectors, sectorGetBranchUnit, addSector, getSectorById, deleteSectorById };
