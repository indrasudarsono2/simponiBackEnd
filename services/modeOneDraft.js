import prisma from '../lib/prisma.js';
import sanitizeHtml from 'sanitize-html';

const KINDS = { ESSAY: 1, MULTIPLE_CHOICE: 2 };

export const questionIds = (kind, groups) => groups.flatMap((group) =>
  (kind === 'ESSAY' ? group.essay : group.multipleChoice) || [],
).map((entry) => Number(kind === 'ESSAY' ? entry.essay?.id : entry.multipleChoice?.id))
  .filter((id) => Number.isInteger(id) && id > 0);

export async function prepareModeOneDraft({ kind, appRatingId, eventId, eventUserId, groupMemberId, ownerNik, eventQuestion, questions, monitorTime }) {
  if (!(kind in KINDS)) throw new Error('Invalid Mode 1 draft kind.');
  const durationMs = Math.max(0, Number(eventQuestion.minutes || 0)) * 60_000;
  const deadlineAt = monitorTime?.createdAt
    ? new Date(new Date(monitorTime.createdAt).getTime() + durationMs) : null;
  const draft = await prisma.modeOneExamDraft.upsert({
    where: { appRatingId_kind: { appRatingId, kind } },
    create: { appRatingId, eventId, eventUserId, groupMemberId, ownerNik, kind,
      questionSnapshot: questions, answers: {}, deadlineAt },
    update: {},
  });
  if (draft.ownerNik !== ownerNik || draft.eventId !== eventId) {
    return null;
  }
  if (draft.submittedAt) {
    const rating = await prisma.appRating.findUnique({ where: { id: appRatingId },
      select: { status: { select: { status: true } },
        finalScores: { where: { deletedAt: null, isInvalidated: false },
          orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } } } });
    const status = String(rating?.status?.status || '').toUpperCase();
    const recheck = kind === 'ESSAY' ? status === 'RECHECK'
      : status === 'CHECKED' && rating?.finalScores?.[0]?.createdAt > draft.submittedAt;
    // Older invalidations predate the transactional draft cleanup. Their
    // audit record authorizes a fresh draft without changing the audit trail.
    const earlierAdminReset = !recheck && ['REGISTERED', 'CHECKED'].includes(status)
      && await prisma.examinationInvalidation.findFirst({
      where: { appRatingId, createdAt: { gte: draft.submittedAt } },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    if (!recheck && !earlierAdminReset) return null;
    return prisma.modeOneExamDraft.update({ where: { id: draft.id },
      data: { questionSnapshot: questions, answers: {}, eventUserId, groupMemberId,
        deadlineAt, submittedAt: null, processingAt: null } });
  }
  if (!draft.deadlineAt && deadlineAt) {
    return prisma.modeOneExamDraft.update({ where: { id: draft.id }, data: { deadlineAt } });
  }
  return draft;
}

export async function saveModeOneDraft(req, res) {
  const appRatingId = Number(req.body?.appRatingId);
  const eventId = Number(req.body?.eventId);
  const kind = String(req.body?.kind || '').toUpperCase();
  const answers = req.body?.answers;
  if (!Number.isInteger(appRatingId) || !Number.isInteger(eventId) || !(kind in KINDS) ||
      !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ message: 'Invalid draft payload.' });
  }
  try {
    const draft = await prisma.modeOneExamDraft.findUnique({ where: { appRatingId_kind: { appRatingId, kind } } });
    if (!draft || draft.ownerNik !== req.user.nik || draft.eventId !== eventId) {
      return res.status(404).json({ message: 'Examination draft was not found.' });
    }
    if (draft.submittedAt || !draft.deadlineAt || new Date(draft.deadlineAt).getTime() <= Date.now()) {
      return res.status(409).json({ message: 'This examination part has ended.' });
    }
    const allowed = new Set(questionIds(kind, draft.questionSnapshot).map(String));
    if (Object.keys(answers).some((id) => !allowed.has(id))) {
      return res.status(400).json({ message: 'Draft includes an unassigned question.' });
    }
    const cleaned = {};
    for (const [id, answer] of Object.entries(answers)) {
      if (typeof answer !== 'string' || answer.length > (kind === 'ESSAY' ? 20_000 : 5)) {
        return res.status(400).json({ message: 'An answer is invalid or too long.' });
      }
      if (kind === 'MULTIPLE_CHOICE' && answer && !['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) {
        return res.status(400).json({ message: 'Multiple-choice answers must be A, B, C, or D.' });
      }
      cleaned[id] = kind === 'ESSAY' ? sanitizeHtml(answer, {
        allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2'],
        allowedAttributes: {},
      }) : answer.toUpperCase();
    }
    const saved = await prisma.modeOneExamDraft.updateMany({
      where: { id: draft.id, submittedAt: null, processingAt: null, deadlineAt: { gt: new Date() } },
      data: { answers: cleaned },
    });
    if (saved.count !== 1) return res.status(409).json({ message: 'This examination part has ended.' });
    return res.json({ saved: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

export async function markModeOneDraftSubmitted(appRatingId, kind) {
  await prisma.modeOneExamDraft.updateMany({
    where: { appRatingId, kind, submittedAt: null },
    data: { submittedAt: new Date(), processingAt: null },
  });
}

export async function claimModeOneDraft({ appRatingId, kind, ownerNik, eventId, ids, alreadyClaimed = false }) {
  const draft = await prisma.modeOneExamDraft.findUnique({
    where: { appRatingId_kind: { appRatingId: Number(appRatingId), kind } },
  });
  if (!draft) {
    if (alreadyClaimed) throw Object.assign(new Error('This examination attempt was reset.'), { status: 409 });
    return null; // An examination opened before this feature was deployed.
  }
  if (draft.ownerNik !== ownerNik || draft.eventId !== Number(eventId)) {
    throw Object.assign(new Error('This examination attempt does not belong to the current user.'), { status: 403 });
  }
  const assigned = questionIds(kind, draft.questionSnapshot).sort((a, b) => a - b);
  const submitted = ids.map(Number).sort((a, b) => a - b);
  if (assigned.length !== submitted.length || assigned.some((id, index) => id !== submitted[index])) {
    throw Object.assign(new Error('Submitted questions differ from the assigned examination.'), { status: 400 });
  }
  if (draft.submittedAt) throw Object.assign(new Error('This examination part has already been submitted.'), { status: 409 });
  if (!alreadyClaimed) {
    const claimed = await prisma.modeOneExamDraft.updateMany({
      where: { id: draft.id, submittedAt: null,
        OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - 120_000) } }] },
      data: { processingAt: new Date() },
    });
    if (!claimed.count) throw Object.assign(new Error('This examination part is already being submitted.'), { status: 409 });
  }
  return draft.id;
}

export async function releaseModeOneDraftClaim(id) {
  if (id) await prisma.modeOneExamDraft.updateMany({ where: { id, submittedAt: null }, data: { processingAt: null } });
}
