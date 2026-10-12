import test from 'node:test';
import assert from 'node:assert/strict';
import { ownRecord, escapeHtml, requestUserPreview, showEchainPreview } from '../services/echainUserPreview.js';
test('matches e-NIK, not unrelated NIK, and returns only documented fields', () => {
  assert.deepEqual(ownRecord([{persnum:'10011523',nik:'different',nama:'Test', secret:'hidden'}, {persnum:'other',nik:'10011523'}], '10011523'), {persnum:'10011523',nik:'different',nama:'Test'});
  assert.equal(ownRecord([{persnum:'10011523'}, {persnum:'10011523'}], '10011523'), null);
  assert.equal(ownRecord([{nik:'10011523'}], '10011523'), null);
});
test('escapes upstream HTML', () => assert.equal(escapeHtml('<script>'), '&lt;script&gt;'));
test('uses fixed HTTPS GET without redirects; no token returned', async () => {
  const result = await requestUserPreview('test-token','10011523', async (url, opts) => {
    assert.equal(url, 'https://e-chain.airnavindonesia.co.id/api_echain/performa/user');
    assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.Authorization, 'Bearer test-token');
    return new Response(JSON.stringify({responseStatus:200,data:[{persnum:'10011523',nama:'Test'}]}));
  });
  assert.equal(result.code, 'SUCCESS');
  assert.ok(!JSON.stringify(result).includes('test-token'));
});
test('rejects other employee data and sanitizes upstream errors', async () => {
  assert.equal((await requestUserPreview('t','10011523',async()=>new Response(JSON.stringify({data:[{persnum:'other'}]})))).code,'IDENTITY_NOT_UNIQUELY_MATCHED');
  assert.deepEqual(await requestUserPreview('t','10011523',async()=>new Response('secret internal error',{status:401})),{code:'AIRNAV_TOKEN_REJECTED',upstreamStatus:401});
});
test('disabled feature denies access', async () => {
  const res = {set(){}, status(n){this.statusCode=n;return this;},json(v){this.body=v;}};
  await showEchainPreview({user:{nik:'10011523'}},res);
  assert.equal(res.statusCode,403);
});
test('enabled trial still denies other accounts and non-admin accounts', async () => {
  process.env.ECHAIN_USER_PREVIEW_ENABLED = 'true';
  try {
    for (const user of [{nik:'other', authenticationType:'AIRNAV_SSO',roleNames:['GENERAL ADMIN']}, {nik:'10011523',authenticationType:'AIRNAV_SSO',roleNames:['OPERATIONAL']}, {nik:'10011523',authenticationType:'LOCAL',roleNames:['GENERAL ADMIN']}]) {
      const res = {set(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;}};
      await showEchainPreview({user},res);
      assert.equal(res.statusCode,403);
    }
  } finally { delete process.env.ECHAIN_USER_PREVIEW_ENABLED; }
});
test('missing preview requires fresh SSO, not a PERFORMA JWT sent to ECHAIN', async () => {
  process.env.ECHAIN_USER_PREVIEW_ENABLED = 'true';
  const res = {set(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;}};
  try {
    await showEchainPreview({user:{nik:'10011523',authenticationType:'AIRNAV_SSO',roleNames:['GENERAL ADMIN']},headers:{}},res);
    assert.equal(res.statusCode,409);
  } finally { delete process.env.ECHAIN_USER_PREVIEW_ENABLED; }
});
