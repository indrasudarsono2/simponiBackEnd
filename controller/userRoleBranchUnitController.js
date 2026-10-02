import prisma from "../lib/prisma.js";

const getUserRoleBranchUnit = async (req, res) => {
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchUnitId: req.user.branchUnitId
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
        userRoles: {
          select: {
            id: true,
            roles: {
              select: {
                id: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: {
        nik: 'asc'
      }
    })

    const role = await prisma.roles.findMany({
      where: {
        deletedAt: null,
        role: { not: "GENERAL ADMIN" }
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
    res.json({user, role,branch});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUpdateData = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleIds } = req.body;

    const parsedRoleIds = Array.isArray(roleIds) ? [...new Set(roleIds.map(Number))] : [];
    if (parsedRoleIds.length === 0 || parsedRoleIds.some((roleId) => !Number.isInteger(roleId) || roleId <= 0)) {
      return res.status(400).json({ message: "Select at least one valid role." });
    }

    const user = await prisma.user.findFirst({ where: { nik: id, branchUnitId: req.user.branchUnitId, deletedAt: null }, select: { nik: true } });
    if (!user) return res.status(404).json({ message: "User not found in this branch unit." });
    const allowedRoles = await prisma.roles.findMany({
      where: { id: { in: parsedRoleIds }, deletedAt: null, role: { not: "GENERAL ADMIN" } },
      select: { id: true }
    });
    if (allowedRoles.length !== parsedRoleIds.length) {
      return res.status(403).json({ message: "One or more roles are outside your authority." });
    }

    const protectedRoles = await prisma.roles.findMany({
      where: { role: "GENERAL ADMIN" },
      select: { id: true }
    });
    
    await prisma.user.update({
      where: { nik: id },
      data: {
        userRoles: {
          deleteMany: { roleId: { notIn: protectedRoles.map((role) => role.id) } },
          createMany: {
            data: allowedRoles.map(({ id }) => ({ roleId: id }))
          }
        }
      }
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getUserRoleBranchUnit, getUpdateData };
