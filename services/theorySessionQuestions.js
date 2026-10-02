import prisma from "../lib/prisma.js";
import {
  getRandomEssayByGroup,
  getRandomMultipleChoiceByGroup,
  getRandomMatsQuestions,
} from "../controller/examintaionController.js";

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

export const createTheoryQuestionSnapshot = async ({ event, appRating }) => {
  const sectorId = event.sectorId;
  const ratingId = appRating.ratingId;
  const subRating = await prisma.subBranchUnitRating.findFirst({
    where: { ratingId, sectorId, deletedAt: null },
    select: {
      questionGroups: {
        where: { deletedAt: null, kindOfQuestionId: { in: [1, 2] } },
        select: { id: true, group: true, quantity: true, kindOfQuestionId: true, mandatoryRating: { select: { mandatoryItemId: true } } },
      },
    },
  });
  if (!subRating) throw new Error("This rating has no question configuration in the event sector.");

  const eventQuestions = await prisma.eventQuestion.findMany({
    where: { eventId: event.id, deletedAt: null, kindOfQuestionId: { in: [1, 2] } },
    select: { kindOfQuestionId: true, persentage: true },
  });
  const essayWeight = Number(eventQuestions.find((item) => item.kindOfQuestionId === 1)?.persentage || 0);
  const multipleChoiceWeight = Number(eventQuestions.find((item) => item.kindOfQuestionId === 2)?.persentage || 0);
  if (essayWeight + multipleChoiceWeight <= 0) throw new Error("Theory event questions have not been configured.");

  const essayGroups = [];
  if (essayWeight > 0) {
    for (const group of subRating.questionGroups.filter((item) => item.kindOfQuestionId === 1)) {
      const rows = await getRandomEssayByGroup({ sectorId, questionGroupId: group.id, quantity: group.quantity });
      if (rows.length < Number(group.quantity || 0)) throw new Error(`Essay group ${group.group || group.id} has insufficient active questions.`);
      essayGroups.push({ group: group.group, questions: rows.map(({ essay }) => ({ id: essay.id, question: essay.question, image: essay.image })) });
    }
    if (!essayGroups.length) throw new Error("No Essay groups are configured for this rating.");
  }

  const multipleChoiceGroups = [];
  let matsMode = null;
  if (multipleChoiceWeight > 0) {
    const groups = subRating.questionGroups.filter((item) => item.kindOfQuestionId === 2);
    const configuration = await prisma.matsConfiguration.findUnique({ where: { id: 1 } });
    matsMode = configuration?.mode === "CATEGORY_PORTION" ? "CATEGORY_PORTION" : "SEPARATE_POOL";
    const allocations = matsMode === "CATEGORY_PORTION"
      ? await prisma.matsCategoryAllocation.findMany({ where: { deletedAt: null }, select: { mandatoryItemId: true, quantity: true } })
      : [];
    const allocationByItem = new Map(allocations.map((item) => [item.mandatoryItemId, Number(item.quantity || 0)]));
    for (const group of groups) {
      const mandatoryItemId = group.mandatoryRating?.mandatoryItemId || null;
      const matsPortion = matsMode === "CATEGORY_PORTION" ? Number(allocationByItem.get(mandatoryItemId) || 0) : 0;
      const quantity = Number(group.quantity || 0);
      const rows = await getRandomMultipleChoiceByGroup({ sectorId, questionGroupId: group.id, quantity: Math.max(0, quantity - matsPortion) });
      multipleChoiceGroups.push({ group: group.group, quantity, mandatoryItemId, questions: rows.map(({ multipleChoice }) => multipleChoice) });
    }
    const mandatoryItemIds = (await prisma.mandatoryRating.findMany({
      where: { ratingId, mandatoryItemId: { not: null }, deletedAt: null },
      select: { mandatoryItemId: true },
    })).map((item) => item.mandatoryItemId);
    const mats = await getRandomMatsQuestions({
      appRatingId: appRating.id,
      eventId: event.id,
      mandatoryItemIds,
      questionGroups: groups.map((item) => ({ mandatoryItemId: item.mandatoryRating?.mandatoryItemId || null, quantity: Number(item.quantity || 0) })),
    });
    if (mats.mode === "CATEGORY_PORTION") {
      for (const group of multipleChoiceGroups) {
        group.questions.push(...mats.questions.filter((item) => item.mandatoryItemId === group.mandatoryItemId).map((item) => item.multipleChoice));
      }
    } else if (mats.quantity > 0) {
      multipleChoiceGroups.push({ group: "MATS", quantity: mats.quantity, mandatoryItemId: null, questions: mats.questions.map((item) => item.multipleChoice) });
    }
    for (const group of multipleChoiceGroups) {
      if (group.questions.length < group.quantity) throw new Error(`Multiple Choice group ${group.group || "MATS"} has insufficient active questions.`);
    }
    if (!multipleChoiceGroups.length) throw new Error("No Multiple Choice groups are configured for this rating.");
  }

  return {
    essayWeight,
    multipleChoiceWeight,
    matsMode,
    essay: essayGroups.map((group) => ({ ...group, questions: shuffle(group.questions) })),
    multipleChoice: multipleChoiceGroups.map((group) => ({
      group: group.group,
      questions: shuffle(group.questions).map((question) => ({
        id: question.id,
        question: question.question,
        image: question.image,
        a: question.a,
        b: question.b,
        c: question.c,
        d: question.d,
        optionOrder: shuffle(["A", "B", "C", "D"]),
        mandatoryItemId: question.mandatoryItemId || group.mandatoryItemId,
      })),
    })),
  };
};
