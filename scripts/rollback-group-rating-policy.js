// Local-development rollback only. Never deletes scores, files, or audit records.
import prisma from '../lib/prisma.js';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error('Rollback is restricted to the local development database.');
const apply = process.argv.includes('--apply');
try {
  await prisma.$transaction(async tx => {
    const groups = await tx.group.findMany({ where: { assignmentPolicy: 1, deletedAt: null }, include: {
      groupMembers: true, checkerGroups: true,
      assignmentAudits: { where: { action: 'BEFORE_UPDATE' }, orderBy: { id: 'asc' }, take: 1 },
    } });
    for (const group of groups) {
      await tx.$queryRawUnsafe('SELECT id FROM `Event` WHERE id = ? FOR UPDATE', group.eventId);
      const memberIds = group.groupMembers.map(m => m.id);
      const used = await tx.applicationDoc.count({ where: { eventUser: { eventId: group.eventId }, userNik: { in: group.groupMembers.map(m => m.member).filter(Boolean) } } })
        + await tx.finalScore.count({ where: { groupMemberId: { in: memberIds } } })
        + await tx.practicalTest.count({ where: { groupMemberId: { in: memberIds } } });
      if (used) throw new Error(`Group ${group.id} has application/examination records. Rollback refused: keep the current code and use a reviewed forward fix or a consistent database+code backup.`);
    }
    console.log(`${groups.length} unused explicit-assignment groups; no application or examination records. ${apply ? 'Applying rollback.' : 'Preview only.'}`);
    if (!apply) return;
    for (const group of groups) {
      const original = group.assignmentAudits[0]?.snapshot;
      const restoreOriginal = original && !original.assignmentPolicy;
      const now = new Date();
      await tx.groupAssignmentAudit.create({ data: { groupId: group.id, actorNik: 'LOCAL_ROLLBACK', action: 'ROLLED_BACK', snapshot: JSON.parse(JSON.stringify({ group, restoreOriginal: Boolean(restoreOriginal) })) } });
      await tx.checkerGroup.updateMany({ where: { groupId: group.id, deletedAt: null }, data: { deletedAt: now } });
      await tx.groupMember.updateMany({ where: { groupId: group.id, deletedAt: null }, data: { deletedAt: now } });
      if (restoreOriginal) {
        await tx.group.update({ where: { id: group.id }, data: { group: original.group, pic: original.pic, assignmentPolicy: original.assignmentPolicy || 0, ratingIds: original.ratingIds || [], deletedAt: original.deletedAt ? new Date(original.deletedAt) : null } });
        for (const c of original.checkerGroups || []) await tx.checkerGroup.update({ where: { id: c.id }, data: { deletedAt: c.deletedAt ? new Date(c.deletedAt) : null } });
        for (const m of original.groupMembers || []) await tx.groupMember.update({ where: { id: m.id }, data: { deletedAt: m.deletedAt ? new Date(m.deletedAt) : null } });
      } else await tx.group.update({ where: { id: group.id }, data: { deletedAt: now } });
    }
  }, { timeout: 30000 });
} finally { await prisma.$disconnect(); }
