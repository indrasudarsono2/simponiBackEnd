import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationState} from '../../simponi/app/utils/verificationState.ts';
test('only active, currently valid verification and VERIFIED application show approval',()=>{
 const valid={isValid:true,applicationDoc:{statusId:2}};
 assert.equal(verificationState(valid),'verified');
 for(const value of [{...valid,isValid:false},{...valid,deletedAt:'2026-10-15'},{...valid,applicationDoc:{statusId:1}},{...valid,applicationDoc:{statusId:2,deletedAt:'2026-10-15'}},{verificationData:'historical checklist'},[valid,{...valid,isValid:false}]])assert.equal(verificationState(value),'review-required');
 assert.equal(verificationState(null),'none');assert.equal(verificationState([]),'none');
});
