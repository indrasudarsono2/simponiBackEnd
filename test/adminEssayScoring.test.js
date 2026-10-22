import test, { after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
const { default: prisma } = await import('../lib/prisma.js');
const { assertEssayScorer, auditAdminEssayScore } = await import('../services/essayScoringAuthority.js');
after(() => prisma.$disconnect());
const user = { nik: 'admin', branchUnitId: 1, roleNames: ['CHECKER ADMIN'] };
const score = { id: 2, groupMemberId: 4, statusId: 3, essaySubmittedAt: new Date(), appRating: { ratingId: 99 } };
const member = () => ({ member: 'applicant', userMember: { branchUnitId: 1 }, group: { event: { session: { branchUnitId: 1 } } } });
const client = m => ({ groupMember: { findFirst: async () => m } });
test('admin can score any rating in own unit without rating qualification', async () => {
  await assertEssayScorer(score, user, 'Assigned checker unavailable', client(member()));
});
test('admin list excludes self and ongoing attempts and stays in own unit', async () => {
  const { getEvent } = await import('../controller/performanceCheckController.js');
  const original = { events: prisma.event.findMany, groups: prisma.group.findMany };
  let query;
  prisma.event.findMany = async args => { query = args; return []; };
  prisma.group.findMany = async () => [];
  try {
    const res = { status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
    await getEvent({ user, query: { eventId: '2' } }, res);
    assert.equal(query.where.session.branchUnitId, 1);
    const members = query.select.groups.select.groupMembers;
    assert.equal(members.where.member.not, 'admin');
    assert.equal(members.where.userMember.branchUnitId, 1);
    assert.deepEqual(members.select.finalScores.where.essaySubmittedAt, { not: null });
    assert.equal(members.select.finalScores.where.OR[1].theorySessionParticipant.session.status, 'ENDED');
    assert.equal(query.select.groups.where.checkerGroups, undefined);
  } finally { prisma.event.findMany = original.events; prisma.group.findMany = original.groups; }
});
test('admin is denied self, cross-unit, deleted and unsubmitted or finalized attempts', async () => {
  for (const modify of [m => m.member = 'admin', m => m.userMember.branchUnitId = 2, m => m.group.event.session.branchUnitId = 2, m => m.group.deletedAt = new Date()]) {
    const m = member(); modify(m);
    await assert.rejects(assertEssayScorer(score, user, 'Assigned checker unavailable', client(m)), { status: 403 });
  }
  for (const changes of [{ essaySubmittedAt: null }, { statusId: 4 }, { isInvalidated: true }, { deletedAt: new Date() }]) {
    await assert.rejects(assertEssayScorer({ ...score, ...changes }, user, 'Assigned checker unavailable', client(member())), { status: 409 });
  }
  await assert.rejects(assertEssayScorer(score, user, '', client(member())), { status: 400 });
});
test('takeover audit preserves actual scorer, reason and exact submitted scores', async () => {
  let data;
  await auditAdminEssayScore({ essayScoringAudit: { create: async args => data = args.data } }, score, user, 'Checker unavailable', [{ essayCorrectionId: 1, score: 4 }]);
  assert.equal(data.actorNik, 'admin');
  assert.equal(data.finalScoreId, 2);
  assert.equal(data.reason, 'Checker unavailable');
  assert.deepEqual(data.scores, [{ essayCorrectionId: 1, score: 4 }]);
});

test('actual scoring controller atomically claims pending score and audits admin without changing checker assignment', async () => {
  const { postEssayAnswer } = await import('../controller/performanceCheckController.js');
  const original = { find: prisma.finalScore.findUnique, member: prisma.groupMember.findFirst, transaction: prisma.$transaction };
  const stored = { ...score, groupMember: { groupId: 10, group: { checkerGroups: [], event: { sector: { branchUnitId: 1 } } } },
    configurationVersion: { snapshot: { eventQuestions: [{ kindOfQuestionId: 1, persentage: 0.5 }] } },
    essayCorrections: [{ id: 7, essay: { value: 10 } }] };
  let claimCount = 1, writes = [], audit;
  prisma.finalScore.findUnique = async () => stored;
  prisma.groupMember.findFirst = async () => member();
  prisma.$transaction = async fn => fn({
    groupMember: { findFirst: async () => member() },
    finalScore: { updateMany: async args => { assert.equal(args.where.statusId, 3); return { count: claimCount }; }, findUnique: async () => ({ appRatingId: 5 }) },
    essayCorrection: { update: async args => writes.push(args) },
    appRating: { update: async () => {} },
    essayScoringAudit: { create: async args => audit = args.data },
  });
  const response = () => ({ status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } });
  const request = { user, body: { finalScoreId: 2, takeoverReason: 'Assigned checker unavailable', essayCorrection: [{ essayCorrectionId: 7, score: 8 }] } };
  try {
    const res = response(); await postEssayAnswer(request, res);
    assert.equal(res.code, 200); assert.equal(writes[0].data.checker, 'admin'); assert.equal(audit.actorNik, 'admin');
    writes = []; audit = null; claimCount = 0;
    const conflict = response(); await postEssayAnswer(request, conflict);
    assert.equal(conflict.code, 409); assert.equal(writes.length, 0); assert.equal(audit, null);
    stored.essaySubmittedAt = null;
    const ongoing = response(); await postEssayAnswer(request, ongoing);
    assert.equal(ongoing.code, 409); assert.equal(writes.length, 0);
  } finally {
    prisma.finalScore.findUnique = original.find;
    prisma.groupMember.findFirst = original.member;
    prisma.$transaction = original.transaction;
  }
});
