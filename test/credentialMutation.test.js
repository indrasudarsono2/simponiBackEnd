import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { assertCredentialUnlinked, credentialIsLinked, assertManualDeclaration, SELF_DECLARATION } from '../services/credentialPolicy.js';
import { normalizeIelpValidity } from '../utils/ielpValidity.js';
dayjs.extend(utc);

// Execute the real paired controller bodies against a transaction spy, without a database or e-Chain call.
for (const [type, cap] of [['medex','Medex'],['ielp','Ielp']]) {
  const source=fs.readFileSync(new URL(`../controller/${type}UserController.js`,import.meta.url),'utf8');
  const load=(name,next,deps)=>new Function(...Object.keys(deps),source.slice(source.indexOf(`const ${name} =`),source.indexOf(`const ${next} =`))+`; return ${name};`)(...Object.values(deps));
  for (const linked of [false,true]) test(`${type}: ${linked?'linked revision rejected':'unlinked manual revision immediately usable'}`,async()=>{
    const writes=[];const existing={id:7,userNik:'owner',file:'/uploads/old.pdf',source:'MANUAL',version:1};
    const model={findFirst:async()=>existing,create:async({data})=>{writes.push(['create',data]);return{id:8,...data};},update:async({data})=>{writes.push(['update',data]);return existing;}};
    const tx={applicationDoc:{findFirst:async()=>linked?{id:2}:null},[type]:model};
    const prisma={...tx,$transaction:async(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return fn(tx);}};
    const handler=load(`get${cap}ById`,`delete${cap}ById`,{prisma,assertCredentialUnlinked,assertManualDeclaration,SELF_DECLARATION,dayjs,normalizeIelpValidity,appendCredentialHistory:async()=>{}});
    const req={params:{id:'7'},user:{nik:'owner'},body:{institution:'Clinic',released:'2026-01-01',expired:'2027-01-01',examiner:'Doctor',rater:'Rater',level:'4',selfDeclared:'true'}};
    const res={status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
    await handler(req,res);
    assert.equal(res.code,linked?409:201);
    if(linked)assert.equal(writes.length,0);
    else {assert.equal(writes[0][1].verificationStatus,'APPROVED');assert.equal(writes[0][1].requestedCheckerNik,null);assert.equal(writes[0][1].verifiedAt,null);assert.equal(writes[0][1].isConfirmed,true);}
  });
  for (const linked of [false,true]) test(`${type}: e-Chain ${linked?'creates new row for linked evidence':'refreshes an unlinked match'}`,async()=>{
    const writes=[];const previous={id:7,rootVersionId:7,file:'/uploads/original.pdf'};
    const tx={applicationDoc:{findFirst:async()=>linked?{id:1}:null},[type]:{
      create:async({data})=>{writes.push(['create',data]);return{id:8,rootVersionId:8,...data};},
      update:async({data})=>{writes.push(['update',data]);return{...previous,...data};}
    }};
    const code=source.slice(source.indexOf('    let refreshedExisting = false;'),source.indexOf('    await appendCredentialHistory(prisma,',source.indexOf('    let refreshedExisting = false;')));
    const invoke=new Function('prisma','credentialIsLinked',`existing${cap}`,`${type}Data`,`return (async()=>{${code};return {record:${type},refreshedExisting};})()`);
    const result=await invoke({$transaction:async(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');return fn(tx);}},credentialIsLinked,previous,{institution:'Updated clinic'});
    assert.equal(writes[0][0],linked?'create':'update');assert.equal(result.record.id,linked?8:7);
    if(linked)assert.equal(writes[0][1].file,previous.file);
  });
}
