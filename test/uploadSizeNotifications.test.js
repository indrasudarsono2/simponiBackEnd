import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { uploadLicense, uploadIelp, uploadMedex, uploadCompetence, uploadlogbookUser, uploadMultipleChoice } from '../lib/multer.js';

test('document and mandatory question oversized uploads return 413 with the correct limit and toast message', async () => {
  const app = express();
  const cases = [['license',uploadLicense,2],['ielp',uploadIelp,2],['medex',uploadMedex,2],['competence',uploadCompetence,2],['logbook',uploadlogbookUser,4],['mats',uploadMultipleChoice,2]];
  for (const [name, upload] of cases) app.post('/'+name, upload.any(), (_req,res)=>res.json({ok:true}));
  app.use((err,_req,res,_next)=>res.status(400).json({message:err.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try {
    for (const [name,,mb] of cases) {
      const body=new FormData();body.append('file',new Blob([Buffer.alloc(mb*1024*1024+1)],{type:'image/png'}),'oversized.png');
      const response=await fetch(`http://127.0.0.1:${server.address().port}/${name}`,{method:'POST',body});
      assert.equal(response.status,413,name);
      const error=await response.json();assert.equal(error.code,'LIMIT_FILE_SIZE');
      assert.equal(error.maxFileSize,mb*1024*1024);assert.match(error.message,new RegExp(`Maximum file size is ${mb} MB`));assert.equal(error.statusMessage,error.message);
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
