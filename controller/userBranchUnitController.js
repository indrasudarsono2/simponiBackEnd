import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";

// Function to generate default password
const generateDefaultPassword = () => {
  // Generate a default password (e.g., "password123" or based on timestamp)
  return "password123"; // You can customize this logic
};

const getUserBranchUnit = async (req, res) => {
  try {
    const branchUnitId = Number(req.user?.branchUnitId);

    if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(403).json({
        message: "Your account has no branch unit assigned. Please contact an administrator.",
      });
    }

    const user = await prisma.user.findMany({
      where: {
        branchUnitId,
        // branchId: 1,
        deletedAt: null
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        professionInBranch: {
          select: {
            id: true,
            profession: {
              select: {
                id: true,
                profession: true,
                deletedAt: true
              }
            }
          }
        },
        branchUnit: {
          select: {
            id: true,
            unit: true,
            deletedAt: true
          }
        },
        sector: {
          select: {
            id: true,
            sector: true,
            deletedAt: true
          }
        }
      },
      orderBy: {
        nik: 'asc'
      }
    })

    const sector = await prisma.sector.findMany({
      where: {
        deletedAt: null,
        branchUnitId,
        // branchUnitId: 5,
      }
    })
    // Logic to fetch regions (e.g., from a database)
    res.json({user, sector});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignSector = async (req, res) => {
  try {
    const {sectorId, userNikList} = req.body
    const sector = await prisma.sector.findFirst({ where: { id: Number(sectorId), branchUnitId: req.user.branchUnitId, deletedAt: null }, select: { id: true } });
    if (!sector) return res.status(404).json({ message: "Sector not found in your branch unit." });
    
   await prisma.user.updateMany({
    where: {
      deletedAt: null,
      nik: {
        in: userNikList
      },
      branchUnitId: req.user.branchUnitId
    },
    data: {
      sectorId: parseInt(sectorId)
    }
   })
    res.status(200).json({ 
      success: true,
      message: "User created successfully"
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

const updatedata = async (req, res) => {
  try {
    const { id } = req.params;
    const {sectorId} = req.body
    const [user, sector] = await Promise.all([
      prisma.user.findFirst({ where: { nik: id, branchUnitId: req.user.branchUnitId, deletedAt: null }, select: { nik: true } }),
      prisma.sector.findFirst({ where: { id: Number(sectorId), branchUnitId: req.user.branchUnitId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!user || !sector) return res.status(404).json({ message: "User or sector not found in your branch unit." });
    
    await prisma.user.update({
      where: { nik: id },
      data: {
        sectorId: parseInt(sectorId),
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getUserBranchUnit, assignSector, updatedata };
