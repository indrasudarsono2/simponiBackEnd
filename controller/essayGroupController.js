import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const getEssayGroups = async (req, res) => {
  try {
    // const branchUnitId = 17
    const branchUnitId = req.user.branchUnitId
    const essay = await prisma.essay.findMany({
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
        kindOfQuestionId: 1,
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
    
    const essayQuestionGroup = await prisma.essayQuestionGroup.findMany({
      where: {
        sectorId: {
          in: idSector
        },
        deletedAt: null
      },
      select: {
        essayId: true,
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
    res.json({ essay, questionGroup, essayQuestionGroup, sector });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addEssayGroups = async (req, res) => {
  try {
    const now = new Date();
    const { essayId, questionGroupId, sectorId } = req.body;
    const checkEssay = await prisma.essayQuestionGroup.findMany({
      where: {
        essayId: essayId,
        deletedAt: null,
      }
    });

    if(checkEssay){
      await prisma.essayQuestionGroup.updateMany({
        where: {
          id: {
            in: checkEssay.map((item) => item.id)
          }
        },
        data: {
          deletedAt: now
        }
      });
    }

    for (let i = 0; i < questionGroupId.length; i++) {
      await prisma.essayQuestionGroup.create({
        data: {
          essayId: essayId,
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

export { getEssayGroups, addEssayGroups };