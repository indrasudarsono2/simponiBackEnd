import prisma from '../lib/prisma.js';
import { revokeCertificatesForFinalScore } from './certificate.js';
import { groupPolicyInclude, assignedForRating } from './groupRatingPolicy.js';
import { isCheckerAdmin } from '../utils/checkerAdminScope.js';

const PARTIAL_STATUSES = new Set(['CHECKING ESSAY', 'CHECKED']);
const FINAL_STATUSES = new Set(['SUCCESS', 'WAITING PRACTICAL', 'PRACTICAL RECHECK']);
const statusName = (value) => String(value || '').trim().toUpperCase();
export async function deleteAttemptQuestionAnswers(tx, finalScoreId, includeEssay = false) {
  // Never delete question-bank records or another attempt's correction rows.
  if (includeEssay) await tx.essayCorrection.deleteMany({ where: { finalScoreId } });
  await tx.multipleChoiceCorrection.deleteMany({ where: { finalScoreId } });
}
export function assessMultipleChoiceReset(rating, now = new Date()) {
  const latest = [...(rating.finalScores || [])].sort((a,b) => b.id-a.id)[0];
  const draft = (rating.modeOneExamDrafts || []).find(item => item.kind === 'MULTIPLE_CHOICE');
  const expired = draft?.deadlineAt && new Date(draft.deadlineAt) <= now;
  const timedOut = expired && (!draft.submittedAt || new Date(draft.submittedAt) >= new Date(draft.deadlineAt));
  const busy = draft?.processingAt && now - new Date(draft.processingAt) < 120000;
  return { canResetMultipleChoice: Boolean(latest?.essaySubmittedAt && latest.essayScore != null && draft && timedOut && !busy && ['CHECKED','FAILED','RECHECK'].includes(statusName(latest.status?.status))), preservedFinalScoreId: latest?.id ?? null };
}

export function assessCheckerReset(rating) {
  const scores = [...(rating.finalScores || [])].sort((a, b) => a.id - b.id);
  const latest = scores.at(-1) || null;
  const latestStatus = statusName(latest?.status?.status);
  const priorFailures = scores.filter((score) => statusName(score.status?.status) === 'FAILED').length;
  const startedDrafts = (rating.modeOneExamDrafts || []).filter((draft) => draft.deadlineAt && !draft.submittedAt);
  const busy = startedDrafts.some((draft) => draft.processingAt && Date.now() - new Date(draft.processingAt).getTime() < 120_000);
  const startedAfterLatest = startedDrafts.some((draft) =>
    !latest || new Date(draft.createdAt).getTime() > new Date(latest.updatedAt).getTime(),
  );
  const partialScore = PARTIAL_STATUSES.has(latestStatus) ? latest : null;
  const activeAttempt = Boolean(partialScore || startedAfterLatest);
  const canReset = activeAttempt && !busy && !FINAL_STATUSES.has(latestStatus);
  const reason = busy ? 'Submission is in progress. Retry shortly.'
    : FINAL_STATUSES.has(latestStatus) ? 'A finalized result requires Checker Admin review.'
      : !activeAttempt ? 'No interrupted examination attempt is available to reset.' : null;
  return { canReset, reason, attemptNumber: priorFailures + 1, priorFailures,
    partialFinalScoreId: partialScore?.id ?? null, latestStatus };
}

export async function findAssignedResetMember(user, groupMemberId, client = prisma) {
  const admin = isCheckerAdmin(user);
  if (!Number.isSafeInteger(Number(user.branchUnitId)) || Number(user.branchUnitId) <= 0) return null;
  const member = await client.groupMember.findFirst({
    where: { id: groupMemberId, deletedAt: null,
      userMember: { is: { deletedAt: null, branchUnitId: Number(user.branchUnitId) } },
      group: { is: { deletedAt: null,
        ...(!admin ? { checkerGroups: { some: { checker: user.nik, deletedAt: null } } } : {}),
        event: { is: { deletedAt: null, theoryMode: 'MODE_1' } },
      } } },
    select: { id: true, groupId: true, member: true, userMember: { select: { name: true } },
      group: { select: { eventId: true, event: { select: { id: true, event: true,
        sector: { select: { branchUnitId: true } },
        eventQuestions: { where: { deletedAt: null }, select: { kindOfQuestionId: true } },
      } } } } },
  });
  const event = member?.group?.event;
  if (!member || !member.member || member.member === user.nik || !event ||
      Number(event.sector?.branchUnitId) !== Number(user.branchUnitId) ||
      !event.eventQuestions.some((question) => question.kindOfQuestionId === 1)) return null;
  if (!admin) member.requestingCheckerNik = user.nik;
  member.resetAuthority = admin ? 'CHECKER ADMIN' : 'CHECKER';
  return member;
}

export const ratingResetSelect = {
  id: true, ratingId: true, statusId: true, status: { select: { status: true } },
  rating: { select: { rating: true } },
  finalScores: { where: { deletedAt: null, isInvalidated: false }, orderBy: { id: 'asc' },
    select: { id: true, statusId: true, updatedAt: true, essayScore: true, essaySubmittedAt: true, multipleChoiceScore: true, finalScore: true, multipleChoiceStartedAt: true, multipleChoiceSubmittedAt: true, status: { select: { status: true } } } },
  modeOneExamDrafts: { select: { id: true, kind: true, createdAt: true,
    deadlineAt: true, submittedAt: true, processingAt: true, answers: true, questionSnapshot: true } },
};

export async function findMemberRatings(member, client = prisma) {
  const ratings = await client.appRating.findMany({
    where: { deletedAt: null, applicationDoc: { is: { deletedAt: null,
      eventUser: { is: { deletedAt: null, eventId: member.group.eventId, userNik: member.member } },
    } } },
    select: ratingResetSelect,
    orderBy: { id: 'desc' },
  });
  if (!member.requestingCheckerNik) return ratings;
  const group = await client.group.findUnique({ where: { id: member.groupId }, include: groupPolicyInclude });
  return ratings.filter(r => assignedForRating(group, member.requestingCheckerNik, r.ratingId));
}

export async function resetCheckerAttempt({ member, appRatingId, checkerNik, reason, resetPart = 'ALL' }) {
  return prisma.$transaction(async (tx) => {
    await tx.appRating.update({ where: { id: appRatingId }, data: { updatedAt: new Date() } });
    const ratings = await findMemberRatings(member, tx);
    const rating = ratings.find((item) => item.id === appRatingId);
    if (!rating) throw Object.assign(new Error('This rating is not assigned to the selected member.'), { status: 404 });
    if (resetPart === 'MULTIPLE_CHOICE') {
      const assessment = assessMultipleChoiceReset(rating);
      if (!assessment.canResetMultipleChoice) throw Object.assign(new Error('Only an expired Multiple Choice attempt with a scored essay can be reset this way.'), { status: 409 });
      const score = rating.finalScores.find(item => item.id === assessment.preservedFinalScoreId);
      const checked = await tx.status.findFirst({ where: { status: 'CHECKED', deletedAt: null }, select: { id: true } });
      if (!checked) throw new Error('CHECKED status is not configured.');
      const changed = await tx.finalScore.updateMany({ where: { id: score.id, updatedAt: score.updatedAt, statusId: score.statusId, isInvalidated: false, deletedAt: null }, data: { statusId: checked.id, finalScore: null, multipleChoiceScore: null, multipleChoiceStartedAt: null, multipleChoiceSubmittedAt: null } });
      if (changed.count !== 1) throw Object.assign(new Error('Attempt changed. Reload before resetting.'), { status: 409 });
      const audit = await tx.examinationAttemptReset.create({ data: { appRatingId, eventId: member.group.eventId, groupMemberId: member.id, checkerNik, previousStatusId: rating.statusId, attemptNumber: rating.finalScores.filter(item => item.id !== score.id && statusName(item.status?.status) === 'FAILED').length + 1, reason: `${member.resetAuthority || 'CHECKER'} — MULTIPLE_CHOICE_ONLY — PERMANENT QUESTION/ANSWER DELETION (finalScoreId=${score.id}): ${reason}` } });
      await deleteAttemptQuestionAnswers(tx, score.id);
      await tx.modeOneExamDraft.deleteMany({ where: { appRatingId, eventId: member.group.eventId, kind: 'MULTIPLE_CHOICE' } });
      await tx.matsQuestionSelection.deleteMany({ where: { appRatingId, eventId: member.group.eventId } });
      await tx.monitorTime.updateMany({ where: { appRatingId, deletedAt: null, eventQuestion: { is: { eventId: member.group.eventId, kindOfQuestionId: 2 } } }, data: { deletedAt: new Date() } });
      await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: checked.id } });
      return { resetId: audit.id, status: 'CHECKED', resetPart, preservedFinalScoreId: score.id };
    }
    const assessment = assessCheckerReset(rating);
    if (!assessment.canReset) throw Object.assign(new Error(assessment.reason), { status: 409 });

    const now = new Date();
    if (assessment.partialFinalScoreId) {
      const partial = rating.finalScores.find((score) => score.id === assessment.partialFinalScoreId);
      const updated = await tx.finalScore.updateMany({
        where: { id: partial.id, appRatingId, statusId: partial.statusId, isInvalidated: false, deletedAt: null },
        data: { isInvalidated: true, invalidatedAt: now, invalidatedBy: checkerNik,
          invalidationReason: `Checker reset: ${reason}` },
      });
      if (updated.count !== 1) throw Object.assign(new Error('The attempt changed while resetting. Please refresh.'), { status: 409 });
      await deleteAttemptQuestionAnswers(tx, partial.id, true);
      await tx.userRating.updateMany({ where: { finalScoreId: partial.id, deletedAt: null }, data: { deletedAt: now } });
      await revokeCertificatesForFinalScore(tx, partial.id, 'Checker reset of interrupted examination');
    }

    const status = assessment.priorFailures > 0 ? 'RECHECK' : 'REGISTERED';
    const retryStatus = await tx.status.findFirst({ where: { status, deletedAt: null }, select: { id: true } });
    if (!retryStatus) throw new Error(`${status} status is not configured.`);
    const audit = await tx.examinationAttemptReset.create({ data: {
      appRatingId, eventId: member.group.eventId, groupMemberId: member.id,
      checkerNik, reason: `${member.resetAuthority || 'CHECKER'} — FULL RESET — PERMANENT QUESTION/ANSWER DELETION: ${reason}`, attemptNumber: assessment.attemptNumber,
      previousStatusId: rating.statusId, voidedFinalScoreId: assessment.partialFinalScoreId,
    } });
    await tx.modeOneExamDraft.deleteMany({ where: { appRatingId, eventId: member.group.eventId } });
    await tx.monitorTime.updateMany({ where: { appRatingId, deletedAt: null }, data: { deletedAt: now } });
    await tx.matsQuestionSelection.deleteMany({ where: { appRatingId, eventId: member.group.eventId } });
    await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: retryStatus.id } });
    return { resetId: audit.id, attemptNumber: assessment.attemptNumber, status };
  });
}
