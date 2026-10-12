import prisma from '../lib/prisma.js';
import { loadEchainPreview } from '../services/echainUserPreview.js';
import { mapEchainProfile } from '../services/echainProfileMapping.js';

export async function syncProfileFromEchain(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await loadEchainPreview(req);
    if (result.code !== 'SUCCESS') return res.status(409).json({success:false,message:'ECHAIN data is unavailable. Sign in through AirNav again or retry later.',error:{code:result.code}});
    const genders = await prisma.gender.findMany({where:{deletedAt:null},select:{id:true,gender:true}});
    const data = await mapEchainProfile(result.data, req.user.nik, genders);
    return res.json({success:true,message:'ECHAIN data loaded. Review and save to update your profile.',data});
  } catch (error) {
    return res.status(error.status || 502).json({success:false,message:error.status ? error.message : 'Unable to prepare ECHAIN profile data.'});
  }
}
