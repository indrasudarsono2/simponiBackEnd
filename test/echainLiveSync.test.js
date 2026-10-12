import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTokenVault } from '../services/echainTokenVault.js';
import { eligible, refreshTokens, liveEchainResult } from '../services/echainLiveSync.js';

test('all AirNav SSO accounts eligible; local accounts and disabled integration denied',()=>{
  process.env.ECHAIN_USER_PREVIEW_ENABLED='true';
  assert.ok(eligible({nik:'another-user',authenticationType:'AIRNAV_SSO',roleNames:['OPERATIONAL']}));
  assert.equal(eligible({nik:'n',authenticationType:'LOCAL'}),false);
  delete process.env.ECHAIN_USER_PREVIEW_ENABLED;
  assert.equal(eligible({nik:'n',authenticationType:'AIRNAV_SSO'}),false);
});
test('encrypted sessions isolated by employee and browser session; no ten-minute expiry',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'echain-vault-test-'));
  const originalNow=Date.now;
  try {
    const store=createTokenVault(directory,'test-only-secret');
    const now=Date.now();
    await store.write('n','session',{accessToken:'test-secret-access',refreshToken:'test-secret-refresh',sessionExpires:now+3*3600000});
    const files=await fs.readdir(directory);
    assert.equal((await fs.readFile(path.join(directory,files[0]),'utf8')).includes('test-secret'),false);
    Date.now=()=>now+11*60000;
    assert.equal((await store.read('n','session')).accessToken,'test-secret-access');
    await assert.rejects(store.read('other','session'));
    await assert.rejects(store.read('n','other-session'));
    await assert.rejects(createTokenVault(directory,'wrong-secret').read('n','session'));
    Date.now=()=>now+4*3600000;
    await assert.rejects(store.read('n','session'),/expired/);
  } finally {Date.now=originalNow; await fs.rm(directory,{recursive:true,force:true});}
});
test('independent worker vaults serialize refresh-token rotation',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'echain-lock-test-'));
  try {
    const first=createTokenVault(directory,'test'); const second=createTokenVault(directory,'test');
    let active=0; let maximum=0;
    const action=async()=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,30));active--;};
    await Promise.all([first.withLock('n','s',action),second.withLock('n','s',action)]);
    assert.equal(maximum,1);
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
test('refresh follows ICD and verifies employee plus application',async()=>{
  process.env.AIRNAV_CLIENT_ID='test-client';
  const original={refreshToken:'test-refresh',refreshExpires:Date.now()+60000,sessionExpires:Date.now()+3600000};
  const fetcher=async(url,options)=>{
    assert.equal(options.redirect,'error');
    if(url.endsWith('/auth/refresh')) {
      assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{refreshToken:'test-refresh'});
      return new Response(JSON.stringify({data:{accessToken:'new-access',refreshToken:'new-refresh',expiresIn:3600,refreshTokenExpiresAt:new Date(Date.now()+86400000).toISOString()}}));
    }
    assert.equal(options.headers.Authorization,'Bearer new-access');
    return new Response(JSON.stringify({employee_no:'n',application:{client_id:'test-client'}}));
  };
  const updated=await refreshTokens(original,'n',fetcher);
  assert.equal(updated.refreshToken,'new-refresh'); assert.equal(updated.sessionExpires,original.sessionExpires);
  await assert.rejects(refreshTokens(original,'another',fetcher));
  await assert.rejects(refreshTokens({...original,refreshExpires:Date.now()-1},'n',()=>assert.fail('Expired refresh must not be sent')));
});
test('local accounts cannot trigger an external request',async()=>{
  process.env.ECHAIN_USER_PREVIEW_ENABLED='true';
  await assert.rejects(liveEchainResult({user:{nik:'n',authenticationType:'LOCAL'}},()=>assert.fail('Must not call ECHAIN')),error=>error.status===403);
  delete process.env.ECHAIN_USER_PREVIEW_ENABLED;
});
