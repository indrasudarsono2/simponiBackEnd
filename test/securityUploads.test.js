import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {uploadLicense} from '../lib/multer.js';

test('actual multipart parsing sanitizes rich fields and rejects excessive fields',async()=>{
  const app=express();
  app.post('/upload',uploadLicense.any(),(req,res)=>res.json(req.body));
  app.use((err,_req,res,_next)=>res.status(400).json({code:err.code}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/upload`;
    const data=new FormData();data.append('remark','<img src=x onerror=alert(1)><p>Valid</p>');
    const valid=await fetch(url,{method:'POST',body:data});assert.equal(valid.status,200);
    assert.equal((await valid.json()).remark,'<p>Valid</p>');
    const excessive=new FormData();for(let i=0;i<101;i++)excessive.append('field'+i,'value');
    const blocked=await fetch(url,{method:'POST',body:excessive});assert.equal(blocked.status,400);
    assert.equal((await blocked.json()).code,'LIMIT_FIELD_COUNT');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
