import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFailureState } from '../security/loginProtection.js';
const config={failureWindowMs:86400000,cooldownThreshold:5,firstCooldownMs:300000,secondCooldownMs:900000,maximumCooldownMs:1800000,blockThreshold:10};
test('cooldowns escalate and tenth actual failure requires administrator',()=>{
  let previous=null;let now=new Date('2026-10-22T00:00:00Z');
  for(let count=1;count<=10;count++){
    const state=calculateFailureState({previous,now,config});
    assert.equal(state.failedLoginCount,count);
    assert.equal(Boolean(state.blockedAt),count===10);
    if(count===5)assert.equal(state.lockedUntil-now,300000);
    if(count===6)assert.equal(state.lockedUntil-now,900000);
    if(count>=7)assert.equal(state.lockedUntil-now,1800000);
    previous=state;now=new Date((state.lockedUntil?.getTime()||now.getTime())+1);
  }
  assert.equal(calculateFailureState({previous,now:new Date('2026-11-22'),config}),previous);
});
test('requests during cooldown do not increment or extend it',()=>{
  const now=new Date();const previous={failedLoginCount:5,lockedUntil:new Date(now.getTime()+300000)};
  assert.equal(calculateFailureState({previous,now,config}),previous);
});
