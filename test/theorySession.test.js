import assert from 'node:assert/strict';
import { test } from 'node:test';
import { theoryClockPayload, theoryRemainingMs } from '../services/theorySessionService.js';

const at = (value) => new Date(`2026-09-25T00:00:${String(value).padStart(2, '0')}.000Z`);

test('running clock is derived from the server resume time', () => {
  const session = { id: 1, eventId: 3, name: 'Morning', status: 'RUNNING', remainingSeconds: 120, resumedAt: at(0) };
  assert.equal(theoryRemainingMs(session, at(30)), 90_000);
  assert.equal(theoryClockPayload(session, at(30)).remainingMs, 90_000);
});

test('paused clock does not lose time and resumed clock continues from the remainder', () => {
  const paused = { status: 'PAUSED', remainingSeconds: 90, resumedAt: null };
  assert.equal(theoryRemainingMs(paused, at(50)), 90_000);
  const resumed = { ...paused, status: 'RUNNING', resumedAt: at(40) };
  assert.equal(theoryRemainingMs(resumed, at(50)), 80_000);
});

test('late entry sees the same shared remainder, never a new duration', () => {
  const session = { status: 'RUNNING', durationSeconds: 7200, remainingSeconds: 7200, resumedAt: at(0) };
  assert.equal(theoryRemainingMs(session, at(30)), 7_170_000);
});

test('ended session cannot regain time', () => {
  assert.equal(theoryRemainingMs({ status: 'ENDED', remainingSeconds: 120 }, at(0)), 0);
});
