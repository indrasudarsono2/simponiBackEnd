import { isCheckerAdmin, sameBranchUnit } from '../utils/checkerAdminScope.js';
import { getApplicationAssignment } from './groupRatingPolicy.js';
import { snapshot } from '../controller/proposalLetterController.js';

const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export function assertCorrectionScope(actor,doc){
 if(!isCheckerAdmin(actor)||!sameBranchUnit(actor,doc?.user?.branchUnitId)||
 !sameBranchUnit(actor,doc?.eventUser?.event?.sector?.branchUnitId)||actor.nik===doc?.userNik)fail('Corrections require a Checker Admin in the member and event branch unit; self-correction is not allowed.',403);
 if(doc.deletedAt||doc.user.deletedAt||doc.eventUser.deletedAt||doc.eventUser.event.deletedAt)fail('Application is no longer active.');
 if(doc.eventUser.event.remarkDoc?.remark!=='PERPANJANGAN')fail('Initial issuance/OJTI applications require their existing workflow.');
}
export function assertNoProgress(doc){
 for(const r of doc.appRatings){
  if(r.finalScores.length||r.modeOneExamDrafts.length||Object.values(r._count||{}).some(Boolean)||r.theorySessionParticipants.some(p=>p.joinedAt||p.questionSnapshot||p.finalScoreId)||
   r.practicalTests.some(p=>p.score!==null||p.file))fail('Examination or practical activity exists; correction is locked.');
 }
 if(doc.eventUser.theorySessionParticipants.some(p=>p.joinedAt||p.questionSnapshot||p.finalScoreId))fail('Theory session already started; correction is locked.');
}
export const correctionInclude={user:{select:{nik:true,name:true,branchUnitId:true,deletedAt:true,licenseUserId:true,placeOfBirth:true,dateOfBirth:true,nationality:true,gender:{select:{gender:true}}}},eventUser:{include:{theorySessionParticipants:true,event:{include:{remarkDoc:true,sector:{include:{branchUnit:{include:{branch:true}},subBranchUnitRatings:{where:{deletedAt:null},include:{rating:true}}}}}}}},
 license:true,logbook:true,medex:true,ielp:true,ojtUser:true,verifications:true,
 appRatings:{orderBy:{id:'asc'},include:{_count:{select:{multipleChoiceCorections:true,essayCorrections:true,monitorTimes:true}},rating:true,proposalLetter:true,finalScores:true,modeOneExamDrafts:true,theorySessionParticipants:true,practicalTests:{orderBy:{id:'asc'}}}}};
const json=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const documentFields={licenseId:['license','license'],logbookUserId:['logBookUser','logbook'],medexId:['medex','medex'],ielpId:['ielp','ielp']};
export const auditView=doc=>json({id:doc.id,updatedAt:doc.updatedAt,statusId:doc.statusId,rating:doc.rating,licenseId:doc.licenseId,logbookUserId:doc.logbookUserId,medexId:doc.medexId,ielpId:doc.ielpId,verification:doc.verifications?{id:doc.verifications.id,isValid:doc.verifications.isValid}:null,ratings:doc.appRatings.map(r=>({id:r.id,ratingId:r.ratingId,controlHour:r.controlHour,deletedAt:r.deletedAt,proposal:r.proposalLetter,practicals:r.practicalTests.map(p=>({id:p.id,checkerGroupId:p.checkerGroupId,kindOfPracticalId:p.kindOfPracticalId,updatedAt:p.updatedAt,deletedAt:p.deletedAt}))}))});
export async function loadCorrection(db,actor,id){
 const doc=await db.applicationDoc.findUnique({where:{id},include:correctionInclude});
 if(!doc)fail('Application not found.',404);
 assertCorrectionScope(actor,doc);return doc;
}
export async function performCorrection(db,actor,id,input){
 if(typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>1000)fail('Provide a correction reason (10–1000 characters).',400);
 if(!['ratings','documents','resubmit','rollback'].includes(input.kind))fail('Invalid correction type.',400);
 const context=await loadCorrection(db,actor,id);
 return db.$transaction(async tx=>{
  // Same event-first lock order as application creation/examination preparation.
  await tx.$queryRawUnsafe('SELECT id FROM `Event` WHERE id = ? FOR UPDATE',context.eventUser.eventId);
  await tx.$queryRawUnsafe('SELECT id FROM `ApplicationDoc` WHERE id = ? FOR UPDATE',id);
  await tx.$queryRawUnsafe('SELECT id FROM `EventUser` WHERE id = ? FOR UPDATE',context.eventUserId);
  await tx.$queryRawUnsafe('SELECT id FROM `AppRating` WHERE applicationDocId = ? ORDER BY id FOR UPDATE',id);
  await tx.$queryRawUnsafe('SELECT p.id FROM `PracticalTest` p JOIN `AppRating` r ON r.id=p.appRatingId WHERE r.applicationDocId = ? ORDER BY p.id FOR UPDATE',id);
  await tx.$queryRawUnsafe('SELECT id FROM `ProposalLetter` WHERE applicationDocId = ? ORDER BY id FOR UPDATE',id);
  const doc=await loadCorrection(tx,actor,id);assertNoProgress(doc);
  if(doc.eventUser.eventId!==context.eventUser.eventId)fail('Event assignment changed. Reload before correcting.');
  if(input.version!==doc.updatedAt.toISOString())fail('Application changed. Reload before correcting.');
  const before=auditView(doc),event=doc.eventUser.event;
  const registered=await tx.status.findFirst({where:{status:'REGISTERED',deletedAt:null}});
  if(!registered)fail('REGISTERED status is not configured.');
  const action=async(letter,verb,content)=>tx.proposalLetterAction.create({data:{letterId:letter.id,actorNik:actor.nik,action:verb,revision:letter.revision,reason:input.reason.trim(),content}});
  if(input.kind==='rollback'){
   const audit=await tx.applicationCorrectionAudit.findFirst({where:{applicationDocId:id},orderBy:{id:'desc'}});
   if(!audit||audit.kind==='rollback'||canonical(audit.after)!==canonical(before))fail('Records changed since the last correction; rollback requires manual review.');
   const previous=audit.before;
   for(const row of doc.appRatings.filter(r=>!previous.ratings.some(old=>old.id===r.id))){
    await tx.practicalTest.updateMany({where:{appRatingId:row.id},data:{deletedAt:new Date()}});
    await tx.appRating.update({where:{id:row.id},data:{deletedAt:new Date()}});
    if(row.proposalLetter){
     const letter=await tx.proposalLetter.update({where:{id:row.proposalLetter.id},data:{status:'RETURNED',validatedAt:null}});
     await action(letter,'ADMIN_ROLLED_BACK',letter.content);
    }
   }
   for(const row of previous.ratings){
    if(!row.proposal)continue;
    const p=row.proposal;
    const letter=await tx.proposalLetter.update({where:{id:p.id},data:{status:p.status,revision:p.revision,content:p.content,validatedAt:p.validatedAt?new Date(p.validatedAt):null}});
    await action(letter,'ADMIN_ROLLED_BACK',p.content);
   }
   await tx.applicationDoc.update({where:{id},data:{statusId:previous.statusId,rating:previous.rating,licenseId:previous.licenseId,logbookUserId:previous.logbookUserId,medexId:previous.medexId,ielpId:previous.ielpId}});
   if(previous.verification)await tx.verification.update({where:{id:previous.verification.id},data:{isValid:previous.verification.isValid}});
  }else if(input.kind==='ratings'){
   const ids=input.ratingIds;
   if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(ids).size!==ids.length)fail('Select distinct missing ratings.',400);
   const allowed=event.sector.subBranchUnitRatings.filter(x=>x.rating&&!x.rating.deletedAt).map(x=>x.ratingId);
   if(ids.some(x=>!allowed.includes(x)||doc.appRatings.some(r=>r.ratingId===x)))fail('Only missing active event-sector ratings may be added.');
   const members=await tx.groupMember.findMany({where:{member:doc.userNik,deletedAt:null,group:{eventId:event.id,deletedAt:null}}});
   if(members.length!==1)fail('Participant must have exactly one active checker group.');
   const member=members[0];
   const assignment=await getApplicationAssignment(tx,{eventId:event.id,memberNik:doc.userNik,groupMemberId:member.id,branchUnitId:actor.branchUnitId,ratings:[...doc.appRatings.filter(r=>!r.deletedAt).map(r=>({ratingId:r.ratingId})),...ids.map(ratingId=>({ratingId}))]});
   const letters=doc.appRatings.filter(r=>!r.deletedAt).map(r=>r.proposalLetter).filter(Boolean);
   const supervisors=[...new Set(letters.map(l=>l.supervisorNik))];
   if(supervisors.length!==1)fail('Assign one consistent Supervisor through the normal proposal workflow first.');
   const supervisor=await tx.user.findFirst({where:{nik:supervisors[0],deletedAt:null,branchUnitId:actor.branchUnitId,userRoles:{some:{deletedAt:null,roles:{role:'SUPERVISOR',deletedAt:null}}}}});
   if(!supervisor||supervisor.nik===doc.userNik)fail('Existing Supervisor is not eligible.');
   const locked=await tx.eventConfigurationVersion.findFirst({where:{eventId:event.id,lockedAt:{not:null}},orderBy:{version:'desc'}});
   if(locked&&ids.some(x=>!locked.snapshot.sector?.subBranchUnitRatings?.some(r=>r.ratingId===x)))fail('A missing rating is not in the locked event configuration.');
   for(const ratingId of ids){
    const checkers=assignment.checkersByRating.get(ratingId);
    if(checkers?.length!==1)fail('Exactly one qualified responsible checker is required for each added rating.');
    const row=await tx.appRating.create({data:{applicationDocId:id,ratingId,statusId:registered.id,controlHour:null}});
    for(const kindOfPracticalId of [event.isPractical?1:null,event.isSimulator?2:null].filter(Boolean))await tx.practicalTest.create({data:{appRatingId:row.id,groupMemberId:member.id,checkerGroupId:checkers[0].id,kindOfPracticalId}});
    const content=snapshot({...row,rating:event.sector.subBranchUnitRatings.find(r=>r.ratingId===ratingId).rating,applicationDoc:doc});
    const letter=await tx.proposalLetter.create({data:{applicationDocId:id,appRatingId:row.id,supervisorNik:supervisor.nik,status:'PENDING',content}});
    await action(letter,'ADMIN_RATING_ADDED',content);
   }
   await tx.applicationDoc.update({where:{id},data:{rating:JSON.stringify([...doc.appRatings.filter(r=>!r.deletedAt).map(r=>r.rating.rating),...ids.map(x=>event.sector.subBranchUnitRatings.find(r=>r.ratingId===x).rating.rating)]),statusId:registered.id}});
  }else if(input.kind==='documents'){
   const selections=input.documents;
   if(!selections||typeof selections!=='object'||Array.isArray(selections)||!Object.keys(selections).length||Object.keys(selections).some(x=>!documentFields[x]))fail('Select supported application documents.',400);
   const changes={};
   for(const [key,value] of Object.entries(selections)){
    if(!Number.isSafeInteger(value)||value<1)fail('Invalid document selection.',400);
    const [model]=documentFields[key];
    const record=await tx[model].findFirst({where:{id:value,userNik:doc.userNik,deletedAt:null}});
    if(!record?.file)fail('Selected document has no file or does not belong to this member.');
    if(['medexId','ielpId'].includes(key)&&(!record.isConfirmed||record.verificationStatus!=='APPROVED'||!(record.expired&&record.expired>=new Date()||key==='ielpId'&&record.level==='6'&&!record.expired)))fail('Selected medical/IELP credential must be approved and valid.');
    if(doc[key]!==value)changes[key]=value;
   }
   if(!Object.keys(changes).length)fail('No document selection changed.');
   await tx.applicationDoc.update({where:{id},data:{...changes,statusId:registered.id}});
   // Shared attachments affect every rating; preserve the old signed snapshot in history.
   for(const r of doc.appRatings.filter(r=>!r.deletedAt&&r.proposalLetter)){
    const letter=await tx.proposalLetter.update({where:{id:r.proposalLetter.id},data:{status:'RETURNED',validatedAt:null}});
    await action(letter,'ADMIN_DOCUMENT_CORRECTED',r.proposalLetter.content);
   }
  }else{
   for(const type of ['license','logbook','medex','ielp']){
    const record=doc[type];
    if(!record?.file||record.deletedAt||record.userNik!==doc.userNik)fail('All four own active supporting attachments are required before resubmission.');
    if(['medex','ielp'].includes(type)&&(!record.isConfirmed||record.verificationStatus!=='APPROVED'||!(record.expired&&record.expired>=new Date()||type==='ielp'&&record.level==='6'&&!record.expired)))fail('Medical/IELP documents must be approved and valid before resubmission.');
   }
   const returned=doc.appRatings.filter(r=>!r.deletedAt&&r.proposalLetter?.status==='RETURNED');
   if(!returned.length)fail('No returned proposals to resubmit.');
   for(const r of returned){
    const content=snapshot({...r,applicationDoc:doc});
    const letter=await tx.proposalLetter.update({where:{id:r.proposalLetter.id},data:{status:'PENDING',revision:{increment:1},content,validatedAt:null}});
    await action(letter,'ADMIN_RESUBMITTED',content);
   }
   await tx.applicationDoc.update({where:{id},data:{statusId:registered.id}});
  }
  if(doc.verifications&&input.kind!=='rollback')await tx.verification.update({where:{id:doc.verifications.id},data:{isValid:false}});
  const after=await loadCorrection(tx,actor,id);
  await tx.applicationCorrectionAudit.create({data:{applicationDocId:id,actorNik:actor.nik,branchUnitId:Number(actor.branchUnitId),kind:input.kind,reason:input.reason.trim(),before,after:auditView(after)}});
  return {success:true,message:'Correction recorded. Validation and verification remain separate.'};
 },{timeout:30000});
}
