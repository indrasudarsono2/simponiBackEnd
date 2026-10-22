// Integration gate for disposable preflight databases only. Never run on simponi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const url = new URL(process.env.DATABASE_URL || 'mysql://invalid@localhost/invalid');
if (!/^\/simponi_securityclone_[a-f0-9]{12}$/.test(url.pathname) || url.hostname !== '127.0.0.1') {
  throw new Error('This integration test requires an isolated simponi_securityclone_* database');
}
const { default: prisma } = await import('../lib/prisma.js');
const { DatabaseRateLimitStore } = await import('../security/databaseRateLimitStore.js');

test('two independent backend processes share counters on this MariaDB version', async () => {
  const worker = `
    import prisma from './lib/prisma.js';
    import {DatabaseRateLimitStore} from './security/databaseRateLimitStore.js';
    const store=new DatabaseRateLimitStore('preflight-processes');store.init({windowMs:60000});
    try{await Promise.all(Array.from({length:20},()=>store.increment('isolated-client')));}
    finally{await prisma.$disconnect();}
  `;
  const id = new DatabaseRateLimitStore('preflight-processes').id('isolated-client');
  try {
    await prisma.$executeRaw`DELETE FROM ApiRateLimitBucket WHERE id = ${id}`;
    const launch = () => new Promise((resolve,reject) => {
      const child=spawn(process.execPath,['--input-type=module','-e',worker],{env:process.env,stdio:['ignore','ignore','pipe']});
      let message='';child.stderr.on('data',chunk=>{message+=chunk});
      child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(message)));
    });
    await Promise.all([launch(),launch()]);
    const rows=await prisma.$queryRaw`SELECT totalHits FROM ApiRateLimitBucket WHERE id = ${id}`;
    assert.equal(Number(rows[0].totalHits),40);
    await prisma.$executeRaw`UPDATE ApiRateLimitBucket SET resetAt = ${new Date('2000-01-01')} WHERE id = ${id}`;
    const store=new DatabaseRateLimitStore('preflight-processes');store.init({windowMs:60000});
    assert.equal((await store.increment('isolated-client')).totalHits,1);
  } finally { await prisma.$disconnect(); }
});
