import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getQuestionGroups = async (req, res) => {
  try {
    // const branchId = 6
    const branchId = req.user.branchId
    const sector = await prisma.sector.findMany({
      where: {
        branchUnit: {
          branchId: branchId,
          deletedAt: null
        },
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
          }
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
        kindOfQuestionId: 1,
        deletedAt: null
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
    res.json({sector,questionGroups});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addQuestionGroup = async (req, res) => {
  try {
    const { sectorId, ratingId, group, quantity } = req.body;
   
    const findSubBranchUnitRating = await prisma.subBranchUnitRating.findFirst({
      where: {
        sectorId: sectorId,
        ratingId: ratingId,
        deletedAt: null
      },
      select: {
        id: true,
      }
    });
  
    await prisma.questionGroup.create({
      data: {
        subBranchUnitRatingId: findSubBranchUnitRating.id,
        group: group,
        quantity: quantity,
        kindOfQuestionId: 1
      }
    });
    
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
