import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateExtension, hasExtendedAccess, theoryIsFinished } from '../services/examAccessExtension.js';
import { deriveRatingExaminationStatus } from '../services/examinationStatus.js';
const now=new Date('2026-10-22T10:00:00Z');
const event={theoryMode:'MODE_1',startDate:'2026-10-01T00:00:00Z',finishDate:'2026-10-20T00:00:00Z'};
const until='2026-10-23T10:00:00Z';
const rating={status:{status:'CHECKED'},examAccessExtensions:[]};
const input={rating,event,now,accessUntil:until,reason:'Power outage prevented completion'};

test('only expired Mode 1 unfinished ratings with a reason and future zoned deadline can be extended',()=>{
 assert.equal(validateExtension(input).accessUntil.toISOString(),'2026-10-23T10:00:00.000Z');
 for(const change of [{event:{...event,theoryMode:'MODE_2'}},{event:{...event,finishDate:until}},{reason:'short'},{accessUntil:'2026-10-23T10:00'},{accessUntil:'2026-10-20T00:00:00Z'},{rating:{status:{status:'SUCCESS'}}},{rating:{status:{status:'FAILED'}}}]) assert.throws(()=>validateExtension({...input,...change}));
 assert.equal(theoryIsFinished({status:{status:'RECHECK'},finalScores:[{status:{status:'FAILED'}}]}),false);
 assert.equal(theoryIsFinished({status:{status:'CHECKED'},finalScores:[{status:{status:'WAITING PRACTICAL'}}]}),true);
 assert.throws(()=>validateExtension({...input,rating:{...rating,examAccessExtensions:[{accessUntil:'2026-10-24T00:00:00Z'}]}}));
});
test('extension reopens only the selected rating and expires without altering score or countdown state',()=>{
 const room={startDate:event.startDate,finishDate:event.finishDate};
 assert.equal(deriveRatingExaminationStatus({appRating:rating,event,room,now}).canStart,false);
 const extended={...rating,examAccessExtensions:[{accessUntil:until}]};
 const original=JSON.stringify(extended);
 assert.equal(hasExtendedAccess(extended,now),true);
 assert.equal(deriveRatingExaminationStatus({appRating:extended,event,room,now}).canStart,true);
 assert.equal(hasExtendedAccess(extended,new Date('2026-10-24')),false);
 assert.equal(JSON.stringify(extended),original);
});
test('access lookup is tenant/user/event/verification scoped; expired access cannot start via API',async()=>{
 const source=fs.readFileSync(new URL('../middleware/modeOneEventAccess.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export async function')).replace('export ','');
 for(const granted of [false,true]) {
  let query,next=false;
  const db={appRating:{findFirst:async q=>{query=q;return{...rating,examAccessExtensions:granted?[{accessUntil:new Date(Date.now()+60000)}]:[],applicationDoc:{eventUser:{event:{theoryMode:'MODE_1',finishDate:new Date('2020-01-01')},attendaces:{room:{startDate:new Date('2019-01-01'),finishDate:new Date('2020-01-01')}}}}};}}};
  const handler=new Function('prisma','hasExtendedAccess',body+';return checkModeOneEventAccess;')(db,hasExtendedAccess);
  const res={status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler({body:{appRatingId:7,eventId:4},user:{nik:'owner'}},res,()=>{next=true;});
  assert.equal(query.where.applicationDoc.userNik,'owner');assert.equal(query.where.applicationDoc.statusId,2);assert.equal(query.where.applicationDoc.eventUser.eventId,4);
  assert.equal(next,granted);if(!granted)assert.equal(res.code,409);
 }
});
test('grant endpoints require Checker Admin and controller scopes both event and participant branch units',()=>{
 const routes=fs.readFileSync(new URL('../router/api.js',import.meta.url),'utf8');
 assert.match(routes,/post\('\/events\/:id\/exam-access\/:eventUserId', requireRole\(ROLES.CHECKER_ADMIN\), extendExamAccess/);
 const controller=fs.readFileSync(new URL('../controller/examAccessExtensionController.js',import.meta.url),'utf8');
 assert.match(controller,/user: \{ deletedAt: null, branchUnitId: req.user.branchUnitId \}/);
 assert.match(controller,/sector: \{ deletedAt: null, branchUnitId: req.user.branchUnitId \}/);
 assert.doesNotMatch(controller,/modeOneExamDraft\.(update|delete)|finalScore\.(update|delete)|finishDate:\s*req.body/);
});
