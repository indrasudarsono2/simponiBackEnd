import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeActors = (value) => {
  const actors = Array.isArray(value) ? value : [];

  return actors
    .map((item) => ({
      actor: String(item.actor || "").trim(),
      remark: item.remark ? String(item.remark).trim() : null,
    }))
    .filter((item) => item.actor);
};

const escalationLevelInclude = {
  escalationActors: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      escalationActor: {
        select: {
          nik: true,
          name: true,
          licenseUserId: true,
        },
      },
    },
  },
};

const getEscalationActors = async (req, res) => {
  try {
    const branchId = req.user?.branchId;

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    const escalationLevels = await prisma.escalationLevel.findMany({
      where: {
        branchId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: escalationLevelInclude,
    });

    res.json(
      escalationLevels.sort(
        (current, next) => Number(current.level) - Number(next.level),
      ),
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getEscalationActorUsers = async (req, res) => {
  try {
    const branchId = req.user?.branchId;

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    const users = await prisma.user.findMany({
      where: {
        branchId,
        deletedAt: null,
      },
      select: {
        nik: true,
        name: true,
        licenseUserId: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateEscalationActorsByLevel = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const escalationLevelId = parsePositiveInt(req.params.levelId);
    const actors = normalizeActors(req.body.actors);
    const actorNikList = actors.map((item) => item.actor);

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    if (!escalationLevelId) {
      return res.status(400).json({ message: "Invalid escalation level ID." });
    }

    if (new Set(actorNikList).size !== actorNikList.length) {
      return res.status(400).json({
        message: "Each actor can only be selected once for one level.",
      });
    }

    const escalationLevel = await prisma.escalationLevel.findFirst({
      where: {
        id: escalationLevelId,
        branchId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!escalationLevel) {
      return res.status(404).json({ message: "Escalation level not found." });
    }

    if (actorNikList.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: {
          nik: {
            in: actorNikList,
          },
          branchId,
          deletedAt: null,
        },
        select: {
          nik: true,
        },
      });

      if (validUsers.length !== actorNikList.length) {
        return res.status(400).json({
          message: "One or more selected actors are invalid for this branch.",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.escalationActor.updateMany({
        where: {
          branchId,
          escalationLevelId,
          deletedAt: null,
          actor: {
            notIn: actorNikList,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });

      for (const item of actors) {
        const existingActor = await tx.escalationActor.findFirst({
          where: {
            branchId,
            escalationLevelId,
            actor: item.actor,
          },
        });

        if (existingActor) {
          await tx.escalationActor.update({
            where: {
              id: existingActor.id,
            },
            data: {
              remark: item.remark,
              deletedAt: null,
            },
          });
          continue;
        }

        await tx.escalationActor.create({
          data: {
            branchId,
            escalationLevelId,
            actor: item.actor,
            remark: item.remark,
          },
        });
      }
    });

    const updatedEscalationLevel = await prisma.escalationLevel.findFirst({
      where: {
        id: escalationLevelId,
        branchId,
        deletedAt: null,
      },
      include: escalationLevelInclude,
    });

    res.json({
      success: true,
      escalationLevel: updatedEscalationLevel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getEscalationActors,
  getEscalationActorUsers,
  updateEscalationActorsByLevel,
};
