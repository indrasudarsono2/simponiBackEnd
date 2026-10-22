import prisma from '../lib/prisma.js';
import { isCheckerAdmin, sameBranchUnit } from '../utils/checkerAdminScope.js';
import { assertRatingChecker } from './groupRatingPolicy.js';

export async function assertEssayScorer(score, user, reason, client = prisma) {
  if (!isCheckerAdmin(user)) return assertRatingChecker(score.groupMember?.groupId, score.appRating?.ratingId, user, client);
  const memberId = score.groupMemberId ?? score.groupMember?.id;
  if (!Number.isSafeInteger(memberId) || memberId <= 0) throw Object.assign(new Error('Invalid examination membership.'), { status: 403 });
  const member = await client.groupMember.findFirst({
    where: { id: memberId, deletedAt: null },
    include: { userMember: true, group: { include: { event: { include: { session: true } } } } },
  });
  if (!member || member.member === user.nik || member.userMember?.deletedAt ||
      !sameBranchUnit(user, member.userMember?.branchUnitId) || member.group?.deletedAt ||
      member.group?.event?.deletedAt || !sameBranchUnit(user, member.group?.event?.session?.branchUnitId)) {
    throw Object.assign(new Error('Essay scoring is limited to other members of your branch unit.'), { status: 403 });
  }
  if (score.deletedAt || score.isInvalidated || score.statusId !== 3 || !score.essaySubmittedAt) {
    throw Object.assign(new Error('Only submitted, pending essays can be scored.'), { status: 409 });
  }
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 1000) {
    throw Object.assign(new Error('Provide a takeover reason of 10–1000 characters.'), { status: 400 });
  }
}

export async function auditAdminEssayScore(tx, score, user, reason, answers) {
  if (!isCheckerAdmin(user)) return;
  await tx.essayScoringAudit.create({ data: {
    finalScoreId: score.id, actorNik: user.nik, branchUnitId: Number(user.branchUnitId),
    reason: reason.trim(), scores: answers,
  } });
}
