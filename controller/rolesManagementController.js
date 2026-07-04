import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getRolesManagement = async (_req, res) => {
  try {
    const roles = await prisma.roles.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        role: true,
        rolesMenu: {
          where: {
            deletedAt: null,
            menu: {
              deletedAt: null,
            },
          },
          select: {
            id: true,
            roleId: true,
            menuId: true,
            menu: {
              select: {
                id: true,
                menu: true,
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
      orderBy: {
        role: "asc",
      },
    });

    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMenuOptions = async (_req, res) => {
  try {
    const menus = await prisma.menu.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        menu: true,
      },
      orderBy: {
        menu: "asc",
      },
    });

    res.json(menus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateRoleMenus = async (req, res) => {
  try {
    const roleId = parsePositiveInt(req.params.roleId);
    const menuIds = Array.isArray(req.body.menuIds)
      ? [
          ...new Set(
            req.body.menuIds
              .map((menuId) => parsePositiveInt(menuId))
              .filter(Boolean),
          ),
        ]
      : [];

    if (!roleId) {
      return res.status(400).json({ message: "Invalid role ID." });
    }

    const role = await prisma.roles.findFirst({
      where: {
        id: roleId,
        deletedAt: null,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!role) {
      return res.status(404).json({ message: "Role not found." });
    }

    if (menuIds.length === 0) {
      return res.status(400).json({ message: "Please select at least one menu." });
    }

    const menuCount = await prisma.menu.count({
      where: {
        id: {
          in: menuIds,
        },
        deletedAt: null,
      },
    });

    if (menuCount !== menuIds.length) {
      return res.status(400).json({
        message: "One or more selected menus are invalid.",
      });
    }

    const currentRoleMenus = await prisma.rolesMenu.findMany({
      where: {
        roleId,
      },
      select: {
        id: true,
        menuId: true,
        deletedAt: true,
      },
    });

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const roleMenu of currentRoleMenus) {
        if (!roleMenu.menuId) continue;

        const shouldBeActive = menuIds.includes(roleMenu.menuId);
        if (!shouldBeActive && !roleMenu.deletedAt) {
          await tx.rolesMenu.update({
            where: {
              id: roleMenu.id,
            },
            data: {
              deletedAt: now,
            },
          });
        }
      }

      for (const menuId of menuIds) {
        const existingRoleMenus = currentRoleMenus.filter(
          (roleMenu) => roleMenu.menuId === menuId,
        );
        const reusableRoleMenu =
          existingRoleMenus.find((roleMenu) => roleMenu.deletedAt) ||
          existingRoleMenus[0];

        if (reusableRoleMenu) {
          await tx.rolesMenu.update({
            where: {
              id: reusableRoleMenu.id,
            },
            data: {
              deletedAt: null,
            },
          });

          const duplicateRoleMenus = existingRoleMenus.filter(
            (roleMenu) => roleMenu.id !== reusableRoleMenu.id && !roleMenu.deletedAt,
          );

          for (const duplicateRoleMenu of duplicateRoleMenus) {
            await tx.rolesMenu.update({
              where: {
                id: duplicateRoleMenu.id,
              },
              data: {
                deletedAt: now,
              },
            });
          }

          continue;
        }

        await tx.rolesMenu.create({
          data: {
            roleId,
            menuId,
          },
        });
      }
    });

    res.json({
      success: true,
      message: `Menus for role ${role.role || role.id} have been updated.`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getRolesManagement, getMenuOptions, updateRoleMenus };
