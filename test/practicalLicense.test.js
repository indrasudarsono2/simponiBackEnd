import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-jwt-secret-that-is-longer-than-32-characters';
process.env.FILE_URL_SECRET = 'test-file-secret-that-is-longer-than-32-characters';
const { buildPracticalExamEchainPayload, buildPracticalRecheckEchainPayload } =
  await import('../controller/practicalExamController.js');

const rating = {
  rating: { rating: 'APP' },
  practicalLicense: { file: '/uploads/license/license-new.pdf', expiredDate: new Date('2027-12-31T00:00:00Z') },
  applicationDoc: { user: {}, eventUser: { event: { forExpiredDate: new Date('2027-12-31T00:00:00Z') } } },
  finalScores: [],
};
const practical = { file: '/uploads/practicalTest/evaluation-live.pdf', updatedAt: new Date('2026-10-02T00:00:00Z'), appRating: rating };
const normal = buildPracticalExamEchainPayload(practical, 'http://localhost:44441');
assert.equal(normal.file.fileName, 'license-new.pdf');
assert.match(normal.file.fileUrl, /\/license\/license-new\.pdf$/);
assert.doesNotMatch(JSON.stringify(normal), /evaluation-live\.pdf/);

const recheck = { file: '/uploads/practicalTest/evaluation-recheck.pdf', updatedAt: new Date('2026-10-02T00:00:00Z'),
  authorization: { appRating: rating } };
const repeated = buildPracticalRecheckEchainPayload(recheck, 'http://localhost:44441');
assert.equal(repeated.file.fileName, 'license-new.pdf');
assert.doesNotMatch(JSON.stringify(repeated), /evaluation-recheck\.pdf/);
console.log('Practical license e-chain payload tests passed.');
