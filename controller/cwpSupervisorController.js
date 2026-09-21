import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeName = (value = "") => String(value).trim();

const getBranchUnitSectorIds = async (branchUnitId) => {
  const sectors = await prisma.sector.findMany({
    where: {
      branchUnitId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  return sectors.map((sector) => sector.id);
};

const getRelatedCwpIds = async (branchUnitId) => {
  const sectorIds = await getBranchUnitSectorIds(branchUnitId);

  if (sectorIds.length === 0) return [];

  const subBranchUnitRatings = await prisma.subBranchUnitRating.findMany({
    where: {
      sectorId: {
        in: sectorIds,
      },
      deletedAt: null,
      ratingId: {
        not: null,
      },
    },
    select: {
      ratingId: true,
    },
  });

  const ratingIds = [
    ...new Set(
      subBranchUnitRatings
        .map((item) => item.ratingId)
        .filter((ratingId) => Number.isInteger(ratingId)),
    ),
  ];

  if (ratingIds.length === 0) return [];

  const cwps = await prisma.cwp.findMany({
    where: {
      branchUnitId,
      deletedAt: null,
      ratingId: {
        in: ratingIds,
      },
    },
    select: {
      id: true,
    },
  });

  return cwps.map((cwp) => cwp.id);
};

const getCwpSupervisors = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);

    const cwps = relatedCwpIds.length
      ? await prisma.cwp.findMany({
          where: {
            id: {
              in: relatedCwpIds,
            },
            deletedAt: null,
          },
          include: {
            rating: true,
            sectorCwps: {
              where: {
                deletedAt: null,
              },
              include: {
                sector: true,
              },
            },
          },
          orderBy: {
            cwp: "asc",
          },
        })
      : [];
    const activeCwpSupervisorRelations = relatedCwpIds.length
      ? await prisma.cwpSupervisor.findMany({
          where: {
            deletedAt: null,
            cwpId: {
              in: relatedCwpIds,
            },
            supervisor: {
              is: {
                branchUnitId,
                deletedAt: null,
              },
            },
          },
          select: {
            cwpId: true,
            supervisorId: true,
          },
        })
      : [];
    const cwpSupervisorMap = new Map(
      activeCwpSupervisorRelations.map((relation) => [
        relation.cwpId,
        relation.supervisorId,
      ]),
    );
    const cwpsWithSupervisor = cwps.map((cwp) => ({
      ...cwp,
      supervisorId: cwpSupervisorMap.get(cwp.id) || null,
    }));

    const supervisors = relatedCwpIds.length
      ? await prisma.supervisor.findMany({
          where: {
            branchUnitId,
            deletedAt: null,
            cwpSupervisors: {
              some: {
                deletedAt: null,
                cwpId: {
                  in: relatedCwpIds,
                },
              },
            },
          },
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
                cwpId: {
                  in: relatedCwpIds,
                },
                cwp: {
                  is: {
                    deletedAt: null,
                  },
                },
              },
              include: {
                cwp: {
                  include: {
                    rating: true,
                    sectorCwps: {
                      where: {
                        deletedAt: null,
                      },
                      include: {
                        sector: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                id: "asc",
              },
            },
          },
          orderBy: {
            supervisor: "asc",
          },
        })
      : [];

    res.json({ supervisors, cwps: cwpsWithSupervisor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const validateCwpIds = (cwpIds, relatedCwpIds) => {
  const selectedCwpIds = [
    ...new Set(
      (Array.isArray(cwpIds) ? cwpIds : [])
        .map((cwpId) => parsePositiveInt(cwpId))
        .filter((cwpId) => Number.isInteger(cwpId)),
    ),
  ];

  if (selectedCwpIds.length === 0) {
    return {
      valid: false,
      message: "Please select at least one CWP.",
      cwpIds: [],
    };
  }

  const relatedSet = new Set(relatedCwpIds);
  const invalidCwp = selectedCwpIds.find((cwpId) => !relatedSet.has(cwpId));

  if (invalidCwp) {
    return {
      valid: false,
      message: "Selected CWP is not related to your branch unit.",
      cwpIds: [],
    };
  }

  return {
    valid: true,
    message: "",
    cwpIds: selectedCwpIds,
  };
};

const getAssignedCwpIds = async (cwpIds, branchUnitId, supervisorId = null) => {
  if (!cwpIds.length) return [];

  const assignedRelations = await prisma.cwpSupervisor.findMany({
    where: {
      deletedAt: null,
      cwpId: {
        in: cwpIds,
      },
      supervisor: {
        is: {
          branchUnitId,
          deletedAt: null,
        },
      },
      ...(supervisorId
        ? {
            supervisorId: {
              not: supervisorId,
            },
          }
        : {}),
    },
    select: {
      cwpId: true,
    },
  });

  return [
    ...new Set(
      assignedRelations
        .map((relation) => relation.cwpId)
        .filter((cwpId) => Number.isInteger(cwpId)),
    ),
  ];
};

const addCwpSupervisor = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = normalizeName(req.body.supervisor);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!supervisor) {
      return res.status(400).json({ message: "Supervisor name is required." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);
    const validation = validateCwpIds(req.body.cwpIds, relatedCwpIds);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const assignedCwpIds = await getAssignedCwpIds(
      validation.cwpIds,
      branchUnitId,
    );

    if (assignedCwpIds.length) {
      return res.status(409).json({
        message: "One or more selected CWP already has supervisor.",
      });
    }

    const createdSupervisor = await prisma.supervisor.create({
      data: {
        supervisor,
        branchUnitId,
        cwpSupervisors: {
          create: validation.cwpIds.map((cwpId) => ({
            cwpId,
          })),
        },
      },
      include: {
        cwpSupervisors: {
          include: {
            cwp: {
              include: {
                rating: true,
                sectorCwps: {
                  where: {
                    deletedAt: null,
                  },
                  include: {
                    sector: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      supervisor: createdSupervisor,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateCwpSupervisor = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parsePositiveInt(req.params.id);
    const supervisor = normalizeName(req.body.supervisor);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invalid supervisor ID." });
    }

    if (!supervisor) {
      return res.status(400).json({ message: "Supervisor name is required." });
    }

    const currentSupervisor = await prisma.supervisor.findFirst({
      where: {
        id,
        branchUnitId,
        deletedAt: null,
      },
    });

    if (!currentSupervisor) {
      return res.status(404).json({ message: "Supervisor not found." });
    }

    const relatedCwpIds = await getRelatedCwpIds(branchUnitId);
    const validation = validateCwpIds(req.body.cwpIds, relatedCwpIds);

    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const assignedCwpIds = await getAssignedCwpIds(
      validation.cwpIds,
      branchUnitId,
      id,
    );

    if (assignedCwpIds.length) {
      return res.status(409).json({
        message: "One or more selected CWP already has supervisor.",
      });
    }

    const now = new Date();
    const selectedSet = new Set(validation.cwpIds);

    await prisma.$transaction(async (tx) => {
      await tx.supervisor.update({
        where: {
          id,
        },
        data: {
          supervisor,
        },
      });

      await tx.cwpSupervisor.updateMany({
        where: {
          supervisorId: id,
          deletedAt: null,
          cwpId: {
            notIn: validation.cwpIds,
          },
        },
        data: {
          deletedAt: now,
        },
      });

      const existingRelations = await tx.cwpSupervisor.findMany({
        where: {
          supervisorId: id,
          cwpId: {
            in: validation.cwpIds,
          },
        },
      });

      const relationByCwp = new Map(
        existingRelations.map((relation) => [relation.cwpId, relation]),
      );

      for (const cwpId of selectedSet) {
        const existingRelation = relationByCwp.get(cwpId);

        if (existingRelation) {
          await tx.cwpSupervisor.update({
            where: {
              id: existingRelation.id,
            },
            data: {
              deletedAt: null,
            },
          });
        } else {
          await tx.cwpSupervisor.create({
            data: {
              supervisorId: id,
              cwpId,
            },
          });
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCwpSupervisor = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parsePositiveInt(req.params.id);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!id) {
      return res.status(400).json({ message: "Invalid supervisor ID." });
    }

    const supervisor = await prisma.supervisor.findFirst({
      where: {
        id,
        branchUnitId,
        deletedAt: null,
      },
    });

    if (!supervisor) {
      return res.status(404).json({ message: "Supervisor not found." });
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.supervisor.update({
        where: {
          id,
        },
        data: {
          deletedAt: now,
        },
      }),
      prisma.cwpSupervisor.updateMany({
        where: {
          supervisorId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getCwpSupervisors,
  addCwpSupervisor,
  updateCwpSupervisor,
  deleteCwpSupervisor,
};
