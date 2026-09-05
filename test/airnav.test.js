import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'production';
process.env.ALLOW_TEST_LOGIN_BYPASS = 'false';
process.env.JWT_SECRET = 'test-only-airnav-jwt-secret-not-for-production';
process.env.FILE_URL_SECRET = 'test-only-airnav-file-secret-not-for-production';
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
process.env.AIRNAV_AUTH_BASE_URL = 'https://auth.example.invalid/v2';
process.env.AIRNAV_CLIENT_ID = 'test-client';
process.env.AIRNAV_CLIENT_SECRET = 'test-only-secret';
process.env.AIRNAV_REDIRECT_URI = 'https://performa.example.invalid/backend/api/auth/airnav/callback';
process.env.PERFORMA_PUBLIC_BASE_URL = 'https://performa.example.invalid';

const { default: prisma } = await import('../lib/prisma.js');
const { startAirnavLogin, completeAirnavLogin } = await import('../controller/authController.js');
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await prisma.$disconnect(); });

const response = () => ({
  cookies: {}, cleared: [], statusCode: 200,
  cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
  clearCookie(name) { this.cleared.push(name); return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  redirect(location) { this.location = location; return this; },
});
const request = (state = 'expected-state', cookieState = 'expected-state') => ({
  query: { code: 'test-code', state },
  headers: { cookie: `airnav_sso_state=${cookieState}; airnav_sso_verifier=test-verifier` },
  get: () => '', ip: '127.0.0.1',
});

test('SSO start sets Secure HttpOnly state/PKCE cookies and registered callback', () => {
  const res = response();
  startAirnavLogin({}, res);
  const url = new URL(res.location);
  assert.equal(url.origin, 'https://auth.example.invalid');
  assert.equal(url.searchParams.get('redirect_uri'), process.env.AIRNAV_REDIRECT_URI);
  assert.equal(url.searchParams.get('state'), res.cookies.airnav_sso_state.value);
  const verifier = res.cookies.airnav_sso_verifier;
  assert.equal(verifier.options.httpOnly, true);
  assert.equal(verifier.options.secure, true);
  assert.equal(verifier.options.sameSite, 'lax');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(verifier.value).digest('base64url'));
});

test('mismatched or malformed state is rejected before token exchange', async () => {
  globalThis.fetch = () => assert.fail('Must not call AirNav');
  for (const req of [request('wrong'), request('expected-state', '%E0%A4%A')]) {
    const res = response();
    await completeAirnavLogin(req, res);
    assert.equal(new URL(res.location).pathname, '/login');
    assert.match(new URL(res.location).searchParams.get('auth_error'), /Invalid or expired/);
    assert.equal(res.cookies.auth_token, undefined);
  }
});

test('cancelled authentication creates no PERFORMA session', async () => {
  const req = request(); req.query.error = 'access_denied';
  const res = response();
  await completeAirnavLogin(req, res);
  assert.match(new URL(res.location).searchParams.get('auth_error'), /cancelled or denied/);
  assert.equal(res.cookies.auth_token, undefined);
});

test('registered employee gets the PERFORMA JWT and frontend session-completion redirect', async () => {
  const roles = [{ roles: { role: 'DOCTOR', rolesMenu: [] } }];
  prisma.user.findFirst = async ({ where }) => {
    assert.equal(where.nik, '12345678');
    assert.equal(where.deletedAt, null);
    return { nik: '12345678', name: 'Test User', userRoles: roles,
      branchId: 1, branchUnitId: 2, sectorId: 3, professionInBranchId: 4,
      professionInBranch: { professionId: 5 } };
  };
  prisma.userLoginSecurity.upsert = () => Promise.resolve({});
  prisma.authenticationAudit.create = () => Promise.resolve({});
  prisma.$transaction = async (operations) => Promise.all(operations);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal);
    if (url.endsWith('/sso/token')) {
      assert.equal(options.body.get('code_verifier'), 'test-verifier');
      return { ok: true, json: async () => ({ data: { accessToken: 'external-test-token' } }) };
    }
    assert.equal(options.headers.Authorization, 'Bearer external-test-token');
    return { ok: true, json: async () => ({ data: { employee_no: '12345678' } }) };
  };
  const res = response();
  await completeAirnavLogin(request(), res);
  assert.equal(calls.length, 2);
  assert.equal(res.location, 'https://performa.example.invalid/auth/complete');
  const token = jwt.verify(res.cookies.auth_token.value, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  assert.equal(token.sub, '12345678');
  assert.deepEqual(token.roles, roles);
  assert.deepEqual(token.roleNames, ['DOCTOR']);
  assert.equal(token.professionId, 5);
  assert.equal(token.exp - token.iat, 10800);
  assert.equal(token.accessToken, undefined);
  assert.equal(res.cookies.auth_token.options.httpOnly, true);
  assert.equal(res.cookies.auth_token.options.secure, true);
  assert.ok(res.cookies.csrf_token);
});

test('AirNav identity without a PERFORMA account is rejected', async () => {
  prisma.user.findFirst = async () => null;
  const res = response();
  await completeAirnavLogin(request(), res);
  assert.match(new URL(res.location).searchParams.get('auth_error'), /not registered/);
  assert.equal(res.cookies.auth_token, undefined);
});
