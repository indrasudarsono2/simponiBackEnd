import test from 'node:test';
import assert from 'node:assert/strict';
import { examinationActivity } from '../services/examinationActivity.js';
const now = new Date('2026-10-16T04:00:00Z');
test('branch-scoped unfinished attempts distinguish overdue and paused without selecting answers', async () => {
  let countCalls = 0;
  const client = {
    modeOneExamDraft: {
      count: async () => ++countCalls === 1 ? 2 : 1,
      findMany: async q => {
        assert.equal(q.where.submittedAt, null);
        assert.equal(q.where.appRating.applicationDoc.user.branchUnitId, 7);
        assert.equal(q.where.appRating.applicationDoc.eventUser.event.sector.branchUnitId, 7);
        assert.equal(q.select.answers, undefined); assert.equal(q.select.questionSnapshot, undefined);
        return [{ id: 1, ownerNik: 'one', kind: 'ESSAY', deadlineAt: new Date(now.getTime() + 1000) }, { id: 2, ownerNik: 'two', kind: 'ESSAY', deadlineAt: now }];
      },
    },
    theorySessionParticipant: {
      count: async () => 2,
      findMany: async q => {
        assert.equal(q.where.finalizedAt, null);
        assert.equal(q.where.eventUser.user.branchUnitId, 7);
        assert.equal(q.where.eventUser.event.sector.branchUnitId, 7);
        assert.equal(q.select.essayAnswers, undefined);
        return ['RUNNING', 'PAUSED'].map((status, i) => ({ id: i, eventUser: { userNik: 'mode2' }, session: { status, remainingSeconds: 60, resumedAt: new Date(now.getTime() - 10000) } }));
      },
    },
  };
  const result = await examinationActivity(client, 7, now);
  assert.equal(result.total, 4); assert.equal(result.overdueMode1Count, 1);
  assert.deepEqual(result.attempts.map(a => a.status), ['IN_PROGRESS', 'OVERDUE', 'IN_PROGRESS', 'PAUSED']);
  assert.equal(result.attempts[2].deadline.toISOString(), '2026-10-16T04:00:50.000Z');
  assert.equal(result.attempts[3].deadline, null);
  assert.equal(JSON.stringify(result).includes('answers'), false);
});
test('missing unit fails closed without database access', async () => {
  for (const unit of [undefined, null, 0, -1, 1.2]) await assert.rejects(examinationActivity({}, unit), { status: 403 });
});
