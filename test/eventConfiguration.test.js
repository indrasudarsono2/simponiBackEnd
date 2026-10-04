import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../lib/prisma.js';
import { configurationIssues, captureConfiguration, getExamConfiguration, ratingConfiguration } from '../services/eventConfiguration.js';
import { getQuestionConfiguration, finalizeQuestionConfiguration } from '../controller/eventController.js';

const fixture = () => ({
  id: 1, event: 'Audit event', theoryMode: 'MODE_1', difficulty: 'HARD',
  eventQuestions: [
    { id: 1, kindOfQuestionId: 1, quantity: 2, persentage: 0.5, minutes: 30 },
    { id: 2, kindOfQuestionId: 2, quantity: 3, persentage: 0.5, minutes: 60 },
  ],
  sector: { id: 4, sector: 'APP', subBranchUnitRatings: [{ id: 1, ratingId: 2, rating: { rating: 'APP' }, questionGroups: [
    { id: 10, group: 'Essay', kindOfQuestionId: 1, quantity: 2, mandatoryRating: null },
    { id: 11, group: 'MC', kindOfQuestionId: 2, quantity: 3, mandatoryRating: { mandatoryItemId: 5 } },
  ] }] },
  mats: { mode: 'CATEGORY_PORTION', quantity: 0, allocations: [{ mandatoryItemId: 5, quantity: 1 }] },
});
function fakeDatabase() {
  const live = fixture();
  const versions = [];
  let started = false;
  const db = {
    event: {
      update: async () => ({ id: 1 }),
      findFirst: async () => structuredClone(live),
      findUnique: async () => ({ sectorId: live.sector.id, theoryMode: live.theoryMode, difficulty: live.difficulty, eventQuestions: structuredClone(live.eventQuestions) }),
    },
    eventConfigurationVersion: {
      findFirst: async ({ where }) => [...versions].reverse().find(v => where.lockedAt ? v.lockedAt : true) || null,
      create: async ({ data }) => { const v = { id: versions.length + 1, createdAt: new Date(), ...structuredClone(data) }; versions.push(v); return v; },
      update: async ({ where, data }) => Object.assign(versions.find(v => v.id === where.id), data),
    },
    modeOneExamDraft: { findFirst: async () => started ? { id: 1 } : null },
    theorySessionParticipant: { findFirst: async () => null }, finalScore: { findFirst: async () => null }, monitorTime: { findFirst: async () => null },
    matsConfiguration: { findUnique: async () => structuredClone(live.mats) },
    matsCategoryAllocation: { findMany: async () => structuredClone(live.mats.allocations) },
    mandatoryRating: { findMany: async () => [{ ratingId: 2, mandatoryItemId: 5 }] },
    user: { findUnique: async () => ({ name: 'Examinee' }) },
  };
  const original = prisma.$transaction;
  let queue = Promise.resolve();
  prisma.$transaction = callback => {
    const result = queue.then(() => callback(db));
    queue = result.catch(() => {});
    return result;
  };
  return { live, versions, start: () => { started = true; }, restore: () => { prisma.$transaction = original; } };
}

test('validation checks each rating, durations, weights and MATS overflow', () => {
  assert.deepEqual(configurationIssues(fixture()), []);
  const invalid = fixture();
  invalid.eventQuestions[0].minutes = 0;
  invalid.eventQuestions[1].persentage = 0.3;
  invalid.mats.allocations[0].quantity = 9;
  const issues = configurationIssues(invalid).join(' ');
  assert.match(issues, /100%/);
  assert.match(issues, /duration/);
  assert.match(issues, /MATS allocation/);
  invalid.theoryMode = 'MODE_2';
  assert.doesNotMatch(configurationIssues(invalid).join(' '), /duration/);
  const mcOnly = fixture();
  mcOnly.eventQuestions = [{ ...mcOnly.eventQuestions[1], persentage: 1 }];
  assert.deepEqual(configurationIssues(mcOnly), []);
});

test('versions retain composition despite bank changes and require revision reason', async () => {
  const fake = fakeDatabase();
  try {
    const initial = await captureConfiguration({ eventId: 1, actorNik: 'admin', actorName: 'Admin' });
    fake.live.sector.subBranchUnitRatings[0].questionGroups[0].group = 'Changed name';
    await assert.rejects(captureConfiguration({ eventId: 1 }), /reason/);
    const next = await captureConfiguration({ eventId: 1, reason: 'Updated group naming' });
    assert.equal(initial.version, 1);
    assert.equal(next.version, 2);
    assert.equal(initial.snapshot.sector.subBranchUnitRatings[0].questionGroups[0].group, 'Essay');
    assert.equal(next.snapshot.sector.subBranchUnitRatings[0].questionGroups[0].group, 'Changed name');
  } finally { fake.restore(); }
});

test('examination uses saved groups/MATS and locks against further finalization', async () => {
  const fake = fakeDatabase();
  try {
    await captureConfiguration({ eventId: 1 });
    fake.live.sector.subBranchUnitRatings[0].questionGroups[1].quantity = 200;
    fake.live.mats.allocations[0].quantity = 100;
    const exam = await getExamConfiguration(1);
    assert.equal(ratingConfiguration(exam, 2).questionGroups[1].quantity, 3);
    assert.equal(exam.mats.allocations[0].quantity, 1);
    assert.equal(exam.configurationVersionId, 1);
    assert.ok(fake.versions[0].lockedAt);
    await assert.rejects(captureConfiguration({ eventId: 1, reason: 'Forbidden update' }), /locked/);
    assert.equal(fake.versions.length, 1);
  } finally { fake.restore(); }
});

test('forgotten finalization saves a validated locked version with the triggering participant', async () => {
  const fake = fakeDatabase();
  try {
    const exam = await getExamConfiguration(1, { actorNik: 'participant', trigger: 'MODE_1_ESSAY_OPEN' });
    assert.equal(exam.configurationVersionId, 1);
    assert.equal(fake.versions[0].source, 'AUTO_FINALIZED');
    assert.equal(fake.versions[0].actorNik, 'participant');
    assert.equal(fake.versions[0].actorName, 'Examinee');
    assert.match(fake.versions[0].reason, /MODE_1_ESSAY_OPEN/);
    assert.ok(fake.versions[0].lockedAt);
  } finally { fake.restore(); }
});

test('changed unlocked event settings create an automatic new version and preserve the old one', async () => {
  const fake = fakeDatabase();
  try {
    await captureConfiguration({ eventId: 1 });
    fake.live.eventQuestions[0].minutes = 90;
    const exam = await getExamConfiguration(1);
    assert.equal(exam.configurationVersion, 2);
    assert.equal(exam.eventQuestions[0].minutes, 90);
    assert.equal(fake.versions[0].snapshot.eventQuestions[0].minutes, 30);
    assert.equal(fake.versions[0].lockedAt, null);
    assert.equal(fake.versions[1].source, 'AUTO_FINALIZED');
    assert.ok(fake.versions[1].lockedAt);
  } finally { fake.restore(); }
});

test('invalid settings block automatic capture without saving a version', async () => {
  const fake = fakeDatabase();
  try {
    fake.live.eventQuestions[0].persentage = 0.2;
    await assert.rejects(getExamConfiguration(1), /Checker Admin.*100%/);
    assert.equal(fake.versions.length, 0);
  } finally { fake.restore(); }
});

test('simultaneous first access creates one automatic version reused by all participants', async () => {
  const fake = fakeDatabase();
  try {
    const exams = await Promise.all(Array.from({ length: 20 }, (_, i) => getExamConfiguration(1, { actorNik: `participant-${i}` })));
    assert.equal(fake.versions.length, 1);
    assert.equal(fake.versions[0].actorNik, 'participant-0');
    assert.ok(exams.every(exam => exam.configurationVersionId === 1));
  } finally { fake.restore(); }
});

test('unlocked legacy baselines are finalized automatically but locked baselines are preserved', async () => {
  const fake = fakeDatabase();
  try {
    await captureConfiguration({ eventId: 1, source: 'BACKFILL_CURRENT', reason: 'Current settings only' });
    const exam = await getExamConfiguration(1);
    assert.equal(exam.configurationVersion, 2);
    assert.equal(fake.versions[0].source, 'BACKFILL_CURRENT');
    assert.equal(fake.versions[1].source, 'AUTO_FINALIZED');
    fake.live.eventQuestions[0].minutes = 90;
    await assert.rejects(getExamConfiguration(1), /locked examination configuration/);
    assert.equal(fake.versions.length, 2);
  } finally { fake.restore(); }
});

test('backfill labels legacy settings, is idempotent, and cannot be revised after an attempt', async () => {
  const fake = fakeDatabase();
  try {
    fake.start();
    const first = await captureConfiguration({ eventId: 1, source: 'BACKFILL_CURRENT', reason: 'Historical configuration unknown' });
    const second = await captureConfiguration({ eventId: 1, source: 'BACKFILL_CURRENT', reason: 'Retry' });
    assert.equal(first.id, second.id);
    assert.equal(first.source, 'BACKFILL_CURRENT');
    assert.ok(first.lockedAt);
    await assert.rejects(captureConfiguration({ eventId: 1, reason: 'Change after start' }), /locked/);
  } finally { fake.restore(); }
});

test('configuration read/finalize deny cross-unit event IDs before loading snapshots', async () => {
  const original = prisma.event;
  let where;
  prisma.event = { findFirst: async args => { where = args.where; return null; } };
  try {
    for (const endpoint of [getQuestionConfiguration, finalizeQuestionConfiguration]) {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
      await endpoint({ params: { id: '1' }, body: {}, user: { nik: 'admin', branchUnitId: 8, roleNames: ['CHECKER ADMIN'] } }, res);
      assert.equal(res.code, 404);
      assert.equal(where.sector.branchUnitId, 8);
    }
  } finally { prisma.event = original; }
});

test('finalization endpoint records the authenticated actor and returns the saved version', async () => {
  const fake = fakeDatabase();
  const originalEvent = prisma.event;
  const originalUser = prisma.user;
  prisma.event = { findFirst: async () => ({ id: 1 }) };
  prisma.user = { findUnique: async () => ({ name: 'Authenticated Admin' }) };
  try {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await finalizeQuestionConfiguration({ params: { id: '1' }, body: { actorNik: 'spoofed', reason: 'Ready for examination' }, user: { nik: 'actual-admin', branchUnitId: 8, roleNames: ['CHECKER ADMIN'] } }, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.version, 1);
    assert.equal(fake.versions[0].actorNik, 'actual-admin');
    assert.equal(fake.versions[0].actorName, 'Authenticated Admin');
    assert.equal(fake.versions[0].source, 'FINALIZED');
  } finally { prisma.event = originalEvent; prisma.user = originalUser; fake.restore(); }
});
