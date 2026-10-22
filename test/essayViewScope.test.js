import test from 'node:test';
import assert from 'node:assert/strict';
import { essayViewUser } from '../services/essayViewScope.js';
const dual = { nik: 'test', roleNames: ['CHECKER', 'CHECKER ADMIN'] };
test('dual-role checker defaults to assigned scope', () => {
  assert.deepEqual(essayViewUser({ user: dual, query: {} }).roleNames, ['CHECKER']);
  assert.equal(dual.roleNames.length, 2);
});
test('checker selection narrows list and scoring authority', () => {
  assert.deepEqual(essayViewUser({ user: dual, query: { scope: 'checker' } }).roleNames, ['CHECKER']);
  assert.deepEqual(essayViewUser({ user: dual, method: 'POST', body: { scope: 'checker' } }).roleNames, ['CHECKER']);
});
test('explicit admin scope preserves authorized takeover', () => {
  assert.equal(essayViewUser({ user: dual, query: { scope: 'admin' } }), dual);
});
test('ordinary checker cannot request admin scope', () => {
  assert.throws(() => essayViewUser({ user: { roleNames: ['CHECKER'] }, query: { scope: 'admin' } }), error => error.status === 403);
});
