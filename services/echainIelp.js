import { normalizeIelpValidity } from '../utils/ielpValidity.js';
import { createCredentialSyncReceipt } from '../utils/credentialSyncReceipt.js';
import { liveEchainResult } from './echainLiveSync.js';

const failure = (message, status = 502) => Object.assign(new Error(message), { status });
export function dateOnly(value, nullable = false) {
  if (nullable && (value == null || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value) throw failure('Invalid date in ECHAIN IELP data. Please correct the record in ECHAIN.');
  return value;
}
export function trustedIelpFile(value) {
  if (value == null || value === '') return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'e-chain.airnavindonesia.co.id' || (url.port && url.port !== '443') || url.username || url.password) throw failure('The IELP file address is not on the approved ECHAIN HTTPS host.');
  return url.href;
}
export const ielpReceiptData = (data) => ({
  institution: (data.institutionMissing === true || data.institutionMissing === 'true') ? '' : data.institution, level: data.level, released: data.released, expired: data.expired || null,
  fileName: data.fileName || null, fileUrl: data.fileUrl || null, fileUrlExpiresAt: data.fileUrlExpiresAt || null,
  fileMimeType: data.fileMimeType || null, fileSizeBytes: data.fileSizeBytes == null ? null : Number(data.fileSizeBytes),
  ...(data.expirySource ? { expirySource: data.expirySource, echainExpired: data.echainExpired || null, calculatedExpired: data.calculatedExpired || null } : {}),
  ...((data.institutionMissing === true || data.institutionMissing === 'true') ? {institutionMissing:true} : {}),
});
export function mapLatestIelp(records, nik) {
  if (!Array.isArray(records)) throw failure('Invalid ECHAIN IELP response.');
  const own = records.filter(row => String(row?.persnum ?? '').trim() === nik);
  if (!own.length) throw failure('No IELP record was found for your e-NIK in ECHAIN.', 404);
  const ranked = own.map(row => ({ row, date: dateOnly(row.tgl || row.start) })).sort((a,b) => b.date.localeCompare(a.date));
  const latest = ranked.filter(item => item.date === ranked[0].date);
  if (latest.some(item => JSON.stringify(item.row) !== JSON.stringify(latest[0].row))) throw failure('Several different IELP records share the latest test date. Please resolve this in ECHAIN.');
  const row = latest[0].row;
  const level = String(row.level || '').trim();
  const released = dateOnly(row.start);
  const expired = dateOnly(row.valid_to, level === '6');
  if (expired && expired < released) throw failure('ECHAIN IELP expiry is before its released date. Please correct ECHAIN.');
  const institution = typeof row.lembaga === 'string' ? row.lembaga.trim() : '';
  if ((row.lembaga != null && typeof row.lembaga !== 'string') || (institution.length > 0 && institution.length < 2) || institution.length > 150) throw failure('The ECHAIN IELP institution is invalid.');
  let validity;
  try { validity = normalizeIelpValidity({level, released}); } catch { throw failure('The ECHAIN IELP level must be 4, 5 or 6.'); }
  const fileUrl = trustedIelpFile(row.file_rating_ielp);
  return { institution, level, released, expired, rater: null, fileUrl,
    fileName: fileUrl ? decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() || 'ielp') : null,
    fileUrlExpiresAt: null, fileMimeType: null, fileSizeBytes: null,
    echainExpired: expired, calculatedExpired: validity.expired?.toISOString().slice(0,10) || null,
    testDate: latest[0].date, ...(institution === '' ? {institutionMissing:true} : {}) };
}
export function makeIelpReview(data, nik) {
  const syncReceipts = {};
  for (const expirySource of ['ECHAIN','PERFORMA']) {
    syncReceipts[expirySource] = createCredentialSyncReceipt({type:'IELP',nik,data:ielpReceiptData({...data,expirySource,expired:expirySource==='ECHAIN'?data.echainExpired:data.calculatedExpired})});
  }
  return {success:true, data, syncReceipts};
}
export async function requestIelp(token, nik, fetcher = fetch) {
  const response = await fetcher('https://e-chain.airnavindonesia.co.id/api_echain/performa/ielp', {
    method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
  });
  if (response.status === 401) return {code:'AIRNAV_TOKEN_REJECTED'};
  if (response.status === 400 || response.status === 404) throw failure('No IELP data is available in ECHAIN for your account.',404);
  if (!response.ok) throw failure('ECHAIN IELP is currently unavailable. Please try again later.');
  let size=0; const chunks=[];
  for await (const chunk of response.body) {size+=chunk.length;if(size>1024*1024) throw failure('ECHAIN IELP response exceeded the allowed size.');chunks.push(chunk);}
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw failure('Invalid ECHAIN IELP response.');}
  return mapLatestIelp(body.data,nik);
}
export async function syncLiveIelp(req,res) {
  try { return res.json(makeIelpReview(await liveEchainResult(req,requestIelp),req.user.nik)); }
  catch(error) { return res.status(error.status || 502).json({success:false,message:error.status?error.message:'Unable to fetch ECHAIN IELP. Please try again later.'}); }
}
export function selectedIelpValidity(data) {
  const validity=normalizeIelpValidity(data);
  if (!['ECHAIN','PERFORMA'].includes(data.expirySource)) throw failure('Choose the correct expiry date before saving.',400);
  const selected=data.expirySource==='ECHAIN'?data.echainExpired:data.calculatedExpired;
  if ((data.expired || null)!==(selected || null) || (data.calculatedExpired || null)!==(validity.expired?.toISOString().slice(0,10)||null)) throw failure('The selected IELP expiry is invalid. Please sync again.',400);
  validity.expired=selected?new Date(`${dateOnly(selected)}T23:59:59.999Z`):null;
  return validity;
}
