import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseNonNegativeInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const isValidEscalationTime = (value) => value === 0 || (value >= 15 && value % 15 === 0);

const getEscalationLevels = async (req, res) => {
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
      include: {
        _count: {
          select: {
            escalationActors: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
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

const addEscalationLevel = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const level = parsePositiveInt(req.body.level);
    const time = parseNonNegativeInt(req.body.time);

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    if (!level || time === null || !isValidEscalationTime(time)) {
      return res.status(400).json({
        message: "Level must be positive and time must be 0 or a multiple of 15 minutes.",
      });
    }

    const existingLevel = await prisma.escalationLevel.findFirst({
      where: {
        branchId,
        level: parseInt(level),
        deletedAt: null,
      },
    });

    if (existingLevel) {
      return res.status(409).json({
        message: `Escalation level ${level} already exists.`,
      });
    }

    const escalationLevel = await prisma.escalationLevel.create({
      data: {
        branchId,
        level: parseInt(level),
        time,
      },
    });

    res.status(201).json({
      success: true,
      escalationLevel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateEscalationLevel = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const id = parseInt(req.params.id, 10);
    const level = parsePositiveInt(req.body.level);
    const time = parseNonNegativeInt(req.body.time);

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid escalation level ID." });
    }

    if (!level || time === null || !isValidEscalationTime(time)) {
      return res.status(400).json({
        message: "Level must be positive and time must be 0 or a multiple of 15 minutes.",
      });
    }

    const escalationLevel = await prisma.escalationLevel.findFirst({
      where: {
        id,
        branchId,
        deletedAt: null,
      },
    });

    if (!escalationLevel) {
      return res.status(404).json({ message: "Escalation level not found." });
    }

    const duplicateLevel = await prisma.escalationLevel.findFirst({
      where: {
        id: {
          not: id,
        },
        branchId,
        level: parseInt(level),
        deletedAt: null,
      },
    });

    if (duplicateLevel) {
      return res.status(409).json({
        message: `Escalation level ${level} already exists.`,
      });
    }

    const updatedEscalationLevel = await prisma.escalationLevel.update({
      where: {
        id,
      },
      data: {
        level: parseInt(level),
        time,
      },
    });

    res.json({
      success: true,
      escalationLevel: updatedEscalationLevel,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteEscalationLevel = async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    const id = parseInt(req.params.id, 10);

    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid escalation level ID." });
    }

    const escalationLevel = await prisma.escalationLevel.findFirst({
      where: {
        id,
        branchId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            escalationActors: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!escalationLevel) {
      return res.status(404).json({ message: "Escalation level not found." });
    }

    if (escalationLevel._count.escalationActors > 0) {
      return res.status(409).json({
        message:
          "This escalation level still has active actors. Delete or move those actors first.",
      });
    }

    await prisma.escalationLevel.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getEscalationLevels,
  addEscalationLevel,
  updateEscalationLevel,
  deleteEscalationLevel,
};
