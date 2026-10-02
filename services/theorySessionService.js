import prisma from "../lib/prisma.js";
import { ensureFinalScoreCwpSnapshot } from "./finalScoreCwpSnapshot.js";

export const theoryRemainingMs = (session, now = new Date()) => {
  if (session.status === "ENDED" || session.status === "ENDING") return 0;
  const saved = Math.max(0, Number(session.remainingSeconds || 0) * 1000);
  if (session.status !== "RUNNING" || !session.resumedAt) return saved;
  return Math.max(0, saved - Math.max(0, now.getTime() - new Date(session.resumedAt).getTime()));
};

export const theoryClockPayload = (session, now = new Date()) => ({
  id: session.id,
  eventId: session.eventId,
  name: session.name,
  status: session.status,
  serverNow: now.toISOString(),
  remainingMs: theoryRemainingMs(session, now),
  durationSeconds: session.durationSeconds,
  startedAt: session.startedAt,
  endedAt: session.endedAt,
});

const flattenQuestions = (groups = []) => groups.flatMap((group) => group.questions || []);
const answerMap = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const finalizeTheoryParticipant = async (participantId) => {
  const finalScoreId = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.theorySessionParticipant.updateMany({
      where: { id: participantId, finalizedAt: null },
      data: { finalizedAt: now },
    });
    if (claimed.count !== 1) return null;
    const participant = await tx.theorySessionParticipant.findUnique({
      where: { id: participantId },
      include: {
        session: true,
        eventUser: { include: { event: true } },
      },
    });
    if (!participant?.appRatingId || !participant.questionSnapshot) return null;
    const event = participant.eventUser.event;
    const snapshot = participant.questionSnapshot;
    const essayQuestions = flattenQuestions(snapshot.essay);
    const mcQuestions = flattenQuestions(snapshot.multipleChoice);
    const essayAnswers = answerMap(participant.essayAnswers);
    const mcAnswers = answerMap(participant.multipleChoiceAnswers);
    const groupMember = await tx.groupMember.findFirst({
      where: { member: participant.eventUser.userNik, deletedAt: null, group: { eventId: event.id, deletedAt: null } },
      select: { id: true },
    });
    if (!groupMember) throw new Error(`No checker group member for participant ${participant.id}.`);

    const keys = await tx.multipleChoice.findMany({
      where: { id: { in: mcQuestions.map((item) => item.id) } },
      select: { id: true, key: true },
    });
    const keyById = new Map(keys.map((item) => [item.id, String(item.key || "").trim().toUpperCase()]));
    const isCorrect = (item) => {
      const answer = String(mcAnswers[item.id] || "").trim().toUpperCase();
      return Boolean(answer && keyById.get(item.id) && answer === keyById.get(item.id));
    };
    const correctCount = mcQuestions.filter(isCorrect).length;
    const multipleChoiceScore = mcQuestions.length
      ? correctCount / mcQuestions.length * 100 * Number(snapshot.multipleChoiceWeight || 0)
      : 0;
    const priorAttempts = await tx.finalScore.count({ where: { appRatingId: participant.appRatingId, eventId: event.id, deletedAt: null, isInvalidated: false } });
    const passed = multipleChoiceScore >= Number(event.passingGrade || 0);
    const requiresPractical = event.isPractical || event.isSimulator;
    const statusName = essayQuestions.length
      ? "CHECKING ESSAY"
      : passed ? (requiresPractical ? "WAITING PRACTICAL" : "SUCCESS") : event.difficulty === "EASY" || priorAttempts === 0 ? "RECHECK" : "FAILED";
    const status = await tx.status.findFirst({ where: { status: statusName, deletedAt: null }, select: { id: true } });
    if (!status) throw new Error(`Status ${statusName} is not configured.`);

    const finalScore = await tx.finalScore.create({
      data: {
        eventId: event.id,
        appRatingId: participant.appRatingId,
        groupMemberId: groupMember.id,
        statusId: status.id,
        essayScore: 0,
        multipleChoiceScore,
        finalScore: multipleChoiceScore,
        essayStartedAt: participant.joinedAt,
        essaySubmittedAt: essayQuestions.length ? (participant.essaySubmittedAt || now) : null,
        multipleChoiceStartedAt: participant.joinedAt,
        multipleChoiceSubmittedAt: mcQuestions.length ? (participant.multipleChoiceSubmittedAt || now) : null,
      },
    });
    if (essayQuestions.length) {
      await tx.essayCorrection.createMany({
        data: essayQuestions.map((item) => ({
          finalScoreId: finalScore.id,
          appRatingId: participant.appRatingId,
          groupMemberId: groupMember.id,
          essayId: item.id,
          answer: String(essayAnswers[item.id] || ""),
        })),
      });
    }
    if (mcQuestions.length) {
      await tx.multipleChoiceCorrection.createMany({
        data: mcQuestions.map((item) => ({
          finalScoreId: finalScore.id,
          appRatingId: participant.appRatingId,
          groupMemberId: groupMember.id,
          multipleChoiceId: item.id,
          answer: String(mcAnswers[item.id] || "") || null,
          isTrue: isCorrect(item),
          matsMode: item.mandatoryItemId ? snapshot.matsMode : null,
          mandatoryItemId: item.mandatoryItemId || null,
        })),
      });
    }
    await tx.appRating.update({ where: { id: participant.appRatingId }, data: { statusId: status.id } });
    if (!essayQuestions.length && passed && !requiresPractical) {
      const rating = await tx.appRating.findUnique({ where: { id: participant.appRatingId }, select: { ratingId: true } });
      if (rating?.ratingId) await tx.userRating.create({ data: {
        ratingId: rating.ratingId,
        userId: participant.eventUser.userNik,
        finalScoreId: finalScore.id,
        expireddate: event.forExpiredDate,
      } });
    }
    await tx.theorySessionParticipant.update({ where: { id: participant.id }, data: {
      finalScoreId: finalScore.id,
      essaySubmittedAt: essayQuestions.length ? (participant.essaySubmittedAt || now) : null,
      multipleChoiceSubmittedAt: mcQuestions.length ? (participant.multipleChoiceSubmittedAt || now) : null,
    } });
    return finalScore.id;
  });
  if (finalScoreId) {
    try { await ensureFinalScoreCwpSnapshot(prisma, finalScoreId); }
    catch (error) { console.error("Theory final score CWP snapshot failed", { finalScoreId, error }); }
  }
  return finalScoreId;
};

export const finalizeTheorySession = async (sessionId) => {
  const session = await prisma.theorySession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "ENDED") return;
  if (session.status === "RUNNING" && theoryRemainingMs(session) > 0) return;
  if (session.status !== "RUNNING" && session.status !== "ENDING") return;
  if (session.status === "RUNNING") {
    const result = await prisma.theorySession.updateMany({
      where: { id: sessionId, status: "RUNNING" },
      data: { status: "ENDING", remainingSeconds: 0, resumedAt: null },
    });
    if (result.count !== 1) return;
    await prisma.theorySessionAction.create({ data: { sessionId, actorNik: "SYSTEM", action: "EXPIRED" } });
  }
  const participants = await prisma.theorySessionParticipant.findMany({ where: { sessionId, finalizedAt: null }, select: { id: true } });
  for (const participant of participants) await finalizeTheoryParticipant(participant.id);
  await prisma.theorySession.updateMany({ where: { id: sessionId, status: "ENDING" }, data: { status: "ENDED", endedAt: new Date(), remainingSeconds: 0 } });
};

export const sweepExpiredTheorySessions = async () => {
  const sessions = await prisma.theorySession.findMany({ where: { status: { in: ["RUNNING", "ENDING"] } }, select: { id: true, status: true, remainingSeconds: true, resumedAt: true } });
  for (const session of sessions) {
    if (session.status === "ENDING" || theoryRemainingMs(session) <= 0) {
      try { await finalizeTheorySession(session.id); }
      catch (error) { console.error("Theory session finalization failed", { sessionId: session.id, error }); }
    }
  }
};
