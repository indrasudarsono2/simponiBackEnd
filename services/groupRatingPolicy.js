import prisma from '../lib/prisma.js';

export const policyError = (message, status = 400) => Object.assign(new Error(message), { status });
export const checkerRatingIds = (user) => [...new Set((user?.userRoles || [])
  .filter(role => !role.deletedAt && role.roles?.role === 'CHECKER' && !role.roles?.deletedAt)
  .flatMap(role => (role.checkerRatings || []).filter(item => !item.deletedAt && !item.rating?.deletedAt).map(item => item.ratingId)))];

export function validateRatingCoverage({ pic, ratingIds, assignments, remark, users, allowedRatingIds }) {
  if (!Array.isArray(ratingIds) || !ratingIds.length || ratingIds.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(ratingIds).size !== ratingIds.length || ratingIds.some(id => !allowedRatingIds.includes(id))) {
    throw policyError('Select distinct ratings available for this event sector.');
  }
  const penerbitan = remark === 'PENERBITAN';
  if (penerbitan && ratingIds.length !== 1) throw policyError('PENERBITAN groups must have exactly one rating.');
  if (!['PENERBITAN', 'PERPANJANGAN'].includes(remark)) throw policyError('Unsupported event remark.');
  if (!Array.isArray(assignments) || !assignments.length || assignments.some(a => !a || !ratingIds.includes(a.ratingId) || typeof a.checker !== 'string')) {
    throw policyError('Assign qualified checkers to each selected rating.');
  }
  if (new Set(assignments.map(a => `${a.ratingId}:${a.checker}`)).size !== assignments.length) throw policyError('Duplicate checker/rating assignment.');
  const assigned = [...new Set(assignments.map(a => a.checker))];
  if (!assigned.includes(pic)) throw policyError('The PIC must also be assigned to a qualified group rating.');
  for (const a of assignments) {
    const user = users.find(u => u.nik === a.checker);
    if (!user || !checkerRatingIds(user).includes(a.ratingId)) throw policyError(`Checker ${a.checker} is not qualified for the assigned rating.`);
  }
  for (const ratingId of ratingIds) {
    const coverage = assignments.filter(a => a.ratingId === ratingId);
    if (penerbitan ? coverage.length < 2 : coverage.length !== 1) {
      throw policyError(penerbitan ? 'PENERBITAN requires PIC and at least one additional checker qualified for the same rating.' : 'PERPANJANGAN requires exactly one responsible checker per rating.');
    }
  }
  return { checkers: assigned, ratingIds, assignments };
}

export const groupPolicyInclude = {
  event: { select: { id: true, event: true, deletedAt: true, forExpiredDate: true,
    session: { select: { branchUnitId: true } }, remarkDoc: { select: { remark: true } } } },
  checkerGroups: { where: { deletedAt: null }, include: {
    ratingAssignments: true,
    userChecker: { select: { nik: true, name: true, deletedAt: true, branchUnitId: true, userRoles: { where: { deletedAt: null }, select: { roles: { select: { role: true, deletedAt: true } }, checkerRatings: { where: { deletedAt: null }, select: { ratingId: true, deletedAt: true, rating: { select: { deletedAt: true } } } } } } } },
  } },
};

export function assignedForRating(group, nik, ratingId) {
  const checker = group?.checkerGroups?.find(c => c.checker === nik && !c.deletedAt);
  if (!group || group.deletedAt || !checker) return false;
  if (!group.assignmentPolicy) return true; // Explicit compatibility for unreviewed historical groups.
  return checker.ratingAssignments?.some(a => a.ratingId === ratingId) &&
    checker.userChecker && !checker.userChecker.deletedAt &&
    Number(checker.userChecker.branchUnitId) === Number(group.event?.session?.branchUnitId) &&
    checkerRatingIds(checker.userChecker).includes(ratingId);
}

export async function assertRatingChecker(groupId, ratingId, user, client = prisma) {
  const group = await client.group.findFirst({ where: { id: groupId, deletedAt: null }, include: groupPolicyInclude });
  if (!group || group.event?.deletedAt || Number(group.event?.session?.branchUnitId) !== Number(user.branchUnitId) ||
      !assignedForRating(group, user.nik, ratingId)) throw policyError('This rating is not assigned to you in this branch unit.', 403);
  return group;
}

export function practicalCompletion(tests, passingGrade) {
  const allCompleted = tests.length > 0 && tests.every(t => t.score != null && Boolean(t.file));
  const anyFailed = tests.some(t => t.score != null && Number(t.score) < passingGrade);
  const allPassed = allCompleted && !anyFailed;
  return { allCompleted, allPassed, overallStatus: anyFailed ? 'FAILED' : allPassed ? 'SUCCESS' : 'WAITING PRACTICAL' };
}

export async function getApplicationAssignment(client, { eventId, memberNik, ratings, groupMemberId, branchUnitId }) {
  const member = await client.groupMember.findFirst({ where: {
    ...(groupMemberId ? { id: Number(groupMemberId) } : {}), member: memberNik, deletedAt: null,
    group: { eventId: Number(eventId), deletedAt: null },
  }, include: { group: { include: groupPolicyInclude } } });
  if (!member) throw policyError('No active checker group is assigned to this participant.', 409);
  if (branchUnitId && Number(member.group.event?.session?.branchUnitId) !== Number(branchUnitId)) throw policyError('The checker group is outside your branch unit.', 403);
  if (!Array.isArray(ratings)) throw policyError('Application ratings are required.');
  const ids = ratings.map(r => Number(r?.rating?.id ?? r?.ratingId));
  if (new Set(ids).size !== ids.length || !ids.length) throw policyError('Select distinct application ratings.');
  if (member.group.event.remarkDoc?.remark === 'PENERBITAN' && ids.length !== 1) throw policyError('PENERBITAN applications require exactly one rating.');
  const checkersByRating = new Map();
  for (const id of ids) {
    const checkers = member.group.checkerGroups.filter(c => assignedForRating(member.group, c.checker, id) && checkerRatingIds(c.userChecker).includes(id));
    if (member.group.assignmentPolicy && (!member.group.ratingIds?.includes(id) || !checkers.length)) throw policyError('The application rating has no qualified checker in this group.', 409);
    if (member.group.assignmentPolicy) {
      const assigned = member.group.checkerGroups.filter(c => c.ratingAssignments.some(a => a.ratingId === id));
      if (checkers.length !== assigned.length || (member.group.event.remarkDoc?.remark === 'PENERBITAN' && checkers.length < 2)) throw policyError('A required checker no longer has rating authority. Ask Checker Admin to review this group before applying.', 409);
    }
    checkersByRating.set(id, checkers);
  }
  return { member, checkersByRating };
}
