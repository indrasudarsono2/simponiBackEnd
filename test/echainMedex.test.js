import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ||= 'test-jwt-secret-with-at-least-32-characters';
process.env.FILE_URL_SECRET ||= 'test-file-secret-with-at-least-32-characters';
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
const {latestMedexChoices,medexReview,medexReceiptData,requestMedex,trustedMedexFile}=await import('../services/echainMedex.js');
const {verifyCredentialSyncReceipt}=await import('../utils/credentialSyncReceipt.js');
const {default:prisma}=await import('../lib/prisma.js');
const {addMedexUser}=await import('../controller/medexUserController.js');
after(async()=>prisma.$disconnect());
const nik='10011523';
const row={persnum:nik,start:'2020-03-20',tgl:'2020-03-20',valid_to:'2022-03-20',pemeriksa:'Doctor Name',file_rating_medex:null};
test('latest own date retains differing latest records and ignores API ordering and unrelated employees',()=>{
 const choices=latestMedexChoices([{...row,persnum:'OTHER',tgl:'2026-01-01'},{...row,tgl:'2018-04-10'},row,{...row,start:'2020-03-01',valid_to:'2024-03-20'},row],nik);
 assert.equal(choices.length,2);assert.deepEqual(choices.map(x=>x.expired),['2022-03-20','2024-03-20']);assert.equal(choices[0].institutionMissing,true);
});
test('strict dates, identities and approved file hosts are required',()=>{
 for(const records of [[],[{...row,persnum:'OTHER'}],[{...row,start:'2020-02-30'}],[{...row,valid_to:'2019-01-01'}],[{...row,pemeriksa:42}]]) assert.throws(()=>latestMedexChoices(records,nik));
 for(const url of ['http://e-chain.airnavindonesia.co.id/a','https://127.0.0.1/a','https://user:pass@e-chain.airnavindonesia.co.id/a','https://e-chain.airnavindonesia.co.id:8443/a']) assert.throws(()=>trustedMedexFile(url));
});
test('placeholder examiner permits both latest records and requires completion before save',()=>{
 for(const placeholder of ['-','0','N/A','na','NULL','  -  ']) {
  const choices=latestMedexChoices([{...row,pemeriksa:placeholder},{...row,start:'2020-03-01',valid_to:'2024-03-20'}],nik);
  assert.equal(choices.length,2);assert.equal(choices[0].examiner,'');assert.equal(choices[0].examinerMissing,true);
  assert.equal(choices[1].examiner,row.pemeriksa);assert.equal(choices[1].examinerMissing,false);
  const record=medexReview(choices,nik).records[0];
  assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'MEDEX',nik,data:medexReceiptData({...record.data,institution:'Hospital',examiner:'Completed doctor'})}),true);
 }
 assert.throws(()=>latestMedexChoices([{...row,pemeriksa:'A'}],nik));
 assert.throws(()=>latestMedexChoices([{...row,pemeriksa:'A'.repeat(151)}],nik));
});
test('each choice signs exact dates, file and populated examiner while permitting missing field completion',()=>{
 const review=medexReview(latestMedexChoices([row,{...row,pemeriksa:null,valid_to:'2024-03-20'}],nik),nik);
 for(const record of review.records){
  const data=medexReceiptData({...record.data,institution:'User hospital',...(record.data.examinerMissing?{examiner:'User doctor'}:{})});
  assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'MEDEX',nik,data}),true);
  for(const changed of [{...data,expired:'2030-01-01'},{...data,fileUrl:'https://e-chain.airnavindonesia.co.id/other.pdf'}]) assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'MEDEX',nik,data:changed}),false);
  assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'MEDEX',nik:'OTHER',data}),false);
 }
 const record=review.records[0];assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'MEDEX',nik,data:medexReceiptData({...record.data,examiner:'Forged doctor'})}),false);
});
test('fixed HTTPS GET uses AirNav bearer, no redirects and supports refresh on 401',async()=>{
 const result=await requestMedex('token',nik,async(url,options)=>{
  assert.equal(url,'https://e-chain.airnavindonesia.co.id/api_echain/performa/medex');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer token');assert.equal(options.body,undefined);
  return new Response(JSON.stringify({responseStatus:200,data:[row]}));
 });assert.equal(result.choices.length,1);
 assert.equal((await requestMedex('token',nik,async()=>new Response('',{status:401}))).code,'AIRNAV_TOKEN_REJECTED');
 await assert.rejects(requestMedex('token',nik,async()=>new Response('invalid')));
});
test('actual save rejects forged receipt before download and saves exactly the selected expiry',async()=>{
 const record=medexReview(latestMedexChoices([row],nik),nik).records[0];
 const body={...record.data,institution:'User hospital',source:'ECHAIN',syncReceipt:record.syncReceipt};
 let created;const originals={transaction:prisma.$transaction};
 prisma.$transaction=async fn=>fn({medex:{create:async({data})=>(created={...data,id:1}),update:async()=>({...created,id:1,rootVersionId:1})},credentialHistory:{create:async()=>({})}});
 const res=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
 try{
  let response=res();await addMedexUser({user:{nik,authenticationType:'AIRNAV_SSO'},body:{...body,expired:'2030-01-01',echainFileUrl:'https://127.0.0.1/private'},files:[]},response);assert.equal(response.statusCode,400);assert.equal(created,undefined);
  response=res();await addMedexUser({user:{nik,authenticationType:'AIRNAV_SSO'},body:{...body,institution:''},files:[]},response);assert.equal(response.statusCode,400);
  response=res();await addMedexUser({user:{nik,authenticationType:'AIRNAV_SSO'},body,files:[]},response);assert.equal(response.statusCode,200,JSON.stringify(response.body));assert.equal(created.expired.toISOString().slice(0,10),row.valid_to);
  response=res();await addMedexUser({user:{nik,authenticationType:'LOCAL'},body,files:[]},response);assert.equal(response.statusCode,400);
  const missing=medexReview(latestMedexChoices([{...row,pemeriksa:null}],nik),nik).records[0];
  response=res();await addMedexUser({user:{nik,authenticationType:'AIRNAV_SSO'},body:{...missing.data,source:'ECHAIN',syncReceipt:missing.syncReceipt,institution:'User hospital',examiner:''},files:[]},response);assert.equal(response.statusCode,400);
  response=res();await addMedexUser({user:{nik,authenticationType:'AIRNAV_SSO'},body:{...missing.data,source:'ECHAIN',syncReceipt:missing.syncReceipt,institution:'User hospital',examiner:'User doctor'},files:[]},response);assert.equal(response.statusCode,200);assert.match(created.verificationNote,/Examiner supplied by user/);
 }finally{prisma.$transaction=originals.transaction;}
});
