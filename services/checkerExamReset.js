import prisma from '../lib/prisma.js';
import { revokeCertificatesForFinalScore } from './certificate.js';

const PARTIAL_STATUSES = new Set(['CHECKING ESSAY', 'CHECKED']);
const FINAL_STATUSES = new Set(['SUCCESS', 'WAITING PRACTICAL', 'PRACTICAL RECHECK']);
const statusName = (value) => String(value || '').trim().toUpperCase();

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
  const member = await client.groupMember.findFirst({
    where: { id: groupMemberId, deletedAt: null,
      group: { is: { deletedAt: null,
        checkerGroups: { some: { checker: user.nik, deletedAt: null } },
        event: { is: { deletedAt: null, theoryMode: 'MODE_1' } },
      } } },
    select: { id: true, member: true, userMember: { select: { name: true } },
      group: { select: { eventId: true, event: { select: { id: true, event: true,
        sector: { select: { branchUnitId: true } },
        eventQuestions: { where: { deletedAt: null }, select: { kindOfQuestionId: true } },
      } } } } },
  });
  const event = member?.group?.event;
  if (!member || !member.member || member.member === user.nik || !event ||
      Number(event.sector?.branchUnitId) !== Number(user.branchUnitId) ||
      !event.eventQuestions.some((question) => question.kindOfQuestionId === 1)) return null;
  return member;
}

export const ratingResetSelect = {
  id: true, statusId: true, status: { select: { status: true } },
  rating: { select: { rating: true } },
  finalScores: { where: { deletedAt: null, isInvalidated: false }, orderBy: { id: 'asc' },
    select: { id: true, statusId: true, updatedAt: true, status: { select: { status: true } } } },
  modeOneExamDrafts: { select: { id: true, kind: true, createdAt: true,
    deadlineAt: true, submittedAt: true, processingAt: true } },
};

export async function findMemberRatings(member, client = prisma) {
  return client.appRating.findMany({
    where: { deletedAt: null, applicationDoc: { is: { deletedAt: null,
      eventUser: { is: { deletedAt: null, eventId: member.group.eventId, userNik: member.member } },
    } } },
    select: ratingResetSelect,
    orderBy: { id: 'desc' },
  });
}

export async function resetCheckerAttempt({ member, appRatingId, checkerNik, reason }) {
  return prisma.$transaction(async (tx) => {
    const ratings = await findMemberRatings(member, tx);
    const rating = ratings.find((item) => item.id === appRatingId);
    if (!rating) throw Object.assign(new Error('This rating is not assigned to the selected member.'), { status: 404 });
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
      await tx.essayCorrection.updateMany({ where: { finalScoreId: partial.id, deletedAt: null }, data: { deletedAt: now } });
      await tx.multipleChoiceCorrection.updateMany({ where: { finalScoreId: partial.id, deletedAt: null }, data: { deletedAt: now } });
      await tx.userRating.updateMany({ where: { finalScoreId: partial.id, deletedAt: null }, data: { deletedAt: now } });
      await revokeCertificatesForFinalScore(tx, partial.id, 'Checker reset of interrupted examination');
    }

    const status = assessment.priorFailures > 0 ? 'RECHECK' : 'REGISTERED';
    const retryStatus = await tx.status.findFirst({ where: { status, deletedAt: null }, select: { id: true } });
    if (!retryStatus) throw new Error(`${status} status is not configured.`);
    const audit = await tx.examinationAttemptReset.create({ data: {
      appRatingId, eventId: member.group.eventId, groupMemberId: member.id,
      checkerNik, reason, attemptNumber: assessment.attemptNumber,
      previousStatusId: rating.statusId, voidedFinalScoreId: assessment.partialFinalScoreId,
    } });
    await tx.modeOneExamDraft.deleteMany({ where: { appRatingId, eventId: member.group.eventId } });
    await tx.monitorTime.updateMany({ where: { appRatingId, deletedAt: null }, data: { deletedAt: now } });
    await tx.matsQuestionSelection.deleteMany({ where: { appRatingId, eventId: member.group.eventId } });
    await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: retryStatus.id } });
    return { resetId: audit.id, attemptNumber: assessment.attemptNumber, status };
  });
}
