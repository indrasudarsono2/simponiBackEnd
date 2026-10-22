import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET='isolated-local-lock-test-secret-at-least-32-characters';
process.env.FILE_URL_SECRET='isolated-local-file-test-secret-at-least-32-characters';
process.env.DATABASE_URL='mysql://unused:unused@127.0.0.1:1/isolated';
process.env.LOGIN_FAILURE_WINDOW_MINUTES='1440';
process.env.LOGIN_BLOCK_THRESHOLD='10';
const {default:prisma}=await import('../lib/prisma.js');
const {default:bcrypt}=await import('bcryptjs');
const {login}=await import('../controller/authController.js');
const {clearFailedUserLogin}=await import('../controller/userLoginController.js');
const password=await bcrypt.hash('correct-password',4);
const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this},cookie(){}});
function setup(state=null,failures=[]) {
  const audits=[];const updates=[];
  prisma.$transaction=async fn=>typeof fn==='function'?fn(prisma):Promise.all(fn);
  prisma.$queryRaw=async()=>[];
  prisma.user.findFirst=async()=>({nik:'12345678',authenticationType:'LOCAL',password,userRoles:[]});
  prisma.userLoginSecurity.findUnique=async()=>state;
  prisma.userLoginSecurity.upsert=async args=>{updates.push(args);return {}};
  prisma.userLoginSecurity.update=async args=>{updates.push(args);return {}};
  prisma.authenticationAudit.findFirst=async()=>({id:50});
  prisma.authenticationAudit.findMany=async args=>{
    assert.equal(args.where.id.gt,50);
    assert.ok(Math.abs(Date.now()-args.where.createdAt.gte.getTime()-86400000)<3000);
    return failures;
  };
  prisma.authenticationAudit.create=async args=>{audits.push(args.data);return {}};
  return {audits,updates};
}
const request=(password='wrong-password')=>({body:{nik:'12345678',password},ip:'127.0.0.1',get:()=>''});
test('tenth checked wrong password creates a persistent lock and audit',async()=>{
  const data=setup({failedLoginCount:9},Array.from({length:9},()=>({createdAt:new Date(Date.now()-3600000)})));
  const res=response();await login(request(),res);
  assert.equal(res.code,401);assert.equal(data.updates[0].update.failedLoginCount,10);
  assert.ok(data.updates[0].update.blockedAt);assert.equal(data.audits[0].eventType,'ACCOUNT_LOGIN_LOCKED');
});
test('blocked account rejects even correct password without changing counter',async()=>{
  const data=setup({failedLoginCount:10,blockedAt:new Date('2020-01-01')});
  const res=response();await login(request('correct-password'),res);
  assert.equal(res.code,401);assert.equal(data.updates.length,0);
});
test('cooldown rejects retries without incrementing or extending the state',async()=>{
  const data=setup({failedLoginCount:5,lockedUntil:new Date(Date.now()+300000)});
  const res=response();await login(request(),res);
  assert.equal(res.code,401);assert.equal(data.updates.length,0);
});
test('admin unlock requires reason and persists actor, reason and lock reset atomically',async()=>{
  const data=setup({failedLoginCount:10,blockedAt:new Date()});
  let res=response();await clearFailedUserLogin({params:{nik:'12345678'},body:{},user:{nik:'87654321'}},res);
  assert.equal(res.code,400);assert.equal(data.updates.length,0);
  res=response();await clearFailedUserLogin({params:{nik:'12345678'},body:{reason:'Identity verified by administrator'},user:{nik:'87654321'},get:()=>''},res);
  assert.equal(res.code,200);assert.equal(data.updates[0].data.blockedAt,null);
  assert.equal(data.audits[0].performedByNik,'87654321');
  assert.equal(data.audits[0].eventType,'ACCOUNT_LOGIN_UNLOCKED');
  assert.equal(data.audits[0].reason,'Identity verified by administrator');
});
