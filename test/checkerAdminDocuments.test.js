import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET='checker-admin-test-secret-longer-than-32-characters';
process.env.FILE_URL_SECRET='checker-admin-file-secret-longer-than-32-characters';
const {default:prisma}=await import('../lib/prisma.js');
const {canAdminReviewProposal}=await import('../utils/checkerAdminScope.js');
const {decideLetter,listInbox}=await import('../controller/proposalLetterController.js');
const {postVerification,getVerificationInit}=await import('../controller/verificationController.js');
const {enforceRoutePolicy}=await import('../middleware/routePolicy.js');
after(async()=>prisma.$disconnect());
const admin={nik:'admin',branchUnitId:7,roleNames:['CHECKER ADMIN'],menuNames:['verification','proposalLetters']};
const rating=()=>({id:3,rating:{rating:'APP'},applicationDoc:{id:1,number:'DOC1',userNik:'member',user:{branchUnitId:7,name:'Member'},eventUser:{id:4,eventId:2,event:{remarkDoc:{remark:'PERPANJANGAN'},sector:{branchUnitId:7}}},license:{file:'license'},logbook:{file:'logbook'},medex:{file:'medex'},ielp:{file:'ielp'}}});
const response=()=>({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('delegation is branch-unit scoped, denies self, missing unit and OJTI signatures',()=>{
 assert.equal(canAdminReviewProposal(admin,rating()),true);
 for(const user of [{...admin,branchUnitId:8},{...admin,branchUnitId:null},{...admin,nik:'member'},{...admin,roleNames:['OPERATIONAL']}])assert.equal(canAdminReviewProposal(user,rating()),false);
 const other=rating();other.applicationDoc.user.branchUnitId=8;assert.equal(canAdminReviewProposal(admin,other),false);
 const initial=rating();initial.applicationDoc.eventUser.event.remarkDoc.remark='PENERBITAN';assert.equal(canAdminReviewProposal(admin,initial),false);
});
test('route policies admit Checker Admin with assigned menus but never applicant reassignment or OJTI inbox',()=>{
 for(const path of ['/proposalLetters/inbox','/proposalLetters/1','/proposalLetters/1/decision','/verification','/verificationPost']){
  const res=response();let allowed=false;enforceRoutePolicy({path,user:admin},res,()=>allowed=true);assert.equal(allowed,true,path);
 }
 for(const path of ['/proposalLetters/application/1/assign','/ojtiRecommendations/inbox']){
  let allowed=false;enforceRoutePolicy({path,user:admin},response(),()=>allowed=true);assert.equal(allowed,false);
 }
 let allowed=false;enforceRoutePolicy({path:'/verificationPost',user:{...admin,menuNames:[]}},response(),()=>allowed=true);assert.equal(allowed,false);
});
test('proposal controller permits unassigned admin, preserves supervisor assignment and audits actual actor',async()=>{
 const original={find:prisma.proposalLetter.findUnique,transaction:prisma.$transaction};let claim,action;
 prisma.proposalLetter.findUnique=async()=>({id:1,status:'PENDING',revision:1,supervisorNik:'supervisor',appRating:rating()});
 prisma.$transaction=async fn=>fn({proposalLetter:{updateMany:async args=>(claim=args,{count:1})},proposalLetterAction:{create:async args=>(action=args,{})}});
 try{
  const res=response();await decideLetter({params:{id:'1'},body:{decision:'VALIDATE'},user:admin},res);assert.equal(res.code,200);assert.equal(res.body.success,true);assert.equal(claim.where.supervisorNik,'supervisor');assert.equal(action.data.actorNik,'admin');
  const denied=response();await decideLetter({params:{id:'1'},body:{decision:'VALIDATE'},user:{...admin,branchUnitId:8}},denied);assert.equal(denied.code,403);
 }finally{prisma.proposalLetter.findUnique=original.find;prisma.$transaction=original.transaction;}
});
test('admin inbox removes individual assignment but retains member and event unit filters',async()=>{
 const original={find:prisma.proposalLetter.findMany,count:prisma.proposalLetter.count};let where;
 prisma.proposalLetter.findMany=async args=>(where=args.where,[]);prisma.proposalLetter.count=async()=>0;
 try{await listInbox({user:admin,query:{}},response());assert.equal(where.supervisorNik,undefined);assert.equal(where.applicationDoc.user.branchUnitId,7);assert.equal(where.applicationDoc.eventUser.event.sector.branchUnitId,7);assert.equal(where.applicationDoc.userNik.not,'admin');}finally{prisma.proposalLetter.findMany=original.find;prisma.proposalLetter.count=original.count;}
});
test('verification checks member identity and unit, accepts admin without PIC and retains prerequisites',async()=>{
 const original={doc:prisma.applicationDoc.findFirst,member:prisma.groupMember.findFirst,transaction:prisma.$transaction};
 let unit=7,member='member',validated=true,writes=0,verificationData;
 prisma.applicationDoc.findFirst=async()=>({id:1,userNik:'member',eventUser:{id:4,eventId:2,event:{sector:{branchUnitId:unit},remarkDoc:{remark:'PERPANJANGAN'}}},appRatings:[{proposalLetter:{status:validated?'VALIDATED':'PENDING'}}]});
 prisma.groupMember.findFirst=async()=>({id:5,member,group:{eventId:2,pic:'checker',deletedAt:null}});
 prisma.$transaction=async fn=>fn({applicationDoc:{update:async()=>writes++},verification:{upsert:async args=>(verificationData=args.create.verificationData,{})},eventUser:{update:async()=>({}),findFirst:async()=>null}});
 const req=()=>({user:admin,body:{applicationDocId:1,groupMemberId:5,verificationItems:[{id:1,status:true,verifiedByNik:'forged'}]}});
 try{
  let res=response();await postVerification(req(),res);assert.equal(res.code,200);assert.equal(writes,1);assert.equal(JSON.parse(verificationData)[0].verifiedByNik,'admin');
  unit=8;res=response();await postVerification(req(),res);assert.equal(res.code,403);
  unit=7;member='different';res=response();await postVerification(req(),res);assert.equal(res.code,409);
  member='member';validated=false;res=response();await postVerification(req(),res);assert.equal(res.code,409);assert.equal(writes,1);
  res=response();await postVerification({...req(),user:{...admin,nik:'member'}},res);assert.equal(res.code,403);
 }finally{prisma.applicationDoc.findFirst=original.doc;prisma.groupMember.findFirst=original.member;prisma.$transaction=original.transaction;}
});
test('verification event list is tenant filtered without an admin PIC requirement',async()=>{
 const original=prisma.group.findMany;let where;prisma.group.findMany=async args=>(where=args.where,[]);
 try{await getVerificationInit({user:admin},response());assert.equal(where.pic,undefined);assert.equal(where.event.sector.branchUnitId,7);const res=response();await getVerificationInit({user:{...admin,branchUnitId:null}},res);assert.equal(res.code,403);}finally{prisma.group.findMany=original;}
});
test('verification dropdown lists each event ID once, retaining separate events with identical names',async()=>{
 const original=prisma.group.findMany;
 prisma.group.findMany=async()=>[{event:{id:3,event:'Semester II'}},{event:{id:3,event:'Semester II'}},{event:null},{event:{id:4,event:'Semester II'}}];
 try{const res=response();await getVerificationInit({user:admin},res);assert.equal(res.code,200);assert.deepEqual(res.body.event.map(event=>event.id),[3,4]);}finally{prisma.group.findMany=original;}
});
