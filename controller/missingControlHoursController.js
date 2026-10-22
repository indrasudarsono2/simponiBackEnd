import prisma from '../lib/prisma.js';
import {ownHoursDocument,completeMissingHours,isBlankHours} from '../services/missingControlHours.js';
const handler=fn=>async(req,res)=>{try{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Invalid application.'});return res.json(await fn(req,id));}catch(e){if(!e.status)console.error('Missing hours failed',e);return res.status(e.status||500).json({message:e.status?e.message:'Unable to process control hours.'});}};
export const get=handler(async(req,id)=>{const doc=await ownHoursDocument(prisma,req.user,id);return {id:doc.id,number:doc.number,version:doc.updatedAt.toISOString(),ratings:doc.appRatings.filter(r=>isBlankHours(r.controlHour)).map(r=>({id:r.id,rating:r.rating.rating}))};});
export const save=handler((req,id)=>completeMissingHours(prisma,req.user,id,req.body));
