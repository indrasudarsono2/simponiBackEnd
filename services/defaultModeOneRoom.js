import prisma from '../lib/prisma.js';

export const pendingTheoryRatingWhere = {
  deletedAt: null,
  status: { is: { status: { in: ['REGISTERED', 'RECHECK', 'CHECKED', 'CHECKING ESSAY'] } } },
};
export const verifiedRoomDocumentWhere = {
  deletedAt: null, statusId: 2,
  verifications: { is: { isValid: true, deletedAt: null } },
  appRatings: { some: pendingTheoryRatingWhere },
};
export const missingRoomWhere = {
  OR: [
    { attendaces: { is: null } },
    { attendaces: { is: { OR: [{ deletedAt: { not: null } }, { roomId: null }, { room: { is: { deletedAt: { not: null } } } }] } } },
  ],
};

export const roomRecoveryWhere = (branchUnitId, now = new Date()) => ({
  deletedAt: null,
  applicationDocs: { some: verifiedRoomDocumentWhere },
  ...missingRoomWhere,
  event: { is: {
    deletedAt: null, theoryMode: 'MODE_1',
    OR: [{ finishDate: { gte: now } }, { finishDate: null }],
    sector: { is: { deletedAt: null, ...(branchUnitId != null ? { branchUnitId } : {}) } },
  } },
});

export const defaultRoomDatesAreValid = event => Boolean(event.startDate && event.finishDate &&
  Number.isFinite(new Date(event.startDate).getTime()) && Number.isFinite(new Date(event.finishDate).getTime()) &&
  new Date(event.finishDate) > new Date(event.startDate));

// The caller owns the transaction. Lock the event-user row before deciding
// whether a manual assignment already exists, then serialize room creation per event.
export async function ensureDefaultRoom(db, eventUserId, { branchUnitId = null, checkerNik = null, now = new Date() } = {}) {
  await db.eventUser.update({ where: { id: Number(eventUserId) }, data: { updatedAt: now } });
  const participant = await db.eventUser.findFirst({
    where: { id: Number(eventUserId), deletedAt: null, applicationDocs: { some: verifiedRoomDocumentWhere },
      event: { is: { deletedAt: null, theoryMode: 'MODE_1', sector: { is: { deletedAt: null, ...(branchUnitId != null ? { branchUnitId } : {}) } } } } },
    select: { id: true, attendaces: { select: { id: true, roomId: true, deletedAt: true, room: { select: { deletedAt: true, defaultEventId: true } } } },
      event: { select: { id: true, event: true, startDate: true, finishDate: true, groups: { where: { deletedAt: null }, orderBy: { id: 'asc' }, take: 1, select: { pic: true } } } } },
  });
  if (!participant) return { assigned: false, reason: 'Not an eligible verified Mode 1 participant.' };
  const attendance = participant.attendaces;
  if (attendance?.roomId && !attendance.deletedAt && attendance.room && !attendance.room.deletedAt) return { assigned: true, preserved: true, roomId: attendance.roomId };
  const event = participant.event;
  if (!defaultRoomDatesAreValid(event)) return { assigned: false, reason: 'The event must have valid examination start and finish dates.' };
  if (new Date(event.finishDate) < now) return { assigned: false, reason: 'The event examination period has ended.' };
  await db.event.update({ where: { id: event.id }, data: { updatedAt: now } });
  const name = `Default — ${event.event || `Event ${event.id}`}`.slice(0, 150);
  const room = await db.room.upsert({
    where: { defaultEventId: event.id },
    create: { defaultEventId: event.id, checker: checkerNik || event.groups[0]?.pic || null, name, startDate: event.startDate, finishDate: event.finishDate, file: null },
    update: { name, startDate: event.startDate, finishDate: event.finishDate, deletedAt: null },
    select: { id: true },
  });
  await db.attendance.upsert({ where: { eventUserId: participant.id },
    create: { eventUserId: participant.id, roomId: room.id }, update: { roomId: room.id, deletedAt: null } });
  return { assigned: true, preserved: false, roomId: room.id };
}

export const assignDefaultRoom = (eventUserId, options) => prisma.$transaction(db => ensureDefaultRoom(db, eventUserId, options));
