import crypto from 'node:crypto';
import { saveAirnavTokens, liveEchainResult } from './echainLiveSync.js';

const ACCOUNT = '10011523';
const DIRECTORY = '/run/performa-echain-preview';
const ENDPOINT = 'https://e-chain.airnavindonesia.co.id/api_echain/performa/user';
const fields = ['persnum', 'nik', 'nama', 'kelamin', 'tempat_lahir', 'tgl_lahir', 'pendidikan', 'id_lokasi', 'lokasi', 'id_lokasi_kedudukan', 'lokasi_kedudukan', 'id_lokasi_induk', 'lokasi_induk', 'id_jabatan', 'jabatan', 'fungsi', 'sts_karyawan', 'level_jabatan', 'tmt_kerja_airnav', 'tmt_jabatan', 'masa_kerja_efektif_th', 'masa_kerja_efektif_bl', 'masa_kerja_jabatan_th', 'masa_kerja_jabatan_bl', 'no_hp', 'email_pribadi', 'email_kantor'];
const enabled = () => process.env.ECHAIN_USER_PREVIEW_ENABLED === 'true';
export const previewFilename = (nik, csrf) => `${DIRECTORY}/${crypto.createHash('sha256').update(nik + ':' + csrf).digest('hex')}.json`;
export const canSyncEchain = (user) => enabled() && user?.authenticationType === 'AIRNAV_SSO' && typeof user.nik === 'string' && !!user.nik.trim();
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

export function ownRecord(data, nik) {
  if (!Array.isArray(data)) return null;
  // PERFORMA's login ID is employee_no/e-NIK. Do not confuse it with NIK AirNav.
  const matches = data.filter(row => row && String(row.persnum).trim() === nik);
  if (matches.length !== 1) return null;
  return Object.fromEntries(fields.filter(f => typeof matches[0][f] === 'string' || matches[0][f] === null).map(f => [f, matches[0][f]]));
}

export async function requestUserPreview(accessToken, nik, fetcher = fetch) {
  try {
    const response = await fetcher(ENDPOINT, {headers: {Authorization: `Bearer ${accessToken}`, Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(10000)});
    // Limit response size and never expose upstream bodies/errors or other employees.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1024 * 1024) return {code: 'RESPONSE_TOO_LARGE'};
      chunks.push(Buffer.from(chunk));
    }
    if (!response.ok) return {code: response.status === 401 ? 'AIRNAV_TOKEN_REJECTED' : response.status === 400 ? 'USER_NOT_FOUND_OR_DATA_NULL' : 'ECHAIN_HTTP_ERROR', upstreamStatus: response.status};
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const record = ownRecord(body.data, nik);
    return record ? {code: 'SUCCESS', data: record} : {code: 'IDENTITY_NOT_UNIQUELY_MATCHED'};
  } catch { return {code: 'ECHAIN_UNAVAILABLE_OR_INVALID_RESPONSE'}; }
}

export async function captureEchainPreview(user, accessToken, csrf, payload) {
  await saveAirnavTokens(user, accessToken, csrf, payload);
}

export async function loadEchainPreview(req) {
  return liveEchainResult(req, requestUserPreview);
}

export async function showEchainPreview(req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  if (!enabled() || req.user?.nik !== ACCOUNT || req.user?.authenticationType !== 'AIRNAV_SSO' || !(req.user?.roleNames || []).some(r => String(r).trim().toUpperCase() === 'GENERAL ADMIN')) return res.status(403).json({message:'Preview is not available for this account.'});
  let result;
  try {
    result = await loadEchainPreview(req);
  } catch (error) { return res.status(error.status || 409).json({message:error.message}); }
  return res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>ECHAIN DATA USER preview</title><h1>ECHAIN DATA USER — read-only test</h1><p>No PERFORMA database records were modified. Match uses persnum (e-NIK).</p><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></html>`);
}
