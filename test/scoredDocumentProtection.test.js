import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDocumentDeletable } from '../services/scoredDocumentProtection.js';

for (const [type, field] of Object.entries({ application: 'id', medex: 'medexId', ielp: 'ielpId', license: 'licenseId', logbook: 'logbookUserId' })) {
  test(`${type}: scored evidence blocks deletion, including archived attempts`, async () => {
    let where;
    const db = { applicationDoc: { findFirst: async args => { where = args.where; return { id: 2 }; } } };
    await assert.rejects(assertDocumentDeletable(type, 7, db), error => error.status === 409);
    if (type === 'license') {
      assert.equal(where.OR[0].licenseId, 7);
      assert.equal(where.OR[1].appRatings.some.practicalLicenseId, 7);
    } else assert.equal(where[field], 7);
    if (type === 'medex' || type === 'ielp') assert.equal('appRatings' in where, false);
    else assert.deepEqual(where.appRatings.some.finalScores, { some: {} });
    assert.equal('deletedAt' in where, false);
  });
}
test('unscored document can be deleted', async () => {
  await assertDocumentDeletable('license', 7, { applicationDoc: { findFirst: async () => null } });
});
test('started unscored attempts also block document deletion',async()=>{
 let calls=0,where;
 await assert.rejects(assertDocumentDeletable('application',7,{applicationDoc:{findFirst:async args=>{where=args.where;return ++calls===1?null:{id:7};}}}),error=>error.status===409&&error.message.includes('started examination'));
 assert.equal(where.AND[0].id,7);
 assert.equal(where.AND[1].OR[0].appRatings.some.OR[0].modeOneExamDrafts.some.submittedAt,null);
});
test('legacy competence retention follows applicant and rating', async () => {
  let where;
  const db = { competence: { findUnique: async () => ({ userId: 'owner', ratingId: 3 }) }, applicationDoc: { findFirst: async args => { where = args.where; return { id: 1 }; } } };
  await assert.rejects(assertDocumentDeletable('competence', 2, db), error => error.status === 409);
  assert.equal(where.userNik, 'owner');
  assert.equal(where.appRatings.some.ratingId, 3);
});
