import prisma from '../lib/prisma.js';
import { policyError, validateRatingCoverage } from '../services/groupRatingPolicy.js';

async function saveGroup(req, res, updating) {
  try {
    const id = Number(req.params?.id);
    const eventId = Number(req.body.eventId);
    const { pic, members, ratingIds, assignments } = req.body;
    const name = String(req.body.group || '').trim();
    if (!req.user.branchUnitId || !Number.isSafeInteger(eventId) || eventId < 1 || (updating && (!Number.isSafeInteger(id) || id < 1)) || name.length < 2 || name.length > 150) throw policyError('Select an event and provide a group name (2–150 characters).');
    if (!Array.isArray(members) || !members.length || members.some(nik => typeof nik !== 'string' || !nik.trim()) || new Set(members).size !== members.length) throw policyError('Select distinct event members.');
    if (!Array.isArray(ratingIds) || !ratingIds.length || !Array.isArray(assignments) || !assignments.length) throw policyError('Select group ratings and responsible checkers.');
    const result = await prisma.$transaction(async tx => {
      // Serialize configuration updates and duplicate-member checks for this event.
      await tx.$queryRawUnsafe('SELECT id FROM `Event` WHERE id = ? FOR UPDATE', eventId);
      const event = await tx.event.findFirst({ where: { id: eventId, deletedAt: null, session: { branchUnitId: req.user.branchUnitId, deletedAt: null } }, include: { remarkDoc: true, sector: { include: { subBranchUnitRatings: { where: { deletedAt: null, rating: { deletedAt: null } } } } } } });
      if (!event) throw policyError('Event is not available in your branch unit.', 404);
      const existing = updating ? await tx.group.findFirst({ where: { id, deletedAt: null, event: { session: { branchUnitId: req.user.branchUnitId } } }, include: { groupMembers: true, checkerGroups: { include: { ratingAssignments: true } } } }) : null;
      if (updating && !existing) throw policyError('Group not found in your branch unit.', 404);
      if (updating && existing.eventId !== eventId) throw policyError('Create a new group instead of moving an existing group to another event.', 409);
      if (existing && await tx.applicationDoc.count({ where: { deletedAt: null, eventUser: { eventId }, userNik: { in: existing.groupMembers.map(m => m.member).filter(Boolean) } } })) {
        throw policyError('This group has application documents. Assignments are locked to preserve examination history.', 409);
      }
      const niks = [...new Set((Array.isArray(assignments) ? assignments : []).map(a => a?.checker).filter(n => typeof n === 'string'))];
      const users = await tx.user.findMany({ where: { nik: { in: niks }, branchUnitId: req.user.branchUnitId, deletedAt: null }, select: { nik: true, userRoles: { where: { deletedAt: null }, select: { roles: { select: { role: true, deletedAt: true } }, checkerRatings: { where: { deletedAt: null }, select: { ratingId: true, deletedAt: true, rating: { select: { deletedAt: true } } } } } } } });
      const policy = validateRatingCoverage({ pic, ratingIds, assignments, users, remark: event.remarkDoc?.remark?.trim().toUpperCase(), allowedRatingIds: event.sector?.subBranchUnitRatings.map(r => r.ratingId) || [] });
      if (members.some(nik => policy.checkers.includes(nik))) throw policyError('A checker cannot examine themselves in the same group.');
      const eligible = await tx.eventUser.findMany({ where: { eventId, deletedAt: null, userNik: { in: members }, user: { branchUnitId: req.user.branchUnitId, deletedAt: null } }, select: { userNik: true } });
      if (members.some(nik => !eligible.some(u => u.userNik === nik))) throw policyError('All members must belong to this event and branch unit.');
      const duplicate = await tx.groupMember.findFirst({ where: { deletedAt: null, member: { in: members }, group: { eventId, deletedAt: null, ...(updating ? { id: { not: id } } : {}) } } });
      if (duplicate) throw policyError('A selected member already belongs to another active group in this event.');
      if (existing) {
        await tx.groupAssignmentAudit.create({ data: { groupId: id, actorNik: req.user.nik, action: 'BEFORE_UPDATE', snapshot: JSON.parse(JSON.stringify(existing)) } });
        await tx.checkerGroup.updateMany({ where: { groupId: id, deletedAt: null }, data: { deletedAt: new Date() } });
        await tx.groupMember.updateMany({ where: { groupId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      }
      const data = { eventId, pic, group: name, assignmentPolicy: 1, ratingIds,
        checkerGroups: { create: policy.checkers.map(checker => ({ checker, ratingAssignments: { create: assignments.filter(a => a.checker === checker).map(a => ({ ratingId: a.ratingId })) } })) },
        groupMembers: { create: members.map(member => ({ member })) },
      };
      const saved = existing ? await tx.group.update({ where: { id }, data }) : await tx.group.create({ data });
      await tx.groupAssignmentAudit.create({ data: { groupId: saved.id, actorNik: req.user.nik, action: updating ? 'UPDATED' : 'CREATED', snapshot: { eventId, pic, group: name, ratingIds, assignments, members, policy: 1 } } });
      return saved;
    });
    res.status(updating ? 200 : 201).json({ success: true, id: result.id });
  } catch (error) { res.status(error.status || 500).json({ message: error.message }); }
}
export const addGroup = (req, res) => saveGroup(req, res, false);
export const updateGroup = (req, res) => saveGroup(req, res, true);
export const deleteGroup = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.user.branchUnitId || !Number.isSafeInteger(id) || id < 1) throw policyError('Invalid group or branch unit.');
    await prisma.$transaction(async tx => {
      const group = await tx.group.findFirst({ where: { id, deletedAt: null, event: { session: { branchUnitId: req.user.branchUnitId } } }, include: { groupMembers: true } });
      if (!group) throw policyError('Group not found.', 404);
      await tx.$queryRawUnsafe('SELECT id FROM `Event` WHERE id = ? FOR UPDATE', group.eventId);
      if (await tx.applicationDoc.count({ where: { deletedAt: null, eventUser: { eventId: group.eventId }, userNik: { in: group.groupMembers.map(m => m.member).filter(Boolean) } } })) throw policyError('A group with application documents cannot be deleted.', 409);
      await tx.groupAssignmentAudit.create({ data: { groupId: id, actorNik: req.user.nik, action: 'DELETED', snapshot: JSON.parse(JSON.stringify(group)) } });
      const now = new Date();
      await tx.group.update({ where: { id }, data: { deletedAt: now, checkerGroups: { updateMany: { where: { deletedAt: null }, data: { deletedAt: now } } }, groupMembers: { updateMany: { where: { deletedAt: null }, data: { deletedAt: now } } } } });
    });
    res.json({ success: true });
  } catch (error) { res.status(error.status || 500).json({ message: error.message }); }
};
