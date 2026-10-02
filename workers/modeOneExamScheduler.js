import prisma from "../lib/prisma.js";
import { postEssayAnswer, postMultipleChoiceAnswer } from "../controller/examintaionController.js";
import { questionIds } from "../services/modeOneDraft.js";
import { sendPendingModeOneEssayResults } from "../services/modeOneEssayResultEmail.js";

async function submitExpiredDraft(draft) {
  const claimed = await prisma.modeOneExamDraft.updateMany({
    where: { id: draft.id, submittedAt: null, deadlineAt: { lte: new Date() },
      OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - 120_000) } }] },
    data: { processingAt: new Date() },
  });
  if (!claimed.count) return;
  try {
    const user = await prisma.user.findUnique({ where: { nik: draft.ownerNik },
      select: { nik: true, branchUnitId: true } });
    if (!user) throw new Error(`Owner ${draft.ownerNik} was not found`);
    const latest = await prisma.modeOneExamDraft.findUnique({ where: { id: draft.id } });
    if (!latest || latest.submittedAt) return;
    const ids = questionIds(latest.kind, latest.questionSnapshot);
    const answers = latest.answers || {};
    const req = {
      modeOneDraftClaimed: true,
      user,
      body: {
        appRatingId: latest.appRatingId,
        eventId: latest.eventId,
        eventUserId: latest.eventUserId,
        groupMemberId: latest.groupMemberId,
        ...(latest.kind === "ESSAY"
          ? { essay: ids.map((essayId) => ({ essayId, answer: String(answers[essayId] || "") })) }
          : { multipleChoice: ids.map((multipleChoiceId) => ({ multipleChoiceId, answer: String(answers[multipleChoiceId] || "") })) }),
      },
    };
    let responseStatus = 200;
    const res = { status(code) { responseStatus = code; return this; }, json(body) { return body; } };
    if (latest.kind === "ESSAY") await postEssayAnswer(req, res);
    else await postMultipleChoiceAnswer(req, res);
    if (responseStatus >= 400) throw new Error(`Final submission returned ${responseStatus}`);
  } catch (error) {
    console.error(`Mode 1 draft ${draft.id} could not be submitted:`, error);
    await prisma.modeOneExamDraft.updateMany({
      where: { id: draft.id, submittedAt: null }, data: { processingAt: null },
    });
  }
}

export function startModeOneExamScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const expired = await prisma.modeOneExamDraft.findMany({
        where: { submittedAt: null, deadlineAt: { lte: new Date() },
          OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - 120_000) } }] },
        take: 25, orderBy: { deadlineAt: "asc" },
      });
      for (const draft of expired) await submitExpiredDraft(draft);
      await sendPendingModeOneEssayResults();
    } catch (error) { console.error("Mode 1 exam scheduler failed", error); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 15_000);
  timer.unref?.();
  void tick();
  return { stop: () => clearInterval(timer) };
}
