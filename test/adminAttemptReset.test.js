import test from 'node:test';
import assert from 'node:assert/strict';
import { findAssignedResetMember, findMemberRatings } from '../services/checkerExamReset.js';
const fixture = () => ({ id: 9, groupId: 2, member: 'examinee', userMember: { name: 'Example' }, group: { eventId: 3, event: { sector: { branchUnitId: 1 }, eventQuestions: [{ kindOfQuestionId: 1 }] } } });
test('Checker Admin can access same-unit members without checker assignment', async () => {
  let where;
  const member = await findAssignedResetMember({ nik: 'admin', branchUnitId: 1, roleNames: ['CHECKER ADMIN'] }, 9, { groupMember: { findFirst: async args => { where=args.where; return fixture(); } } });
  assert.equal(where.group.is.checkerGroups, undefined);
  assert.equal(where.userMember.is.branchUnitId, 1);
  assert.equal(member.resetAuthority, 'CHECKER ADMIN');
  const ratings = await findMemberRatings(member, { appRating: { findMany: async () => [{ id: 4 }, { id: 5 }] } });
  assert.equal(ratings.length, 2);
});
test('ordinary checker remains assignment restricted', async () => {
  let where;
  const member = await findAssignedResetMember({ nik: 'checker', branchUnitId: 1, roleNames: ['CHECKER'] }, 9, { groupMember: { findFirst: async args => { where=args.where; return fixture(); } } });
  assert.equal(where.group.is.checkerGroups.some.checker, 'checker');
  assert.equal(member.requestingCheckerNik, 'checker');
});
test('admin cannot reset self or another branch unit', async () => {
  const db = { groupMember: { findFirst: async () => fixture() } };
  assert.equal(await findAssignedResetMember({ nik: 'examinee', branchUnitId: 1, roleNames: ['CHECKER ADMIN'] },9,db),null);
  assert.equal(await findAssignedResetMember({ nik: 'admin', branchUnitId: 2, roleNames: ['CHECKER ADMIN'] },9,db),null);
});
