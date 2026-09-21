import prisma from "../lib/prisma.js";
import config from "../utils/config.js";

const getQuestionGroups = async (req, res) => {
  try {
    const branchUnitId = Number(req.user?.branchUnitId);

    if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(403).json({ message: "Branch unit data is required." });
    }

    const sector = await prisma.sector.findMany({
      where: {
        branchUnitId,
        deletedAt: null   
      },
      select: {
        id: true,
        sector: true,
        branchUnit: {
          select: {
            unit: true,
          branch: {
              select: {
                branch: true
              }
            }
          },
        },
        deletedAt: true,
        subBranchUnitRatings: {
          select: {
            id: true,
            rating: true,
          },
        where:{
          deletedAt: null
        }
        }}
    });
    
    const idSubBranchUnitRating = sector.flatMap(s => s.subBranchUnitRatings.map(r => r.id));
    const questionGroups = await prisma.questionGroup.findMany({
      where: {
        subBranchUnitRatingId: {
          in: idSubBranchUnitRating
        },
        kindOfQuestionId: 2,
        deletedAt: null,
        group: {
          not: null
        }
      },
      include: {
        subBranchUnitRating: {
          select: {
            id: true,
            rating: true,
            sector: {
              select: {
                id: true,
                sector: true
              }
            }
          }
        }
      }
    });

    const latestEvent = await prisma.event.findFirst({
      where: {
        deletedAt: null,
        sector: {
          deletedAt: null,
          branchUnit: {
            id: branchUnitId,
            deletedAt: null
          }
        },
        eventQuestions: {
          some: {
            deletedAt: null,
            kindOfQuestionId: 2
          }
        }
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ],
      select: {
        id: true,
        event: true,
        eventQuestions: {
          where: {
            deletedAt: null,
            kindOfQuestionId: 2
          },
          orderBy: [
            { updatedAt: "desc" },
            { id: "desc" }
          ],
          take: 1,
          select: {
            quantity: true
          }
        }
      }
    });

    const targetQuestions = latestEvent?.eventQuestions?.[0]?.quantity ?? 0;

    const mandatoryRating = await prisma.mandatoryRating.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        rating: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            rating: true
          }
        },
        mandatoryItem: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            mandatory: true,
          }
        }
      }
    })

    res.json({
      sector,
      questionGroups,
      mandatoryRating,
      targetQuestions,
      targetEvent: latestEvent
        ? { id: latestEvent.id, event: latestEvent.event }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addQuestionGroup = async (req, res) => {
  try {
    const { sectorId, ratingId, group} = req.body;
    const branchUnitId = Number(req.user?.branchUnitId);

    if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(403).json({ message: "Branch unit data is required." });
    }

    if (!Array.isArray(group) || group.length === 0) {
      return res.status(400).json({ message: "At least one question group is required." });
    }
    
    const findSubBranchUnitRating = await prisma.subBranchUnitRating.findFirst({
      where: {
        sectorId: Number(sectorId),
        ratingId: Number(ratingId),
        deletedAt: null,
        sector: {
          branchUnitId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
      }
    });

    if (!findSubBranchUnitRating) {
      return res.status(404).json({
        message: "The selected sector and rating are not available in your branch unit.",
      });
    }

    const existingGroup = await prisma.questionGroup.findFirst({
      where: {
        subBranchUnitRatingId: findSubBranchUnitRating.id,
        kindOfQuestionId: 2,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingGroup) {
      return res.status(409).json({
        message: "This rating has already been declared for the selected sector.",
      });
    }
    
    await prisma.questionGroup.createMany({
      data: group.map(g => ({
        subBranchUnitRatingId: findSubBranchUnitRating.id,
        mandatoryRatingId: g.mandatoryRatingId,
        group: g.mandatory,
        quantity: g.quantity,
        kindOfQuestionId: 2
      }))
    })
    
    res.status(201).json({ success: true, message: `Branch Unit Rating added` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getQuestionGroupId = async (req, res) => {
  try {
    const { id } = req.params;
    const { sectorId, ratingId, group, quantity } = req.body;
  
    await prisma.questionGroup.update({
      where: { id: parseInt(id) },
      data: {
        group: group,
        quantity: quantity,
      }
    });
  
    res.json({ success: true, branchUnitId: id, name: `Branch Unit ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteQuestionGroupId = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.questionGroup.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.json({ success: true, branchUnitId: id, name: `Branch Unit ${id}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getQuestionGroups, addQuestionGroup, getQuestionGroupId, deleteQuestionGroupId }
