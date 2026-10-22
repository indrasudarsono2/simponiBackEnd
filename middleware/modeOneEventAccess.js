import prisma from '../lib/prisma.js';
import { hasExtendedAccess } from '../services/examAccessExtension.js';

export async function checkModeOneEventAccess(req,res,next) {
  try {
    const id=Number(req.body.appRatingId),eventId=Number(req.body.eventId);
    if (![id,eventId].every(n=>Number.isSafeInteger(n)&&n>0)) return res.status(400).json({message:'Valid examination and rating IDs are required.'});
    const rating=await prisma.appRating.findFirst({where:{id,deletedAt:null,applicationDoc:{deletedAt:null,userNik:req.user.nik,statusId:2,briefingDate:{not:null},eventUser:{deletedAt:null,eventId,userNik:req.user.nik,event:{deletedAt:null}}}},
      include:{examAccessExtensions:{orderBy:{id:'desc'},take:1},applicationDoc:{include:{eventUser:{include:{event:true,attendaces:{include:{room:true}}}}}}}});
    if (!rating) return res.status(404).json({message:'Verified and briefed examination not found for this account.'});
    const p=rating.applicationDoc.eventUser,event=p.event,room=p.attendaces?.room,now=new Date();
    if (event.theoryMode!=='MODE_1') return res.status(409).json({message:'Use the shared Mode 2 examination session.'});
    if (!room || room.deletedAt || p.attendaces.deletedAt || !room.startDate || !room.finishDate) return res.status(409).json({message:'The examination room is not assigned.'});
    if ((event.startDate && now<event.startDate) || now<room.startDate) return res.status(409).json({message:'The examination period has not started.'});
    if (((event.finishDate && now>event.finishDate) || now>room.finishDate) && !hasExtendedAccess(rating,now)) return res.status(409).json({message:'The event access period has expired. Ask Checker Admin for an individual access extension.'});
    return next();
  }catch(error){return res.status(500).json({message:'Unable to check examination access.'});}
}
