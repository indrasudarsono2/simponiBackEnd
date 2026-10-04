import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultRoom, defaultRoomDatesAreValid, roomRecoveryWhere } from '../services/defaultModeOneRoom.js';

const participant = { id: 7, event: { id: 3, event: 'Test', startDate: new Date('2026-10-01'), finishDate: new Date('2026-11-01'), groups: [] } };
function database(value) {
  const writes = [];
  return { writes, eventUser: { update: async () => {}, findFirst: async () => value }, event: { update: async () => {} }, room: { upsert: async args => { writes.push(args); return { id: 9 }; } }, attendance: { upsert: async args => { writes.push(args); } } };
}
test('ineligible or Mode 2 participants receive no room', async () => {
  const db = database(null);
  assert.equal((await ensureDefaultRoom(db, 7)).assigned, false);
  assert.equal(db.writes.length, 0);
});
test('existing active manual assignment is preserved', async () => {
  const db = database({ ...participant, attendaces: { roomId: 4, room: { defaultEventId: null } } });
  assert.equal((await ensureDefaultRoom(db, 7)).roomId, 4);
  assert.equal(db.writes.length, 0);
});
test('default room belongs uniquely to the event and uses event dates', async () => {
  const db = database(participant);
  assert.equal((await ensureDefaultRoom(db, 7, { now: new Date('2026-10-04') })).assigned, true);
  assert.deepEqual(db.writes[0].where, { defaultEventId: 3 });
  assert.equal(db.writes[0].create.startDate, participant.event.startDate);
  assert.equal(db.writes[1].update.roomId, 9);
});
test('invalid and expired schedules cannot authorize access', async () => {
  assert.equal(defaultRoomDatesAreValid({ startDate: null, finishDate: null }), false);
  const db = database(participant);
  assert.equal((await ensureDefaultRoom(db, 7, { now: new Date('2027-01-01') })).assigned, false);
  assert.equal(db.writes.length, 0);
});
test('recovery query is branch-unit scoped and Mode 1 only', () => {
  const where = roomRecoveryWhere(17);
  assert.equal(where.event.is.theoryMode, 'MODE_1');
  assert.equal(where.event.is.sector.is.branchUnitId, 17);
  assert.equal(where.applicationDocs.some.verifications.is.isValid, true);
});
