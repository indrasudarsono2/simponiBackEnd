import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCorrections, load } from '../controller/branchQuestionMonitorController.js';

test('essay averages exclude unscored answers and normalize maximum marks', () => {
  const essay = { id: 1, question: 'Test', version: 1, value: 20 };
  const result = summarizeCorrections([{ essay, score: 10, checker: 'x' }, { essay, score: 20, checker: 'y' }, { essay, score: null, checker: 'x' }, { essay, score: 12, checker: null }], 'ESSAY');
  assert.equal(result[0].averageScore, 15);
  assert.equal(result[0].averagePercentage, 75);
  assert.equal(result[0].total, 2);
  assert.equal(JSON.stringify(result).includes('checker'), false);
});
test('multiple choice returns distributions and no answer keys', () => {
  const multipleChoice = { id: 3, question: 'Test', version: 1 };
  const [item] = summarizeCorrections([{ multipleChoice, isTrue: true, answer: 'A' }, { multipleChoice, isTrue: false, answer: 'B' }], 'MULTIPLE_CHOICE');
  assert.equal(item.percentageTrue, 50);
  assert.deepEqual(item.answerSummary, { A: 1, B: 1, C: 0, D: 0 });
  assert.equal('key' in item, false);
});
test('invalid scope is rejected before queries', async () => {
  let status;
  await load({ body: {} }, { status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 400);
});
test('branch multiple-choice statistics exclude MATS questions', () => {
  const result = summarizeCorrections([
    { multipleChoice: { id: 1, question: 'Regular', isMats: false }, isTrue: true, answer: 'A' },
    { multipleChoice: { id: 2, question: 'MATS', isMats: true }, isTrue: false, answer: 'B' },
  ], 'MULTIPLE_CHOICE');
  assert.deepEqual(result.map(item => item.id), [1]);
  assert.equal(result[0].total, 1);
});
