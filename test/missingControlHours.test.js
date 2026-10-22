import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
const {default:db}=await import('../lib/prisma.js');
const {validateHoursEntries,completeMissingHours}=await import('../services/missingControlHours.js');
const {postDashboardToken}=await import('../controller/dashboardController.js');
after(()=>db.$disconnect());
test('hours completion only fills blank ratings and rejects duplicates, missing and invalid values',()=>{
 const ratings=[{id:1,controlHour:null},{id:2,controlHour:'399'}];
 assert.deepEqual(validateHoursEntries(ratings,[{id:1,hours:'120.5'}]),[{id:1,hours:'120.5'}]);
 for(const values of [[],[{id:2,hours:'100'}],[{id:1,hours:'-1'}],[{id:1,hours:''}],[{id:1,hours:'Infinity'}],[{id:1,hours:'1e3'}],[{id:1,hours:'2'},{id:1,hours:'3'}]])assert.throws(()=>validateHoursEntries(ratings,values));
});
test('valid token redirects missing hours without recording briefing; unverified complete application remains blocked',async()=>{
 const original={find:db.applicationDoc.findFirst,token:db.token.findFirst,update:db.applicationDoc.update};let writes=0,missing=true,verified=false,correct=true;
 db.applicationDoc.findFirst=async()=>({id:12,statusId:verified?2:1,appRatings:[{controlHour:missing?null:'150'}]});db.token.findFirst=async()=>({token:'valid'});db.applicationDoc.update=async()=>writes++;
 const response=()=>({code:200,status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
 const req=()=>({user:{nik:'bara',branchUnitId:1},body:{applicationDocId:12,token:correct?'valid':'wrong'}});
 try{
  let res=response();await postDashboardToken(req(),res);assert.equal(res.body.message,'complete_hours');assert.equal(writes,0);
  correct=false;res=response();await postDashboardToken(req(),res);assert.equal(res.body.message,'Invalid token');assert.equal(writes,0);
  correct=true;missing=false;res=response();await postDashboardToken(req(),res);assert.equal(res.code,409);assert.equal(writes,0);
  verified=true;res=response();await postDashboardToken(req(),res);assert.equal(res.body.message,'ok');assert.equal(writes,1);
 }finally{db.applicationDoc.findFirst=original.find;db.token.findFirst=original.token;db.applicationDoc.update=original.update;}
});
test('hours save preserves verification and proposal approval; records actual applicant',async()=>{
 const doc={id:12,statusId:2,updatedAt:new Date(),eventUser:{eventId:2},verifications:{isValid:true},appRatings:[{id:81,controlHour:null,proposalLetter:{id:57,revision:1,content:{},status:'VALIDATED'},finalScores:[],modeOneExamDrafts:[],practicalTests:[],theorySessionParticipants:[]}]};
 let audit,updated,action;
 const tx={$queryRawUnsafe:async()=>[],applicationDoc:{findFirst:async()=>doc,update:async({data})=>{updated=data;}},appRating:{update:async()=>{}},proposalLetterAction:{create:async({data})=>{action=data;}},applicationCorrectionAudit:{create:async({data})=>{audit=data;}}};
 const fake={applicationDoc:tx.applicationDoc,$transaction:async fn=>fn(tx)};
 await completeMissingHours(fake,{nik:'bara',branchUnitId:1},12,{version:doc.updatedAt.toISOString(),hours:[{id:81,hours:'120'}]});
 assert.deepEqual(Object.keys(updated),['updatedAt']);assert.equal(audit.actorNik,'bara');assert.equal(audit.after.verificationValid,true);assert.equal(action.action,'HOURS_COMPLETED');assert.equal(doc.appRatings[0].proposalLetter.status,'VALIDATED');
});
