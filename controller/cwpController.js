import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getCwps = async (req, res) => {
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
    // Logic to fetch regions (e.g., from a database)
    res.json(sectors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// const sectorGetBranchUnit = async (req, res) => {
//   try {
//     const branchUnit = await prisma.branchUnit.findFirst({
//     where: {
//       id: parseInt(config.branchUnitId)
//     },
//     include: {
//       branch: true
//     }
//   });
//     res.json(branchUnit);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// }

// const addSector = async (req, res) => {
//   const { sector, branchUnitId } = req.body;
//   await prisma.sector.create({
//     data: {
//       branchUnitId: parseInt(branchUnitId),
//       sector: sector
//     }
//   });

//   res.status(201).json({ success: true, message: `Sector ${sector} added` });
// };

// const getSectorById = async (req, res) => {
//   const { id } = req.params;
//   const { sector } = req.body;
//     await prisma.sector.update({
//     where: { id: parseInt(id) },
//     data: { sector: sector }
//   });
//   res.json({ success: true, sectorId: id, name: `Sector ${id}` });
// };

// const deleteSectorById = async (req, res) => {
//   const now = new Date();
//   const { id } = req.params;
 
//     await prisma.sector.update({
//     where: { id: parseInt(id) },
//     data: { deletedAt: now }
//   });
//   res.json({ success: true, sectorId: id, name: `Sector ${id}` });
// };

export { getSectors };