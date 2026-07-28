import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";

// Function to generate default password
const generateDefaultPassword = () => {
  // Generate a default password (e.g., "password123" or based on timestamp)
  return "password123"; // You can customize this logic
};

const getUserBranch = async (req, res) => {
  try {
    const user = await prisma.user.findMany({
      where: {
        branchId: req.user.branchId,
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
        }
      },
      orderBy: {
        nik: 'asc'
      }
    })

    const professionInBranch = await prisma.professionInBranch.findMany({
      where: {
        deletedAt: null,
        branchId: req.user.branchId,
        // branchId: 1,
      },
      select: {
        id: true,
        profession: {
          select: {
            id: true,
            profession: true
          }
        }
      }
    })

    const branchUnit = await prisma.branchUnit.findMany({
      where: {
        deletedAt: null,
        branchId: req.user.branchId,
        // branchId: 1,
      }
    })
    // Logic to fetch regions (e.g., from a database)
    res.json({user, professionInBranch, branchUnit});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignUser = async (req, res) => {
  try {
    const {professionInBranchId, userNikList} = req.body
    const profession = await prisma.professionInBranch.findFirst({ where: { id: Number(professionInBranchId), branchId: req.user.branchId, deletedAt: null }, select: { id: true } });
    if (!profession) return res.status(404).json({ message: "Profession not found in your branch." });
    
   await prisma.user.updateMany({
    where: {
      deletedAt: null,
      nik: {
        in: userNikList
      },
      branchId: req.user.branchId
    },
    data: {
      professionInBranchId: parseInt(professionInBranchId)
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
    const {professionInBranchId, branchUnitId} = req.body
    const [user, profession, unit] = await Promise.all([
      prisma.user.findFirst({ where: { nik: id, branchId: req.user.branchId, deletedAt: null }, select: { nik: true } }),
      prisma.professionInBranch.findFirst({ where: { id: Number(professionInBranchId), branchId: req.user.branchId, deletedAt: null }, select: { id: true } }),
      prisma.branchUnit.findFirst({ where: { id: Number(branchUnitId), branchId: req.user.branchId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!user || !profession || !unit) return res.status(404).json({ message: "Scoped user, profession, or branch unit not found." });
    
    await prisma.user.update({
      where: { nik: id },
      data: {
        professionInBranchId: parseInt(professionInBranchId),
        branchUnitId: parseInt(branchUnitId)
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const assignBranchUnit = async(req, res) => {
  try {
    const {branchUnitId, userNikList} = req.body
    const unit = await prisma.branchUnit.findFirst({ where: { id: Number(branchUnitId), branchId: req.user.branchId, deletedAt: null }, select: { id: true } });
    if (!unit) return res.status(404).json({ message: "Branch unit not found in your branch." });
    
   await prisma.user.updateMany({
    where: {
      deletedAt: null,
      nik: {
        in: userNikList
      },
      branchId: req.user.branchId
    },
    data: {
      branchUnitId: parseInt(branchUnitId)
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
}

// const deleteUserById = async (req, res) => {
//   try {
//     const now = new Date();
//     const { id } = req.params;
   
//     await prisma.user.update({
//       where: {nik: id},
//       data: { deletedAt: now }
//     });
//     res.status(200).json({ success: true });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

export { getUserBranch, assignUser, updatedata, assignBranchUnit };
