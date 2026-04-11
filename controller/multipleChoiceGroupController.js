import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getMultipleChoiceGroups = async (req, res) => {
  // const branchUnitId = 17
    const branchUnitId = req.user.branchUnitId
  try {
    const multipleChoice = await prisma.multipleChoice.findMany({
      where: {
        branchUnitId: branchUnitId,
        deletedAt: null,
      }
    })

    const sector = await prisma.sector.findMany({
      where: {
        branchUnitId: branchUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        sector: true,
        subBranchUnitRatings: {
          select: {
            id: true,
          }
        },
        branchUnit: {
          select: {
            unit: true,
            branch: {
              select: {
                branch: true
              }
            }
          }
        }
      }
    })
    
    const idSubBranchUnitRating = sector.map((item) => {
      return item.subBranchUnitRatings.map((sub) => {
        return sub.id
      })
    }).flat();
    
    const idSector = sector.map((item) => {
      return item.id
    }).flat();

    const questionGroup = await prisma.questionGroup.findMany({
      where: {
        kindOfQuestionId: 2,
        deletedAt: null,
        subBranchUnitRatingId: {
          in: idSubBranchUnitRating
        }
      },
      select: {
        id: true,
        group: true,
        subBranchUnitRating: {
          select: {
            rating: true,
            sector:true
        }
      }
    }
    })
    
    const multipleChoiceQuestionGroup = await prisma.mcQuestionGroup.findMany({
      where: {
        sectorId: {
          in: idSector
        },
        deletedAt: null
      },
      select: {
        multipleChoiceId: true,
        sector: {
          select: {
            id: true,
            sector: true
          }
        },
        questionGroup: {
          select: {
            id: true,
            group: true,
            kindOfQuestion: {
              select: {
                question: true
              }
            },
            subBranchUnitRating: {
              select: {
                rating: {
                  select: {
                    rating: true
                  }
                }
              }
            }
          }
        }
      }
    })

    // Logic to fetch regions (e.g., from a database)
    res.json({ multipleChoice, questionGroup, multipleChoiceQuestionGroup, sector });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addMultipleChoiceGroups = async (req, res) => {
  try {
    const now = new Date();
    const { multipleChoiceId, questionGroupId, sectorId } = req.body;
    const checkMultipleChoice = await prisma.mcQuestionGroup.findMany({
      where: {
        multipleChoiceId: multipleChoiceId,
        deletedAt: null,
      }
    });

    if(checkMultipleChoice){
      await prisma.mcQuestionGroup.updateMany({
        where: {
          id: {
            in: checkMultipleChoice.map((item) => item.id)
          }
        },
        data: {
          deletedAt: now
        }
      });
    }

    for (let i = 0; i < questionGroupId.length; i++) {
      await prisma.mcQuestionGroup.create({
        data: {
          multipleChoiceId: multipleChoiceId,
          questionGroupId: questionGroupId[i],
          sectorId: sectorId[i],
        }
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getMultipleChoiceGroups, addMultipleChoiceGroups };