import prisma from "../lib/prisma.js";
import config from "../utils/config.js";

const MAX_GROUPS_PER_QUESTION = 5;

const buildGroupedMultipleChoice = (questionGroup, multipleChoiceQuestionGroup) => {
  // Count selected questions per sector + questionGroup.
  const selectedCount = new Map();
  for (const item of multipleChoiceQuestionGroup) {
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
        a.group.localeCompare(b.group)
      ),
    }))
    .sort((a, b) => {
      if (a.sector !== b.sector) return a.sector.localeCompare(b.sector);
      return a.rating.localeCompare(b.rating);
    });
};

const getMultipleChoiceGroups = async (req, res) => {
  // const branchUnitId = 17
  // const branchUnitId = 5
  const branchUnitId = req.user.branchUnitId
  try {
    const multipleChoice = await prisma.multipleChoice.findMany({
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
        mcQuestionGroups: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true
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
        },
        group: {
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
    
    const multipleChoiceQuestionGroup = await prisma.mcQuestionGroup.findMany({
      where: {
        sectorId: {
          in: idSector
        },
        deletedAt: null,
        multipleChoice: {
          deletedAt: null,
          isActive: true,
        },
      },
      select: {
        id:true,
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
    
    const grouped = buildGroupedMultipleChoice(
      questionGroup,
      multipleChoiceQuestionGroup
    );

    
    res.json({ multipleChoice, questionGroup, multipleChoiceQuestionGroup, sector, grouped});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addMultipleChoiceGroups = async (req, res) => {
  try {
    const now = new Date();
    const { multipleChoiceId, questionGroupId, sectorId } = req.body;
    const parsedMultipleChoiceId = Number(multipleChoiceId);
    const parsedQuestionGroupIds = Array.isArray(questionGroupId)
      ? questionGroupId.map(Number)
      : [];
    const parsedSectorIds = Array.isArray(sectorId) ? sectorId.map(Number) : [];

    if (
      !Number.isInteger(parsedMultipleChoiceId) ||
      parsedMultipleChoiceId <= 0 ||
      parsedQuestionGroupIds.length === 0 ||
      parsedQuestionGroupIds.length > MAX_GROUPS_PER_QUESTION ||
      parsedQuestionGroupIds.length !== parsedSectorIds.length ||
      parsedQuestionGroupIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      parsedSectorIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(parsedQuestionGroupIds).size !== parsedQuestionGroupIds.length
    ) {
      return res.status(400).json({
        message: "Select one to five distinct question groups.",
      });
    }

    const multipleChoice = await prisma.multipleChoice.findFirst({
      where: {
        id: parsedMultipleChoiceId,
        branchUnitId: req.user.branchUnitId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!multipleChoice) {
      return res.status(400).json({ message: "Only active multiple choice questions can be assigned to groups." });
    }

    const validGroups = await prisma.questionGroup.findMany({
      where: {
        id: { in: parsedQuestionGroupIds },
        kindOfQuestionId: 2,
        deletedAt: null,
        subBranchUnitRating: {
          sector: {
            branchUnitId: req.user.branchUnitId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        subBranchUnitRating: { select: { sectorId: true } },
      },
    });

    const validGroupMap = new Map(validGroups.map((group) => [
      group.id,
      group.subBranchUnitRating?.sectorId,
    ]));
    const selectionsAreValid = parsedQuestionGroupIds.every(
      (id, index) => validGroupMap.get(id) === parsedSectorIds[index],
    );

    if (!selectionsAreValid || validGroups.length !== parsedQuestionGroupIds.length) {
      return res.status(403).json({
        message: "A selected group is outside your branch unit or does not match its sector.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.mcQuestionGroup.updateMany({
        where: {
          multipleChoiceId: parsedMultipleChoiceId,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });

      await tx.mcQuestionGroup.createMany({
        data: parsedQuestionGroupIds.map((groupId, index) => ({
          multipleChoiceId: parsedMultipleChoiceId,
          questionGroupId: groupId,
          sectorId: parsedSectorIds[index],
        })),
      });
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getMultipleChoiceGroups, addMultipleChoiceGroups };
