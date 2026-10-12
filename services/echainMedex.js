import { createCredentialSyncReceipt } from '../utils/credentialSyncReceipt.js';
import { liveEchainResult } from './echainLiveSync.js';

const fail = (message, status=502) => Object.assign(new Error(message), {status});
const missing = value => value === true || value === 'true';
export function medexDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw fail('Invalid date in ECHAIN MEDEX. Please correct ECHAIN.');
  return value;
}
export function trustedMedexFile(value) {
  if (value == null || value === '') return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'e-chain.airnavindonesia.co.id' || (url.port && url.port !== '443') || url.username || url.password) throw fail('The MEDEX file is not on the approved ECHAIN HTTPS host.');
  return url.href;
}
export const medexReceiptData = data => ({
  institution: missing(data.institutionMissing) ? '' : data.institution,
  released: data.released, expired: data.expired,
  fileName: data.fileName || null, fileUrl: data.fileUrl || null, fileUrlExpiresAt: data.fileUrlExpiresAt || null,
  fileMimeType: data.fileMimeType || null, fileSizeBytes: data.fileSizeBytes == null ? null : Number(data.fileSizeBytes),
  ...(missing(data.institutionMissing) ? {institutionMissing:true} : {}),
  ...(data.examinerMissing !== undefined ? {examiner:missing(data.examinerMissing)?'':data.examiner, examinerMissing:missing(data.examinerMissing)} : {}),
});
export function latestMedexChoices(records, nik) {
  if (!Array.isArray(records)) throw fail('Invalid ECHAIN MEDEX response.');
  const own = records.filter(row => String(row?.persnum??'').trim()===nik);
  if (!own.length) throw fail('No MEDEX data was found for your e-NIK in ECHAIN.',404);
  const ranked = own.map(row=>({row,date:medexDate(row.tgl || row.start)})).sort((a,b)=>b.date.localeCompare(a.date));
  const choices = ranked.filter(item=>item.date===ranked[0].date).map(({row,date})=>{
    const released=medexDate(row.start), expired=medexDate(row.valid_to);
    if (expired<released) throw fail('ECHAIN MEDEX expiry is before its released date.');
    if (row.pemeriksa != null && typeof row.pemeriksa !== 'string') throw fail('Invalid ECHAIN MEDEX examiner.');
    const rawExaminer=(row.pemeriksa||'').trim();
    const examiner=['-','0','N/A','NA','NULL'].includes(rawExaminer.toUpperCase()) ? '' : rawExaminer;
    if (examiner && (examiner.length<2 || examiner.length>150)) throw fail('Invalid ECHAIN MEDEX examiner.');
    const fileUrl=trustedMedexFile(row.file_rating_medex);
    return {institution:'',institutionMissing:true,examiner,examinerMissing:!examiner,released,expired,testDate:date,
      fileUrl,fileName:fileUrl?decodeURIComponent(new URL(fileUrl).pathname.split('/').pop()||'medex'):null,
      fileUrlExpiresAt:null,fileMimeType:null,fileSizeBytes:null};
  });
  // Identical duplicates do not require multiple identical choices; differing latest records remain explicit.
  return [...new Map(choices.map(data=>[JSON.stringify(data),data])).values()];
}
export function medexReview(choices, nik) {
  return {success:true,records:choices.map(data=>({data,syncReceipt:createCredentialSyncReceipt({type:'MEDEX',nik,data:medexReceiptData(data)})}))};
}
export async function requestMedex(token,nik,fetcher=fetch) {
  const response=await fetcher('https://e-chain.airnavindonesia.co.id/api_echain/performa/medex',{
    method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
  });
  if (response.status===401) return {code:'AIRNAV_TOKEN_REJECTED'};
  if (response.status===400 || response.status===404) throw fail('No MEDEX data is available in ECHAIN for your account.',404);
  if (!response.ok) throw fail('ECHAIN MEDEX is currently unavailable.');
  let size=0; const chunks=[];
  for await (const chunk of response.body) {size+=chunk.length;if(size>1024*1024) throw fail('ECHAIN MEDEX response exceeded the allowed size.');chunks.push(chunk);}
  let body; try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw fail('Invalid ECHAIN MEDEX response.');}
  if (body.responseStatus!==200) throw fail('ECHAIN MEDEX returned an unsuccessful response.');
  return {choices:latestMedexChoices(body.data,nik)};
}
export async function syncLiveMedex(req,res) {
  try {const result=await liveEchainResult(req,requestMedex);return res.json(medexReview(result.choices,req.user.nik));}
  catch(error) {return res.status(error.status||502).json({success:false,message:error.status?error.message:'Unable to fetch ECHAIN MEDEX. Please try again later.'});}
}
