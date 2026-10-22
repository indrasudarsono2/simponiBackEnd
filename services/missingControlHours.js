const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export const isBlankHours=value=>value==null||String(value).trim()==='';
export function validateHoursEntries(ratings,entries){
 if(!Array.isArray(entries)||!entries.length)fail('Enter the missing control hours.',400);
 const missing=ratings.filter(r=>isBlankHours(r.controlHour));
 if(entries.length!==missing.length||new Set(entries.map(x=>x?.id)).size!==entries.length)fail('Complete each missing rating exactly once.',400);
 for(const entry of entries){
  if(!missing.some(r=>r.id===entry?.id)||typeof entry.hours!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(entry.hours.trim()))fail('Only blank ratings may be completed, using non-negative numeric hours (up to two decimal places).',400);
 }
 return entries.map(e=>({id:e.id,hours:e.hours.trim()}));
}
export async function ownHoursDocument(db,user,id){
 const doc=await db.applicationDoc.findFirst({where:{id,userNik:user.nik,deletedAt:null,eventUser:{deletedAt:null,event:{deletedAt:null,sector:{branchUnitId:Number(user.branchUnitId)}}}},include:{eventUser:true,appRatings:{where:{deletedAt:null},include:{rating:true,proposalLetter:true,finalScores:true,modeOneExamDrafts:true,practicalTests:true,theorySessionParticipants:true}},verifications:true}});
 if(!doc)fail('Your application document was not found.',404);
 return doc;
}
export async function completeMissingHours(db,user,id,body){
 const context=await ownHoursDocument(db,user,id);
 return db.$transaction(async tx=>{
  await tx.$queryRawUnsafe('SELECT id FROM `Event` WHERE id=? FOR UPDATE',context.eventUser.eventId);
  await tx.$queryRawUnsafe('SELECT id FROM `ApplicationDoc` WHERE id=? FOR UPDATE',id);
  await tx.$queryRawUnsafe('SELECT id FROM `AppRating` WHERE applicationDocId=? ORDER BY id FOR UPDATE',id);
  const doc=await ownHoursDocument(tx,user,id);
  if(body.version!==doc.updatedAt.toISOString())fail('Application changed. Reload before saving.');
  if(doc.appRatings.some(r=>r.finalScores.length||r.modeOneExamDrafts.length||r.practicalTests.some(p=>p.score!==null||p.file)||r.theorySessionParticipants.some(p=>p.joinedAt||p.questionSnapshot)))fail('Examination activity exists. Ask Checker Admin to review instead.');
  const entries=validateHoursEntries(doc.appRatings,body.hours);
  const before={statusId:doc.statusId,verificationValid:doc.verifications?.isValid??false,hours:doc.appRatings.map(r=>({id:r.id,hours:r.controlHour}))};
  for(const entry of entries){
   const rating=doc.appRatings.find(r=>r.id===entry.id);
   await tx.appRating.update({where:{id:entry.id},data:{controlHour:entry.hours}});
   if(rating.proposalLetter)await tx.proposalLetterAction.create({data:{letterId:rating.proposalLetter.id,actorNik:user.nik,action:'HOURS_COMPLETED',revision:rating.proposalLetter.revision,reason:'Applicant completed previously blank control hours; previous approval snapshot retained; no approval granted.',content:{...rating.proposalLetter.content,controlHour:entry.hours}}});
  }
  await tx.applicationDoc.update({where:{id},data:{updatedAt:new Date()}});
  await tx.applicationCorrectionAudit.create({data:{applicationDocId:id,actorNik:user.nik,branchUnitId:Number(user.branchUnitId),kind:'hours',reason:'Applicant completed missing control hours',before,after:{...before,hours:before.hours.map(r=>({id:r.id,hours:entries.find(e=>e.id===r.id)?.hours??r.hours}))}}});
  return {success:true,verified:doc.statusId===2,message:doc.statusId===2?'Hours saved. Return to the dashboard and submit your token again.':'Hours saved. Your application still requires its normal verification.'};
 });
}
