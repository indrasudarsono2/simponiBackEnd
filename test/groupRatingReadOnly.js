// Optional local-development diagnostic. No records are created or updated.
import prisma from '../lib/prisma.js';
import { getGroups } from '../controller/groupController.js';
import { getEvent } from '../controller/performanceCheckController.js';
import { getPractical } from '../controller/practicalExamController.js';
import { getVerification } from '../controller/verificationController.js';
import assert from 'node:assert/strict';

const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '::1'].includes(url.hostname), 'Local development database only');
const group = await prisma.group.findFirst({ where: { deletedAt: null, event: { deletedAt: null, session: { branchUnitId: { not: null } } } }, include: { event: { include: { session: true } }, checkerGroups: { where: { deletedAt: null } } } });
assert.ok(group, 'A development checker group is needed');
const user = { nik: group.pic, branchUnitId: group.event.session.branchUnitId };
let last;
const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { last = { code: this.code, body }; this.code = 200; } };
try {
  for (const [label, handler, query, body] of [
    ['group options', getGroups, {}, {}],
    ['essay correction', getEvent, { eventId: String(group.eventId) }, {}],
    ['practical event options', getPractical, { view: 'events' }, {}],
    ['practical results', getPractical, { eventId: String(group.eventId) }, {}],
    ['application verification', getVerification, {}, { eventId: group.eventId }],
  ]) {
    await handler({ user, query, body }, res);
    assert.equal(last.code, 200, `${label}: ${last.body.message || 'failed'}`);
    console.log(`${label}: HTTP 200`);
  }
} finally { await prisma.$disconnect(); }
