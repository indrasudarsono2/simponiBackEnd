import { createTokenVault } from './echainTokenVault.js';
import { parseCookies } from '../middleware/cookies.js';

const vault = () => createTokenVault('/run/performa-echain-tokens',process.env.JWT_SECRET);
const fail = () => Object.assign(new Error('AirNav authorization expired or unavailable. Please sign in through AirNav again.'),{status:409});
export const eligible = (user) => process.env.ECHAIN_USER_PREVIEW_ENABLED === 'true' && user?.authenticationType === 'AIRNAV_SSO' && typeof user.nik === 'string' && !!user.nik.trim();

export async function saveAirnavTokens(user, accessToken, csrf, payload={}) {
  if(!eligible(user)||!csrf||typeof accessToken!=='string') return;
  try {
    await vault().write(user.nik,csrf,{
      accessToken, refreshToken: typeof payload.refreshToken==='string'?payload.refreshToken:null,
      accessExpires:Date.now()+((Number.isFinite(payload.expiresIn)&&payload.expiresIn>0)?payload.expiresIn:60)*1000,
      refreshExpires:Date.parse(payload.refreshTokenExpiresAt)||0,
      sessionExpires:Date.now()+3*60*60*1000,
    });
  } catch { console.warn('ECHAIN authorization storage unavailable; normal login continues'); }
}
export async function clearAirnavTokens(req) {
  const cookies=parseCookies(req.headers?.cookie);
  // logout is authenticated by the router; never trust an arbitrary body NIK.
  if(req.user?.nik&&cookies.csrf_token) { const store=vault(); await store.withLock(req.user.nik,cookies.csrf_token,()=>store.remove(req.user.nik,cookies.csrf_token)); }
}

export async function refreshTokens(value,nik,fetcher=fetch) {
  if(!value.refreshToken || !value.refreshExpires || value.refreshExpires<=Date.now()) throw fail();
  const base='https://auth.airnavindonesia.co.id/v2';
  const response=await fetcher(`${base}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({refreshToken:value.refreshToken}),redirect:'error',signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>null);
  const data=payload?.data;
  if(!response.ok||typeof data?.accessToken!=='string'||typeof data?.refreshToken!=='string'||!Number.isFinite(data.expiresIn)||data.expiresIn<=0||!Number.isFinite(Date.parse(data.refreshTokenExpiresAt))) throw fail();
  // Verify refreshed identity and application server-side, never trust token decoding.
  const info=await fetcher(`${base}/sso/userinfo`,{headers:{Authorization:`Bearer ${data.accessToken}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  const identityBody=await info.json().catch(()=>null);
  const identity=identityBody?.data||identityBody;
  if(!info.ok||String(identity?.employee_no).trim()!==nik||identity?.application?.client_id!==process.env.AIRNAV_CLIENT_ID) throw fail();
  return {...value,accessToken:data.accessToken,refreshToken:data.refreshToken,accessExpires:Date.now()+data.expiresIn*1000,refreshExpires:Date.parse(data.refreshTokenExpiresAt)};
}

export async function liveEchainResult(req,requestData) {
  if(!eligible(req.user)) throw Object.assign(new Error('ECHAIN sync is available only for AirNav SSO accounts.'),{status:403});
  const csrf=parseCookies(req.headers?.cookie).csrf_token;
  if(!csrf) throw fail();
  const store=vault(); const nik=req.user.nik;
  return store.withLock(nik,csrf,async()=>{
    let value;
    try { value=await store.read(nik,csrf); } catch { await store.remove(nik,csrf); throw fail(); }
    let refreshed=false;
    if(value.accessExpires<=Date.now()+30000) {
      try { value=await refreshTokens(value,nik); await store.write(nik,csrf,value); refreshed=true; }
      catch { await store.remove(nik,csrf); throw fail(); }
    }
    let result=await requestData(value.accessToken,nik);
    if(result.code==='AIRNAV_TOKEN_REJECTED'&&!refreshed) {
      try { value=await refreshTokens(value,nik); await store.write(nik,csrf,value); }
      catch { await store.remove(nik,csrf); throw fail(); }
      result=await requestData(value.accessToken,nik);
    }
    if(result.code==='AIRNAV_TOKEN_REJECTED') {await store.remove(nik,csrf);throw fail();}
    return result;
  });
}
