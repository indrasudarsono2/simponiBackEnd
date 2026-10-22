import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMultipleChoiceReset, deleteAttemptQuestionAnswers } from '../services/checkerExamReset.js';
const now = new Date('2026-10-16T12:00:00Z');
test('permanent deletion is limited to selected attempt and selected parts', async () => {
  const calls = [];
  const tx = { essayCorrection: { deleteMany: async args => calls.push(['essay', args]) }, multipleChoiceCorrection: { deleteMany: async args => calls.push(['mc', args]) } };
  await deleteAttemptQuestionAnswers(tx, 7);
  assert.deepEqual(calls, [['mc', { where: { finalScoreId: 7 } }]]);
  calls.length = 0;
  await deleteAttemptQuestionAnswers(tx, 8, true);
  assert.deepEqual(calls, [['essay', { where: { finalScoreId: 8 } }], ['mc', { where: { finalScoreId: 8 } }]]);
});
const fixture = () => ({ finalScores: [{ id: 7, essaySubmittedAt: new Date('2026-10-16T08:00:00Z'), essayScore: 40, status: { status: 'FAILED' } }], modeOneExamDrafts: [{ kind: 'MULTIPLE_CHOICE', deadlineAt: new Date('2026-10-16T10:00:00Z'), submittedAt: new Date('2026-10-16T10:00:01Z') }] });
test('timed-out multiple choice can preserve a scored essay', () => {
  assert.equal(assessMultipleChoiceReset(fixture(), now).canResetMultipleChoice, true);
});
test('manual early submission, live exams, and unscored essays are excluded', () => {
  const manual = fixture(); manual.modeOneExamDrafts[0].submittedAt = new Date('2026-10-16T09:00:00Z');
  assert.equal(assessMultipleChoiceReset(manual, now).canResetMultipleChoice, false);
  const live = fixture(); live.modeOneExamDrafts[0].deadlineAt = new Date('2026-10-16T13:00:00Z');
  assert.equal(assessMultipleChoiceReset(live, now).canResetMultipleChoice, false);
  const pending = fixture(); pending.finalScores[0].status.status = 'CHECKING ESSAY';
  assert.equal(assessMultipleChoiceReset(pending, now).canResetMultipleChoice, false);
});
test('passed results and active submission claims cannot be reset', () => {
  const passed = fixture(); passed.finalScores[0].status.status = 'WAITING PRACTICAL';
  assert.equal(assessMultipleChoiceReset(passed, now).canResetMultipleChoice, false);
  const busy = fixture(); busy.modeOneExamDrafts[0].processingAt = now;
  assert.equal(assessMultipleChoiceReset(busy, now).canResetMultipleChoice, false);
});
