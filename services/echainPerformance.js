import {createCredentialSyncReceipt} from '../utils/credentialSyncReceipt.js';
import {liveEchainResult} from './echainLiveSync.js';
const failure=(message,status=502)=>Object.assign(new Error(message),{status});
export function performanceDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw failure('Invalid date in ECHAIN performance-check data. Please correct ECHAIN.');
 return value;
}
export function trustedPerformanceFile(value) {
 if(value==null||value==='')return null;
 const url=new URL(value);
 if(url.protocol!=='https:'||url.hostname!=='e-chain.airnavindonesia.co.id'||(url.port&&url.port!=='443')||url.username||url.password)throw failure('Performance-check file is not on the approved ECHAIN HTTPS host.');
 return url.href;
}
export const performanceReceiptData=data=>({note:data.note,licenseExpiredDate:data.licenseExpiredDate,fileName:data.fileName||null,fileUrl:data.fileUrl||null,fileMimeType:data.fileMimeType||null});
export function latestPerformance(records,nik) {
 if(!Array.isArray(records))throw failure('Invalid ECHAIN performance-check response.');
 const own=records.filter(row=>String(row?.persnum??'').trim()===nik);
 if(!own.length)throw failure('No performance-check record was found for your e-NIK in ECHAIN.',404);
 const ranked=own.map(row=>({row,date:performanceDate(row.tgl||row.start)})).sort((a,b)=>b.date.localeCompare(a.date));
 const newest=ranked.filter(item=>item.date===ranked[0].date).map(({row,date})=>{
  const released=performanceDate(row.start),expired=performanceDate(row.valid_to);
  if(expired<released)throw failure('ECHAIN performance-check expiry precedes its start date.');
  if(typeof row.rating!=='string'||!row.rating.trim()||row.rating.length>100)throw failure('The newest ECHAIN performance-check rating is missing or invalid.');
  if(row.tingkat!=null&&typeof row.tingkat!=='string')throw failure('Invalid ECHAIN performance-check level.');
  const rating=row.rating.trim();const rawLevel=(row.tingkat||'').trim();
  const level=['','-','0','N/A','NA','NULL'].includes(rawLevel.toUpperCase())?null:rawLevel;
  if(level&&level.length>50)throw failure('Invalid ECHAIN performance-check level.');
  const fileUrl=trustedPerformanceFile(row.file_rating_performance);
  const note=`Performance Check ${rating} | ${date}${level?` | ${level}`:''}`;
  if(note.length>150)throw failure('The newest performance-check description is too long.');
  return {note,licenseExpiredDate:expired,released,testDate:date,rating,level,
   fileUrl,fileName:fileUrl?decodeURIComponent(new URL(fileUrl).pathname.split('/').pop()||'performance-check'):null,fileMimeType:null};
 });
 return [...new Map(newest.map(data=>[JSON.stringify(data),data])).values()];
}
export function performanceReview(records,nik) {
 return {success:true,records:records.map(data=>({data,syncReceipt:createCredentialSyncReceipt({type:'LICENSE_PERFORMANCE',nik,data:performanceReceiptData(data)})}))};
}
export async function requestPerformance(token,nik,fetcher=fetch) {
 const response=await fetcher('https://e-chain.airnavindonesia.co.id/api_echain/performa/performance',{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===401)return {code:'AIRNAV_TOKEN_REJECTED'};
 if(response.status===400||response.status===404)throw failure('No performance-check data is available in ECHAIN for your account.',404);
 if(!response.ok)throw failure('ECHAIN performance-check service is unavailable.');
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw failure('ECHAIN performance-check response exceeded the allowed size.');chunks.push(chunk);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('Invalid ECHAIN performance-check response.');}
 if(body.responseStatus!==200)throw failure('ECHAIN returned an unsuccessful performance-check response.');
 return {records:latestPerformance(body.data,nik)};
}
export async function syncLivePerformance(req,res) {
 try{const result=await liveEchainResult(req,requestPerformance);return res.json(performanceReview(result.records,req.user.nik));}
 catch(error){return res.status(error.status||502).json({success:false,message:error.status?error.message:'Unable to fetch ECHAIN performance-check data.'});}
}
