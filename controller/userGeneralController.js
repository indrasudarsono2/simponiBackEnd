import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";

// Function to generate default password
const generateDefaultPassword = () => {
  // Generate a default password (e.g., "password123" or based on timestamp)
  return "password123"; // You can customize this logic
};

const getUserGeneral = async (req, res) => {
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        branch: {
          select: {
            id: true,
            branch: true
          }
        },
      },
      orderBy: {
        nik: 'asc'
      }
    })

    const branch = await prisma.branch.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        branch: true
      }
    })
    // Logic to fetch regions (e.g., from a database)
    res.json({user, branch});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addUserGeneral = async (req, res) => {
  try {
    const { name, nik, licenseUserId, branchId } = req.body;
    
    // Check if NIK already exists
    const existingUser = await prisma.user.findUnique({
      where: { nik: nik }
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: "NIK already exist" 
      });
    }

    const defaultPassword = generateDefaultPassword();
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    await prisma.user.create({
      data: {
        name,
        nik,
        licenseUserId,
        branchId: parseInt(branchId),
        password: hashedPassword,
        userRoles: {
          create: {
            roleId: 6
          }
        }
      }
    });
    
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

const getUpdateByUserId = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nik, licenseUserId, branchId } = req.body;

    const defaultPassword = generateDefaultPassword();
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const userNow = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        nik: req.user.nik
      }
    })

    const update = {
      name,
      nik,
      licenseUserId,
      branchId: parseInt(branchId),
      password: hashedPassword
    }

    if(userNow.branchId !== parseInt(branchId)){
      update["sectorId"] = null;
      update["professionInBranchId"] = null;
      update["branchUnitId"] = null
    }

    await prisma.user.update({
      where: { nik: id },
      data: update
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUserById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
    await prisma.user.update({
      where: {nik: id},
      data: { deletedAt: now }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getUserGeneral, addUserGeneral, getUpdateByUserId, deleteUserById };
