import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
const {default:db}=await import('../lib/prisma.js');
const {assertCorrectionScope,assertNoProgress,performCorrection}=await import('../services/applicationCorrections.js');
const {enforceRoutePolicy}=await import('../middleware/routePolicy.js');
after(()=>db.$disconnect());
const actor={nik:'admin',branchUnitId:1,roleNames:['CHECKER ADMIN'],menuNames:['applicationCorrections']};
const doc=()=>({id:1,userNik:'member',user:{branchUnitId:1},eventUser:{event:{sector:{branchUnitId:1},remarkDoc:{remark:'PERPANJANGAN'}},theorySessionParticipants:[]},appRatings:[]});
test('scope denies self, cross-unit, missing unit, non-admin and initial issuance',()=>{
 assert.doesNotThrow(()=>assertCorrectionScope(actor,doc()));
 for(const a of [{...actor,nik:'member'},{...actor,branchUnitId:2},{...actor,branchUnitId:null},{...actor,roleNames:['SUPERVISOR']}])assert.throws(()=>assertCorrectionScope(a,doc()));
 const d=doc();d.eventUser.event.remarkDoc.remark='PENERBITAN';assert.throws(()=>assertCorrectionScope(actor,d));
});
test('progress guard blocks scores, drafts, joined sessions and practical evidence',()=>{
 for(const field of ['finalScores','modeOneExamDrafts','theorySessionParticipants','practicalTests']){
  const d=doc();const r={finalScores:[],modeOneExamDrafts:[],theorySessionParticipants:[],practicalTests:[]};r[field]=field==='theorySessionParticipants'?[{joinedAt:new Date()}]:field==='practicalTests'?[{score:0,file:null}]:[{}];d.appRatings=[r];assert.throws(()=>assertNoProgress(d));
 }
 const d=doc();d.eventUser.theorySessionParticipants=[{questionSnapshot:{}}];assert.throws(()=>assertNoProgress(d));
 assert.doesNotThrow(()=>assertNoProgress(doc()));
});
test('route requires both Checker Admin role and explicit menu assignment',()=>{
 for(const [user,expected] of [[actor,true],[{...actor,menuNames:[]},false],[{...actor,roleNames:['SUPERVISOR']},false]]){
  let ok=false;enforceRoutePolicy({path:'/applicationCorrections/1',method:'POST',user},{status(){return this;},json(){}},()=>ok=true);assert.equal(ok,expected);
 }
});
test('missing reason and stale application are rejected before writes',async()=>{
 await assert.rejects(()=>performCorrection({},actor,1,{kind:'documents',reason:''}));
 const d=doc();d.updatedAt=new Date();
 const tx={applicationDoc:{findUnique:async()=>d},$queryRawUnsafe:async()=>[]};
 await assert.rejects(()=>performCorrection({applicationDoc:tx.applicationDoc,$transaction:async fn=>fn(tx)},actor,1,{kind:'documents',reason:'Correction requested',version:'stale'}),/Application changed/);
});
function harness(){
 const d=doc();d.updatedAt=new Date('2026-10-15T00:00:00Z');d.licenseId=1;d.logbookUserId=2;d.medexId=3;d.ielpId=4;
 for(const [type,id] of [['license',1],['logbook',2],['medex',3],['ielp',4]])d[type]={id,userNik:'member',file:type,isConfirmed:true,verificationStatus:'APPROVED',expired:new Date('2099-01-01')};
 d.number='DOC/1';d.appRatings=[{id:9,ratingId:3,rating:{rating:'APS'},controlHour:'399',finalScores:[],modeOneExamDrafts:[],theorySessionParticipants:[],practicalTests:[],proposalLetter:{id:8,status:'RETURNED',revision:1,content:{},validatedAt:null}}];
 const actions=[],audits=[],writes=[];
 const tx={
  $queryRawUnsafe:async()=>[],
  applicationDoc:{findUnique:async()=>d,update:async({data})=>{writes.push(data);Object.assign(d,data);return d;}},
  status:{findFirst:async()=>({id:1})},
  logBookUser:{findFirst:async({where})=>({id:where.id,userNik:'member',file:'new-logbook'})},
  proposalLetter:{update:async({data})=>{const p=d.appRatings[0].proposalLetter;Object.assign(p,{...data,revision:typeof data.revision==='object'?p.revision+1:p.revision});return p;}},
  proposalLetterAction:{create:async({data})=>{actions.push(data);return data;}},
  applicationCorrectionAudit:{create:async({data})=>{audits.push(data);return data;},findFirst:async()=>null},
 };
 return {d,tx,actions,audits,writes,client:{applicationDoc:tx.applicationDoc,$transaction:async fn=>fn(tx)}};
}
test('document correction preserves hours, returns proposals and audits actual admin',async()=>{
 const h=harness();h.d.appRatings[0].proposalLetter.status='VALIDATED';
 await performCorrection(h.client,actor,1,{kind:'documents',reason:'Correct member logbook selection',version:h.d.updatedAt.toISOString(),documents:{logbookUserId:54}});
 assert.equal(h.d.logbookUserId,54);assert.equal(h.d.appRatings[0].controlHour,'399');assert.equal(h.d.appRatings[0].proposalLetter.status,'RETURNED');
 assert.equal(h.actions[0].actorNik,'admin');assert.equal(h.actions[0].action,'ADMIN_DOCUMENT_CORRECTED');assert.equal(h.audits.length,1);
});
test('resubmission increments revision, refreshes snapshot and never validates',async()=>{
 const h=harness();
 await performCorrection(h.client,actor,1,{kind:'resubmit',reason:'Corrected logbook has been reviewed',version:h.d.updatedAt.toISOString()});
 const p=h.d.appRatings[0].proposalLetter;
 assert.equal(p.status,'PENDING');assert.equal(p.revision,2);assert.equal(p.content.supportingFiles.logbook,'logbook');assert.equal(h.actions[0].actorNik,'admin');assert.equal(h.actions[0].action,'ADMIN_RESUBMITTED');
});
test('resubmission rejects missing file and expired medical credential without writes',async()=>{
 for(const broken of ['file','expiry']){
  const h=harness();if(broken==='file')h.d.logbook.file=null;else h.d.medex.expired=new Date('2000-01-01');
  await assert.rejects(()=>performCorrection(h.client,actor,1,{kind:'resubmit',reason:'Resubmission requested',version:h.d.updatedAt.toISOString()}));assert.equal(h.actions.length,0);assert.equal(h.writes.length,0);
 }
});
test('rollback without an unchanged audited correction is refused',async()=>{
 const h=harness();await assert.rejects(()=>performCorrection(h.client,actor,1,{kind:'rollback',reason:'Rollback requested by administrator',version:h.d.updatedAt.toISOString()}),/rollback requires manual review/);assert.equal(h.writes.length,0);
});
test('rating correction adds blank hours and responsible practical checker without overwriting APS',async()=>{
 const h=harness(),event=h.d.eventUser.event;
 event.id=2;event.isPractical=true;event.isSimulator=false;h.d.eventUser.eventId=2;
 event.sector.subBranchUnitRatings=[{ratingId:1,rating:{rating:'TWR'}},{ratingId:3,rating:{rating:'APS'}}];
 h.d.appRatings[0].proposalLetter.supervisorNik='supervisor';
 const group={event:{session:{branchUnitId:1},remarkDoc:{remark:'PERPANJANGAN'}},assignmentPolicy:1,ratingIds:[1,3],checkerGroups:[{id:13,checker:'checker',ratingAssignments:[{ratingId:1},{ratingId:3}],userChecker:{nik:'checker',branchUnitId:1,userRoles:[{roles:{role:'CHECKER'},checkerRatings:[{ratingId:1,rating:{}},{ratingId:3,rating:{}}]}]}}]};
 const member={id:50,groupId:7,group};h.tx.groupMember={findMany:async()=>[member],findFirst:async()=>member};
 h.tx.user={findFirst:async()=>({nik:'supervisor'})};h.tx.eventConfigurationVersion={findFirst:async()=>null};
 h.tx.appRating={create:async({data})=>{const r={...data,id:10,rating:{rating:'TWR'},finalScores:[],modeOneExamDrafts:[],theorySessionParticipants:[],practicalTests:[]};h.d.appRatings.push(r);return r;}};
 h.tx.practicalTest={create:async({data})=>{h.d.appRatings[1].practicalTests.push({...data,id:99});}};
 h.tx.proposalLetter.create=async({data})=>{const p={...data,id:19,revision:1};h.d.appRatings[1].proposalLetter=p;return p;};
 await performCorrection(h.client,actor,1,{kind:'ratings',ratingIds:[1],reason:'Add missing assigned TWR rating',version:h.d.updatedAt.toISOString()});
 assert.equal(h.d.appRatings[0].controlHour,'399');assert.equal(h.d.appRatings[1].controlHour,null);
 assert.equal(h.d.appRatings[1].practicalTests[0].checkerGroupId,13);assert.equal(h.d.appRatings[1].proposalLetter.status,'PENDING');assert.equal(h.actions[0].actorNik,'admin');
});
