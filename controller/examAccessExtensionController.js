import prisma from '../lib/prisma.js';
import { validateExtension, theoryIsFinished } from '../services/examAccessExtension.js';
import { ensureDefaultRoom } from '../services/defaultModeOneRoom.js';

async function participant(db, req) {
  const eventId=Number(req.params.id), id=Number(req.params.eventUserId);
  if (![eventId,id].every(n=>Number.isSafeInteger(n)&&n>0) || !req.user.branchUnitId) throw Object.assign(new Error('Invalid event or participant.'),{status:400});
  const result=await db.eventUser.findFirst({
    where: { id, eventId, deletedAt: null,
      user: { deletedAt: null, branchUnitId: req.user.branchUnitId },
      event: { deletedAt: null, sector: { deletedAt: null, branchUnitId: req.user.branchUnitId } },
    },
    include: {
      event: true,
      user: { select: { nik: true, name: true } },
      applicationDocs: {
        where: { deletedAt: null },
        select: { id: true, appRatings: {
          where: { deletedAt: null },
          include: { rating: true, status: true, finalScores: { where: { deletedAt: null, isInvalidated: false }, orderBy: { id: 'desc' }, take: 1, select: { status: { select: { status: true } } } }, examAccessExtensions: { orderBy: { id: 'desc' }, take: 1 } },
        } },
      },
    },
  });
  if (!result) throw Object.assign(new Error('Assigned user not found in your branch unit.'),{status:404});
  return result;
}
export async function getExamAccess(req,res) {
  try {
    const p=await participant(prisma,req);
    res.json({event:p.event,user:p.user,ratings:p.applicationDocs.flatMap(d=>d.appRatings.map(r=>({id:r.id,rating:r.rating?.rating||'-',status:r.status?.status,applicationDocId:d.id,unfinished:!theoryIsFinished(r),extension:r.examAccessExtensions[0]||null})))});
  } catch(error){res.status(error.status||500).json({message:error.status?error.message:'Unable to load exam access.'});}
}
export async function extendExamAccess(req,res) {
  try {
    const result=await prisma.$transaction(async tx=>{
      const p=await participant(tx,req);
      const rating=p.applicationDocs.flatMap(d=>d.appRatings).find(r=>r.id===Number(req.body.appRatingId));
      if (!rating) throw Object.assign(new Error('Rating not found for this participant.'),{status:404});
      const data=validateExtension({rating,event:p.event,accessUntil:req.body.accessUntil,reason:req.body.reason});
      const saved=await tx.examAccessExtension.create({data:{appRatingId:rating.id,actorNik:req.user.nik,...data}});
      await ensureDefaultRoom(tx,p.id,{branchUnitId:req.user.branchUnitId,checkerNik:req.user.nik,allowExpired:true});
      return saved;
    },{isolationLevel:'Serializable'});
    res.status(201).json({success:true,extension:result});
  }catch(error){res.status(error.status||500).json({message:error.status?error.message:'Unable to extend access. Refresh and try again.'});}
}
