import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'verification-test-secret-longer-than-32-characters';
const { default: prisma } = await import('../lib/prisma.js');
const { getVerification } = await import('../controller/verificationController.js');
after(async () => prisma.$disconnect());

test('verification excludes deleted checker assignments while retaining checker IDs and scope', async () => {
  const originalGroup = prisma.group.findMany;
  const originalEvent = prisma.event.findFirst;
  let selection;
  prisma.event.findFirst = async () => ({ sector: { subBranchUnitRatings: [{ ratingId: 1 }] } });
  prisma.group.findMany = async args => {
    if (!args.select.checkerGroups) return [];
    selection = args;
    return [{ id: 10, checkerGroups: [{ id: 22, userChecker: { nik: '10011443', name: 'Checker' } }] }];
  };
  try {
    for (const roleNames of [['CHECKER ADMIN'], ['CHECKER']]) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await getVerification({ user: { nik: 'pic', branchUnitId: 1, roleNames }, body: { eventId: 2 } }, res);
      assert.equal(res.code, undefined);
      assert.deepEqual(selection.select.checkerGroups.where, { deletedAt: null });
      assert.equal(selection.select.checkerGroups.select.id, true);
      assert.equal(selection.where.deletedAt, null);
      assert.equal(selection.where.pic, roleNames[0] === 'CHECKER' ? 'pic' : undefined);
      assert.equal(res.body[0].checkerGroups[0].id, 22);
    }
  } finally {
    prisma.group.findMany = originalGroup;
    prisma.event.findFirst = originalEvent;
  }
});
