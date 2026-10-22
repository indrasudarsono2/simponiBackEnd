import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { requireApplicationLogbook } from '../services/applicationLogbook.js';
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
const { default: prisma } = await import('../lib/prisma.js');
const { addApplicationDoc, getApplicationDocById } = await import('../controller/applicationDocumentController.js');
after(() => prisma.$disconnect());

test('requires own active logbook with a nonblank attached file', async () => {
  for (const record of [null, { id: 126, file: null }, { id: 126, file: '' }, { id: 126, file: '  ' }]) {
    await assert.rejects(requireApplicationLogbook({ logBookUser: { findFirst: async args => {
      assert.deepEqual(args.where, { id: 126, userNik: 'owner', deletedAt: null });
      return record;
    } } }, 126, 'owner'), { status: 422 });
  }
  const record = { id: 126, file: '/uploads/logbook/valid.pdf' };
  assert.equal(await requireApplicationLogbook({ logBookUser: { findFirst: async () => record } }, '126', 'owner'), record);
});
test('malformed or missing IDs are rejected without querying records', async () => {
  for (const id of [undefined, null, '', 'wrong', 0, -1, 1.5]) {
    await assert.rejects(requireApplicationLogbook({ logBookUser: { findFirst: async () => assert.fail('must not query') } }, id, 'owner'), { status: 422 });
  }
});
test('both create and update controllers reject fileless logbook before application writes', async () => {
  const originalLog = prisma.logBookUser.findFirst;
  const originalDoc = prisma.applicationDoc.findFirst;
  prisma.logBookUser.findFirst = async () => ({ id: 126, file: null });
  prisma.applicationDoc.findFirst = async () => ({ id: 63, appRatings: [], verifications: null });
  try {
    for (const handler of [addApplicationDoc, getApplicationDocById]) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ params: { id: '63' }, user: { nik: 'owner' }, body: { logbookUserId: 126 } }, res);
      assert.equal(res.code, 422);
      assert.match(res.body.message, /logbook.*uploaded file/);
    }
  } finally {
    prisma.logBookUser.findFirst = originalLog;
    prisma.applicationDoc.findFirst = originalDoc;
  }
});
