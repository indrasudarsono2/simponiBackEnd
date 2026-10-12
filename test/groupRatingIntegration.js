// Development-only integration test. ALL fixture writes are rolled back.
import assert from 'node:assert/strict';
import prisma from '../lib/prisma.js';
import { addGroup, updateGroup } from '../controller/groupAssignmentController.js';
import { postEssayAnswer } from '../controller/performanceCheckController.js';
import { getPractical, putPractical } from '../controller/practicalExamController.js';
import { putRatingLicense } from '../controller/practicalLicenseController.js';
import { getApplicationAssignment } from '../services/groupRatingPolicy.js';

const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '::1'].includes(url.hostname), 'Local development only');
const rollback = new Error('ROLLBACK_TEST_FIXTURES');
const realTransaction = prisma.$transaction.bind(prisma);
const models = ['event', 'user', 'eventUser', 'group', 'groupMember', 'checkerGroup', 'groupAssignmentAudit', 'practicalTest', 'appRating', 'applicationDoc', 'finalScore', 'status', 'license', 'userRating', 'certificate', 'essayCorrection', 'theorySessionParticipant'];
const originals = Object.fromEntries(models.map(model => [model, prisma[model]]));
const res = () => ({ code: 200, body: null, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } });
const check = (response, expected, label) => { assert.equal(response.code, expected, `${label}: ${response.body?.message || JSON.stringify(response.body)}`); console.log(`${label}: HTTP ${expected}`); };
try {
  await realTransaction(async tx => {
    for (const model of models) prisma[model] = tx[model];
    prisma.$transaction = async callback => callback(tx);
    const sectorRating = await tx.subBranchUnitRating.findFirst({ where: { deletedAt: null, ratingId: { not: null }, sector: { deletedAt: null, branchUnitId: { not: null } } }, include: { sector: true } });
    assert.ok(sectorRating, 'Need a configured development rating');
    const branchUnitId = sectorRating.sector.branchUnitId;
    const sectorId = sectorRating.sectorId;
    const ratingId = sectorRating.ratingId;
    const session = await tx.session.findFirst({ where: { branchUnitId, deletedAt: null } });
    const role = await tx.roles.findFirst({ where: { role: 'CHECKER', deletedAt: null } });
    const remark = await tx.remarkDoc.findFirst({ where: { remark: 'PENERBITAN', deletedAt: null } });
    const waiting = await tx.status.findFirst({ where: { status: 'WAITING PRACTICAL' } });
    assert.ok(session && role && remark && waiting);
    const suffix = Date.now().toString();
    const [pic, checker, examinee, outsider] = ['pic', 'checker', 'member', 'outsider'].map(n => `test-group-${n}-${suffix}`);
    for (const nik of [pic, checker, examinee, outsider]) {
      await tx.user.create({ data: { nik, name: nik, branchUnitId, sectorId,
        ...(nik === examinee ? {} : { userRoles: { create: { roleId: role.id, checkerRatings: { create: { ratingId } } } } }) } });
    }
    const event = await tx.event.create({ data: { event: 'ROLLBACK-ONLY GROUP TEST', sessionId: session.id, sectorId, remarkDocId: remark.id,
      passingGrade: 75, practicalPassingGrade: 75, isPractical: true, isSimulator: true, forExpiredDate: new Date('2027-12-31T00:00:00Z') } });
    const eventUser = await tx.eventUser.create({ data: { eventId: event.id, userNik: examinee } });
    const admin = { nik: pic, branchUnitId };
    const body = { eventId: event.id, group: 'Two qualified issuance checkers', pic, ratingIds: [ratingId], assignments: [{ checker: pic, ratingId }, { checker, ratingId }], members: [examinee] };
    let response = res();
    await addGroup({ params: {}, user: admin, body: { ...body, assignments: [body.assignments[0]] } }, response);
    check(response, 400, 'PENERBITAN rejects missing additional checker');
    response = res(); await addGroup({ params: {}, user: admin, body }, response); check(response, 201, 'Create issuance group');
    const groupId = response.body.id;
    const group = await tx.group.findUnique({ where: { id: groupId }, include: { checkerGroups: { include: { ratingAssignments: true } }, groupMembers: true } });
    assert.equal(group.checkerGroups.length, 2);
    const member = group.groupMembers[0];
    const context = await getApplicationAssignment(tx, { eventId: event.id, memberNik: examinee, branchUnitId, ratings: [{ rating: { id: ratingId } }], groupMemberId: member.id });
    assert.equal(context.checkersByRating.get(ratingId).length, 2);
    const doc = await tx.applicationDoc.create({ data: { eventUserId: eventUser.id, userNik: examinee, statusId: 2, number: 'ROLLBACK-TEST' } });
    const rating = await tx.appRating.create({ data: { applicationDocId: doc.id, ratingId, statusId: 3 } });
    const essay = await tx.essay.create({ data: { branchUnitId, question: 'Test essay', value: 10 } });
    const score = await tx.finalScore.create({ data: { eventId: event.id, appRatingId: rating.id, groupMemberId: member.id, statusId: 3, essayScore: 0, finalScore: 0 } });
    const answer = await tx.essayCorrection.create({ data: { finalScoreId: score.id, appRatingId: rating.id, groupMemberId: member.id, essayId: essay.id, answer: 'Test answer' } });
    response = res(); await postEssayAnswer({ user: { nik: checker, branchUnitId }, body: { finalScoreId: score.id, persentage: 0.5, essayCorrection: [{ essayCorrectionId: answer.id, score: 8 }] } }, response);
    check(response, 200, 'Additional checker can complete issuance essay');
    response = res(); await postEssayAnswer({ user: admin, body: { finalScoreId: score.id, persentage: 0.5, essayCorrection: [{ essayCorrectionId: answer.id, score: 9 }] } }, response);
    assert.ok([403, 409].includes(response.code), 'A second checker must not overwrite completed essay scoring');
    await tx.finalScore.update({ where: { id: score.id }, data: { statusId: waiting.id, finalScore: 85 } });
    await tx.appRating.update({ where: { id: rating.id }, data: { statusId: waiting.id } });
    const tests = [];
    for (const cg of group.checkerGroups) for (const kindOfPracticalId of [1, 2]) tests.push(await tx.practicalTest.create({ data: { checkerGroupId: cg.id, groupMemberId: member.id, appRatingId: rating.id, kindOfPracticalId } }));
    const own = tests.find(t => t.checkerGroupId === group.checkerGroups.find(c => c.checker === checker).id);
    const request = (nik, id, mark = 85) => ({ params: { id: String(id) }, user: { nik, branchUnitId }, body: { score: String(mark), confirmBelowPassingGrade: 'true' }, files: [{ fieldname: 'evaluationFile', mimetype: 'application/pdf', originalname: 'sheet.pdf', filename: 'rollback-test-sheet.pdf' }] });
    response = res(); await putPractical(request(outsider, own.id), response); check(response, 403, 'Unassigned qualified checker denied');
    response = res(); await putPractical(request(pic, own.id), response); check(response, 403, 'PIC cannot score another checker assessment');
    response = res(); await putPractical(request(checker, own.id), response); check(response, 200, 'Checker scores own practical without license');
    assert.equal(response.body.overallStatus, 'WAITING PRACTICAL');
    response = res(); await getPractical({ user: { nik: checker, branchUnitId }, query: { eventId: String(event.id) } }, response); check(response, 200, 'Additional checker practical page');
    const visible = response.body.applicationDoc[0].appRatings[0].practicalTests;
    assert.equal(visible.length, 2);
    assert.ok(visible.every(t => t.canScore && !t.canSendLicense && !t.canUploadLicense));
    response = res(); await putRatingLicense({ params: { id: String(own.id) }, user: { nik: checker, branchUnitId }, files: [{ fieldname: 'licenseFile', mimetype: 'application/pdf', originalname: 'license.pdf', filename: 'rollback-test-license.pdf' }] }, response); check(response, 403, 'Non-PIC license upload denied');
    response = res(); await putRatingLicense({ params: { id: String(own.id) }, user: admin, files: [{ fieldname: 'licenseFile', mimetype: 'application/pdf', originalname: 'license.pdf', filename: 'rollback-test-license.pdf' }] }, response); check(response, 200, 'PIC license upload independent of assessment');
    response = res(); await updateGroup({ params: { id: String(groupId) }, user: admin, body }, response); check(response, 409, 'Assignments locked after application submission');
    response = res(); await putPractical(request(checker, own.id, 70), response); check(response, 200, 'One below-grade assessment fails immediately');
    assert.equal(response.body.overallStatus, 'FAILED');
    for (const test of tests) {
      const nik = group.checkerGroups.find(c => c.id === test.checkerGroupId).checker;
      response = res(); await putPractical(request(nik, test.id, 85), response); check(response, 200, 'Complete individual practical assessment');
    }
    assert.equal(response.body.overallStatus, 'SUCCESS');
    assert.equal(await tx.certificate.count({ where: { finalScoreId: score.id, status: 'VALID' } }), 1);
    assert.ok(await tx.groupAssignmentAudit.count({ where: { groupId } }) >= 5);
    throw rollback;
  }, { timeout: 60000, maxWait: 10000 });
} catch (error) {
  if (error !== rollback) throw error;
  console.log('Integration passed; every fixture write rolled back. No uploads or e-chain calls were made.');
} finally {
  for (const model of models) prisma[model] = originals[model];
  prisma.$transaction = realTransaction;
  await prisma.$disconnect();
}
