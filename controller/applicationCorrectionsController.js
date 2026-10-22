import prisma from '../lib/prisma.js';
import {isCheckerAdmin} from '../utils/checkerAdminScope.js';
import {loadCorrection,performCorrection,assertNoProgress} from '../services/applicationCorrections.js';
const scope=user=>{
 if(!isCheckerAdmin(user)||!Number.isSafeInteger(Number(user.branchUnitId))||Number(user.branchUnitId)<1)throw Object.assign(new Error('Checker Admin branch unit is required.'),{status:403});
 return {deletedAt:null,userNik:{not:user.nik},user:{branchUnitId:Number(user.branchUnitId),deletedAt:null},eventUser:{deletedAt:null,event:{deletedAt:null,sector:{branchUnitId:Number(user.branchUnitId)},remarkDoc:{remark:'PERPANJANGAN'}}}};
};
const handler=fn=>async(req,res)=>{try{scope(req.user);return res.json(await fn(req));}catch(e){if(!e.status)console.error('Application correction failed',e);return res.status(e.status||500).json({message:e.status?e.message:'Unable to process correction.'});}};
const idOf=req=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Invalid application ID.'),{status:400});return id;};
export const list=handler(async req=>{
 const q=String(req.query.search||'').trim().slice(0,100);
 return prisma.applicationDoc.findMany({where:{...scope(req.user),...(q?{OR:[{number:{contains:q}},{user:{name:{contains:q}}},{userNik:{contains:q}}]}:{})},take:100,orderBy:{id:'desc'},select:{id:true,number:true,userNik:true,user:{select:{name:true}},eventUser:{select:{event:{select:{event:true}}}}}});
});
export const detail=handler(async req=>{
 const d=await loadCorrection(prisma,req.user,idOf(req));let lockedReason=null;try{assertNoProgress(d);}catch(e){lockedReason=e.message;}
 const options={};
 for(const [key,model] of [['licenseId','license'],['logbookUserId','logBookUser'],['medexId','medex'],['ielpId','ielp']])options[key]=await prisma[model].findMany({where:{userNik:d.userNik,deletedAt:null,file:{not:null}},select:{id:true,file:true,createdAt:true},orderBy:{id:'desc'}});
 return {id:d.id,number:d.number,member:d.user.name,version:d.updatedAt.toISOString(),lockedReason,selections:{licenseId:d.licenseId,logbookUserId:d.logbookUserId,medexId:d.medexId,ielpId:d.ielpId},options,
 ratings:d.appRatings.filter(r=>!r.deletedAt).map(r=>({id:r.ratingId,name:r.rating.rating,hours:r.controlHour,proposal:r.proposalLetter?.status})),
 availableRatings:d.eventUser.event.sector.subBranchUnitRatings.filter(r=>!r.rating.deletedAt&&!d.appRatings.some(a=>a.ratingId===r.ratingId)).map(r=>({id:r.ratingId,name:r.rating.rating})),
 history:await prisma.applicationCorrectionAudit.findMany({where:{applicationDocId:d.id},select:{id:true,actorNik:true,kind:true,reason:true,createdAt:true},orderBy:{id:'desc'},take:30})};
});
export const correct=handler(req=>performCorrection(prisma,req.user,idOf(req),req.body));
