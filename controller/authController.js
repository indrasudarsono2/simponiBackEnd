import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const login = async (req, res) => {
  try {
    const { nik, password } = req.body;
    
    if (!nik || !password) {
      return res.status(400).json({
        success: false,
        message: "nik and password are required",
      });
    }

    
    const user = await prisma.user.findFirst({
      where: {
        nik: nik,
        deletedAt: null,
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        password: true,
        sectorId: true,
        branchId: true,
        branchUnitId: true,
        professionInBranchId: true,
        professionInBranch: {
          select: {
            professionId: true
          }
        },
        userRoles: {
          select: {
            roles: {
              select: {
                role: true,
                rolesMenu: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    menu: {
                      select: {
                        menu: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || "");
    // if (!isPasswordValid) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid credentials",
    //   });
    // }

    const roleNames = (user.userRoles || [])
      .map((ur) => ur.roles?.role)
      .filter(Boolean);


    const payload = {
      nik: user.nik,
      name: user.name,
      // email: user.email,
      roles: user.userRoles,
      branchId: user.branchId,
      branchUnitId: user.branchUnitId,
      sectorId: user.sectorId,
      professionInBranchId: user.professionInBranchId,
      professionId: user.professionInBranch ? user.professionInBranch.professionId : null,
      roleNames: roleNames
    };
   
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "change_this_secret_in_env",
      { expiresIn: "3h" }
    );
  
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        nik: user.nik,
        name: user.name,
        email: user.email,
        roles: user.userRoles,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export { login };
