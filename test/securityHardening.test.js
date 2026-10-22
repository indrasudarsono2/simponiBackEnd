import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/isolated';
process.env.JWT_SECRET = 'security-test-secret-that-is-not-for-production';
process.env.FILE_URL_SECRET = 'security-test-file-secret-not-for-production';
process.env.ALLOW_TEST_LOGIN_BYPASS = 'false';
const { sanitizeRichText, sanitizeRichTextResponses, sanitizeUploadedFields } = await import('../middleware/sanitize.js');
const { DatabaseRateLimitStore } = await import('../security/databaseRateLimitStore.js');
const { default: prisma } = await import('../lib/prisma.js');
const { login } = await import('../controller/authController.js');
const { apiRateLimitKey } = await import('../security/apiRateLimitIdentity.js');
after(() => prisma.$disconnect());

test('all known HTML sinks are sanitized, including options, remarks, arrays and multipart fields', () => {
  const payload = '<img src=x onerror=alert(1)><svg onload=alert(1)></svg><p><strong>safe</strong></p>';
  const body = Object.fromEntries(['answer','remark','selectedAnswer','a','b','c','d','key','question'].map(key => [key,payload]));
  body.nested = [{ remark: payload }]; body.content = [payload];
  sanitizeUploadedFields({ body });
  assert.doesNotMatch(JSON.stringify(body), /onerror|onload|<svg|<img/);
  assert.match(body.remark, /<strong>safe<\/strong>/);
  const req = { body: { password: 'Unchanged<&>123', csrf_token: 'unchanged', note: 'plain' } };
  sanitizeRichText(req, {}, () => {});
  assert.equal(req.body.password, 'Unchanged<&>123');
  let result;
  const res = { json: value => { result = value; } };
  sanitizeRichTextResponses({}, res, () => {});
  res.json({ remark: payload });
  assert.doesNotMatch(result.remark, /onerror/);
});

test('rate-limit workers share hashed policy keys and use parameterized atomic transactions', async () => {
  const seen = [];
  const db = { $transaction: callback => callback({
    $executeRaw: async (query,...values) => { seen.push({ query: query.join('?'), values }); },
    $queryRaw: async () => [{ totalHits: 3, resetAt: new Date('2030-01-01') }],
  }) };
  const first = new DatabaseRateLimitStore('login', db);
  const second = new DatabaseRateLimitStore('login', db);
  first.init({ windowMs: 900000 }); second.init({ windowMs: 900000 });
  assert.equal(first.id('employee'), second.id('employee'));
  assert.notEqual(first.id('employee'), new DatabaseRateLimitStore('other', db).id('employee'));
  const result = await first.increment("employee' OR 1=1");
  assert.equal(result.totalHits, 3);
  assert.match(seen[0].query, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(seen[0].query, /employee|OR 1=1/);
  assert.match(seen[0].values[0], /^[a-f0-9]{64}$/);
});

test('SSO-only, nonexistent and locked accounts have the same anonymous failure response', async () => {
  const password = await bcrypt.hash('Correct!123', 4);
  prisma.authenticationAudit.create = async () => ({});
  prisma.userLoginSecurity.findUnique = async () => ({ lockedUntil: new Date(Date.now()+600000) });
  const responses = [];
  for (const user of [null, { nik:'10000001', authenticationType:'AIRNAV_SSO',password }, { nik:'10000001', authenticationType:'LOCAL',password }]) {
    prisma.user.findFirst = async () => user;
    const res = { statusCode:0, status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;} };
    await login({ body:{nik:'10000001',password:'Wrong!123'},headers:{},get:()=>'',ip:'127.0.0.1' },res);
    responses.push({status:res.statusCode,body:res.body});
  }
  assert.deepEqual(responses[0],responses[1]);
  assert.deepEqual(responses[0],responses[2]);
  assert.equal(responses[0].status,401);
});

test('login rejects structured identifiers before querying Prisma', async () => {
  prisma.user.findFirst = async () => assert.fail('Must not query malformed credentials');
  const res = { status(code){this.code=code;return this;},json(){return this;} };
  await login({body:{nik:{not:''},password:'Example!123'}},res);
  assert.equal(res.code,400);
});

test('all configured app/API rate limiters use separate shared stores', () => {
  const app = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const router = fs.readFileSync(new URL('../router/api.js',import.meta.url),'utf8');
  for (const policy of ['api-general','login-ip','login-account','forgot-password','reset-password']) assert.ok(app.includes(`sharedRateLimitStore('${policy}')`));
  for (const policy of ['exam-clock','certificate-verify']) assert.ok(router.includes(`sharedRateLimitStore('${policy}')`));
});

test('authenticated participants sharing one WAF/NAT IP keep separate verified rate limits',()=>{
  const token=nik=>jwt.sign({nik},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'simponi-api',audience:'simponi-web',expiresIn:60});
  const req=auth=>({ip:'192.0.2.1',headers:auth?{authorization:'Bearer '+auth}:{}});
  assert.notEqual(apiRateLimitKey(req(token('10000001'))),apiRateLimitKey(req(token('10000002'))));
  assert.equal(apiRateLimitKey(req('forged')),apiRateLimitKey(req()));
  const signed=token('10000001');
  assert.equal(apiRateLimitKey(req(signed)),apiRateLimitKey({...req(signed),ip:'192.0.2.2'}));
});
