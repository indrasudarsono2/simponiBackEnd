import assert from 'node:assert/strict';
import { assessCheckerReset } from '../services/checkerExamReset.js';

const draft = (createdAt, processingAt = null) => ({ createdAt, deadlineAt: new Date('2026-10-02T01:30:00Z'), submittedAt: null, processingAt });
const score = (id, status, updatedAt) => ({ id, status: { status }, updatedAt: new Date(updatedAt) });

const first = assessCheckerReset({ finalScores: [], modeOneExamDrafts: [draft('2026-10-02T01:00:00Z')] });
assert.equal(first.canReset, true);
assert.equal(first.attemptNumber, 1);
assert.equal(first.partialFinalScoreId, null);

const second = assessCheckerReset({ finalScores: [score(1, 'FAILED', '2026-10-01T23:00:00Z')],
  modeOneExamDrafts: [draft('2026-10-02T01:00:00Z')] });
assert.equal(second.canReset, true);
assert.equal(second.attemptNumber, 2);
assert.equal(second.priorFailures, 1);

const partial = assessCheckerReset({ finalScores: [score(2, 'CHECKING ESSAY', '2026-10-02T01:00:00Z')], modeOneExamDrafts: [] });
assert.equal(partial.canReset, true);
assert.equal(partial.partialFinalScoreId, 2);

assert.equal(assessCheckerReset({ finalScores: [], modeOneExamDrafts: [] }).canReset, false);
assert.equal(assessCheckerReset({ finalScores: [score(3, 'SUCCESS', '2026-10-02T01:00:00Z')], modeOneExamDrafts: [] }).canReset, false);
console.log('Checker examination reset eligibility tests passed.');
