import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export function createTokenVault(directory, secret) {
  const key = crypto.createHash('sha256').update('echain-token-v1:' + secret).digest();
  const path = (nik, session) => `${directory}/${crypto.createHash('sha256').update(nik + ':' + session).digest('hex')}.json`;
  async function write(nik, session, value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify({...value,nik})),cipher.final()]);
    const target = path(nik,session);
    const temp = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    await fs.writeFile(temp,JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')}),{mode:0o600,flag:'wx'});
    await fs.rename(temp,target);
  }
  async function read(nik, session) {
    const raw = JSON.parse(await fs.readFile(path(nik,session),'utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(raw.iv,'base64'));
    decipher.setAuthTag(Buffer.from(raw.tag,'base64'));
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data,'base64')),decipher.final()]).toString());
    if (value.nik !== nik || !Number.isFinite(value.sessionExpires) || value.sessionExpires <= Date.now()) throw new Error('Session expired');
    return value;
  }
  async function remove(nik, session) { await fs.unlink(path(nik,session)).catch(()=>{}); }
  async function withLock(nik,session,action) {
    const lock=path(nik,session)+'.lock';
    let acquired=false;
    for(let attempt=0;attempt<120;attempt++) {
      try { await fs.mkdir(lock,{mode:0o700}); acquired=true; break; }
      catch(error) { if(error.code!=='EEXIST') throw error; await new Promise(resolve=>setTimeout(resolve,250)); }
    }
    if(!acquired) throw new Error('Session busy');
    // Never remove another process's lock: refresh tokens are single-use.
    try { return await action(); } finally { await fs.rmdir(lock); }
  }
  return {write,read,remove,withLock};
}
