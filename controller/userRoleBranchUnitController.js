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
        deletedAt: null
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
    
    await prisma.user.update({
      where: { nik: id },
      data: {
        userRoles: {
          deleteMany: {},
          createMany: {
            data: roleIds.map(id => ({roleId : id}))
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
