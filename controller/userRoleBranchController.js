import prisma from "../lib/prisma.js";

const getUserRoleBranch = async (req, res) => {
  try {
    const user = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchId: req.user.branchId,
      },
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        branch: {
          select: {
            id: true,
            branch: true,
          },
        },
        userRoles: {
          select: {
            id: true,
            roles: {
              select: {
                id: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: {
        nik: "asc",
      },
    });

    const role = await prisma.roles.findMany({
      where: {
        deletedAt: null,
      },
    });

    const branch = await prisma.branch.findMany({
      where: {
        deletedAt: null,
        id: req.user.branchId,
      },
      select: {
        id: true,
        branch: true,
      },
    });

    res.json({ user, role, branch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUpdateData = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleIds } = req.body;

    const parsedRoleIds = [...new Set((roleIds || []).map((roleId) => Number(roleId)))];

    if (
      !Array.isArray(roleIds) ||
      parsedRoleIds.length === 0 ||
      parsedRoleIds.some((roleId) => !Number.isInteger(roleId))
    ) {
      return res.status(400).json({ message: "roleIds is required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        nik: id,
        deletedAt: null,
        branchId: req.user.branchId,
      },
      select: {
        nik: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found in this branch" });
    }

    await prisma.user.update({
      where: { nik: id },
      data: {
        userRoles: {
          deleteMany: {},
          createMany: {
            data: parsedRoleIds.map((roleId) => ({ roleId })),
          },
        },
      },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getUserRoleBranch, getUpdateData };
