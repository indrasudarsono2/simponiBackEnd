import prisma from "../lib/prisma.js";
import config from "../utils/config.json";

const buildGroupedEssay = (questionGroup, essayQuestionGroup) => {
  // Count selected questions per sector + questionGroup.
  const selectedCount = new Map();
  for (const item of essayQuestionGroup) {
    const sectorId = item?.sector?.id;
    const questionGroupId = item?.questionGroup?.id;

    if (sectorId == null || questionGroupId == null) continue;

    const key = `${sectorId}|${questionGroupId}`;
    selectedCount.set(key, (selectedCount.get(key) || 0) + 1);
  }

  // Group by sector + rating.
  const groupedMap = new Map();
  for (const qg of questionGroup) {
    const sectorId = qg?.subBranchUnitRating?.sector?.id;
    const sectorName = qg?.subBranchUnitRating?.sector?.sector;
    const rating = qg?.subBranchUnitRating?.rating?.rating;

    if (sectorId == null || !sectorName || !rating) continue;

    const mapKey = `${sectorId}|${rating}`;
    if (!groupedMap.has(mapKey)) {
      groupedMap.set(mapKey, {
        sector: sectorName,
        rating,
        questionGroup: [],
      });
    }

    const selected = selectedCount.get(`${sectorId}|${qg.id}`) || 0;
    groupedMap.get(mapKey).questionGroup.push({
      group: qg.group,
      quantity: qg.quantity,
      selected,
    });
  }

  return [...groupedMap.values()]
    .map((item) => ({
      ...item,
      questionGroup: item.questionGroup.sort((a, b) =>
        String(a.group ?? "").localeCompare(String(b.group ?? ""))
      ),
    }))
    .sort((a, b) => {
      const sectorCompare = String(a.sector ?? "").localeCompare(
        String(b.sector ?? "")
      );
      if (sectorCompare !== 0) return sectorCompare;
      return String(a.rating ?? "").localeCompare(String(b.rating ?? ""));
    });
};

const getEssayGroups = async (req, res) => {
  try {
    // const branchUnitId = 17
    // const branchUnitId = 5
    const branchUnitId = req.user.branchUnitId
    const essay = await prisma.essay.findMany({
      where: {
        branchUnitId: branchUnitId,
        deletedAt: null,
        isActive: true,
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
            rating: {
              where: {
                deletedAt: null
              },
              select: {
                rating: true,
              }
            }
          }
        },
        essayQuestionGroups: {
          where: {
            deletedAt: null
          },
          select: {
            id: true
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
        },
        group:{
          not: null
        }
      },
      select: {
        id: true,
        group: true,
        quantity: true,
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
        deletedAt: null,
        essay: {
          deletedAt: null,
          isActive: true,
        },
      },
      select: {
        id: true,
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

    const grouped = buildGroupedEssay(questionGroup, essayQuestionGroup);
    // Logic to fetch regions (e.g., from a database)
    res.json({ essay, questionGroup, essayQuestionGroup, sector, grouped });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addEssayGroups = async (req, res) => {
  try {
    const now = new Date();
    const { essayId, questionGroupId, sectorId } = req.body;
    const essay = await prisma.essay.findFirst({
      where: {
        id: essayId,
        branchUnitId: req.user.branchUnitId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!essay) {
      return res.status(400).json({ message: "Only active essays can be assigned to groups." });
    }

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
