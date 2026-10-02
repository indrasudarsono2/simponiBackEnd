import prisma from '../lib/prisma.js';
import { assessCheckerReset, findAssignedResetMember, findMemberRatings, resetCheckerAttempt } from '../services/checkerExamReset.js';

export async function getResetOptions(req, res) {
  const groupMemberId = Number(req.params.groupMemberId);
  if (!Number.isInteger(groupMemberId) || groupMemberId <= 0) return res.status(400).json({ message: 'A valid member is required.' });
  try {
    const member = await findAssignedResetMember(req.user, groupMemberId);
    if (!member) return res.status(404).json({ message: 'No assigned Mode 1 Essay member was found in your branch unit.' });
    const ratings = await findMemberRatings(member);
    const ratingIds = ratings.map((rating) => rating.id);
    const resets = ratingIds.length ? await prisma.examinationAttemptReset.findMany({
      where: { appRatingId: { in: ratingIds } }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, appRatingId: true, checkerNik: true, reason: true,
        attemptNumber: true, createdAt: true },
    }) : [];
    return res.json({ member: { id: member.id, name: member.userMember?.name || member.member,
      event: member.group.event?.event || null },
      ratings: ratings.map((rating) => ({ id: rating.id, rating: rating.rating?.rating || null,
        status: rating.status?.status || null, ...assessCheckerReset(rating) })), resets });
  } catch (error) { return res.status(500).json({ message: error.message }); }
}

export async function postResetAttempt(req, res) {
  const groupMemberId = Number(req.body?.groupMemberId);
  const appRatingId = Number(req.body?.appRatingId);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(groupMemberId) || groupMemberId <= 0 ||
      !Number.isInteger(appRatingId) || appRatingId <= 0) {
    return res.status(400).json({ message: 'A member and rating are required.' });
  }
  if (reason.length < 10 || reason.length > 2000) {
    return res.status(400).json({ message: 'Reason must contain 10–2000 characters.' });
  }
  if (req.body?.confirmation !== 'RESET CURRENT ATTEMPT') {
    return res.status(400).json({ message: 'Please confirm the attempt reset.' });
  }
  try {
    const member = await findAssignedResetMember(req.user, groupMemberId);
    if (!member) return res.status(404).json({ message: 'No assigned Mode 1 Essay member was found in your branch unit.' });
    const result = await resetCheckerAttempt({ member, appRatingId, checkerNik: req.user.nik, reason });
    return res.json({ message: 'The current attempt was reset. The user may restart from Essay.', ...result });
  } catch (error) { return res.status(error.status || 500).json({ message: error.message }); }
}
