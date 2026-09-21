import prisma from "../lib/prisma.js";

const APPLICATION_NUMBER = "ATC/PERPANJANGAN/8883-14";
const THEORY_SCORE = 88;

const main = async () => {
  const waitingPractical = await prisma.status.findFirst({
    where: { status: "WAITING PRACTICAL", deletedAt: null },
    select: { id: true, status: true },
  });

  if (!waitingPractical) {
    throw new Error("WAITING PRACTICAL status is not configured.");
  }

  const application = await prisma.applicationDoc.findFirst({
    where: { number: APPLICATION_NUMBER, deletedAt: null },
    select: {
      id: true,
      number: true,
      appRatings: {
        where: { deletedAt: null },
        orderBy: { id: "desc" },
        take: 1,
        select: {
          id: true,
          statusId: true,
          finalScores: {
            where: { deletedAt: null, isInvalidated: false },
            orderBy: { id: "desc" },
            take: 1,
            select: {
              id: true,
              essayScore: true,
              multipleChoiceScore: true,
              finalScore: true,
              statusId: true,
            },
          },
          practicalTests: {
            where: { deletedAt: null },
            select: { id: true, score: true },
          },
        },
      },
    },
  });

  const appRating = application?.appRatings[0];
  const finalScore = appRating?.finalScores[0];

  if (!application || !appRating || !finalScore) {
    throw new Error(`Active theory result for ${APPLICATION_NUMBER} was not found.`);
  }
  if (appRating.practicalTests.length === 0) {
    throw new Error(`Practical test for ${APPLICATION_NUMBER} was not found.`);
  }
  if (appRating.practicalTests.some((test) => test.score != null)) {
    throw new Error(`Practical score for ${APPLICATION_NUMBER} has already been entered.`);
  }

  const essayScore = Number(finalScore.essayScore ?? 0);
  const multipleChoiceScore = THEORY_SCORE - essayScore;
  if (multipleChoiceScore < 0) {
    throw new Error("Existing essay score is greater than the requested theory score.");
  }

  await prisma.$transaction([
    prisma.finalScore.update({
      where: { id: finalScore.id },
      data: {
        multipleChoiceScore,
        finalScore: THEORY_SCORE,
        statusId: waitingPractical.id,
      },
    }),
    prisma.appRating.update({
      where: { id: appRating.id },
      data: { statusId: waitingPractical.id },
    }),
  ]);

  const result = await prisma.applicationDoc.findUnique({
    where: { id: application.id },
    select: {
      number: true,
      appRatings: {
        where: { id: appRating.id },
        select: {
          id: true,
          status: { select: { status: true } },
          finalScores: {
            where: { id: finalScore.id },
            select: {
              id: true,
              essayScore: true,
              multipleChoiceScore: true,
              finalScore: true,
              status: { select: { status: true } },
            },
          },
          practicalTests: {
            where: { deletedAt: null },
            select: { id: true, score: true },
          },
        },
      },
    },
  });

  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
