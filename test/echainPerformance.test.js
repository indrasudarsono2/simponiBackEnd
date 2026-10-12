import test,{after} from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ||= 'test-jwt-secret-with-at-least-32-characters';
process.env.FILE_URL_SECRET ||= 'test-file-secret-with-at-least-32-characters';
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
const {latestPerformance,performanceReview,performanceReceiptData,requestPerformance,trustedPerformanceFile}=await import('../services/echainPerformance.js');
const {verifyCredentialSyncReceipt}=await import('../utils/credentialSyncReceipt.js');
const {default:prisma}=await import('../lib/prisma.js');
const {addLicenseUser}=await import('../controller/licenseUserController.js');
after(async()=>prisma.$disconnect());
const nik='10011523';
const row={persnum:nik,rating:'ACS',tingkat:'-',start:'2023-12-31',tgl:'2023-12-12',valid_to:'2024-06-30',notes:'-',file_rating_performance:null};
test('newest examination across all ratings, not expiry/start/API order, preserves expired data',()=>{
 const results=latestPerformance([{...row,persnum:'OTHER',tgl:'2026-01-01'},{...row,rating:'ACP',tgl:'2022-12-06',start:'2025-01-01',valid_to:'2027-01-01'},row],nik);
 assert.equal(results.length,1);assert.equal(results[0].rating,'ACS');assert.equal(results[0].licenseExpiredDate,'2024-06-30');assert.equal(results[0].level,null);assert.match(results[0].note,/Performance Check ACS/);
});
test('ties retain user choice, exact duplicates collapse and absent file is permitted',()=>{
 const result=latestPerformance([row,{...row,rating:'ACP'},row],nik);
 assert.equal(result.length,2);assert.equal(result[0].fileUrl,null);
});
test('strict identity, calendar dates, rating and HTTPS file origin validation',()=>{
 for(const records of [[],[{...row,persnum:'OTHER'}],[{...row,tgl:'2023-02-30'}],[{...row,valid_to:'2020-01-01'}],[{...row,rating:null}]])assert.throws(()=>latestPerformance(records,nik));
 for(const url of ['http://e-chain.airnavindonesia.co.id/a','https://127.0.0.1/a','https://e-chain.airnavindonesia.co.id:8443/a','https://u:p@e-chain.airnavindonesia.co.id/a'])assert.throws(()=>trustedPerformanceFile(url));
});
test('receipt binds note, expiry, file, employee and credential type',()=>{
 const record=performanceReview(latestPerformance([row],nik),nik).records[0];const data=performanceReceiptData(record.data);
 assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'LICENSE_PERFORMANCE',nik,data}),true);
 for(const changes of [{note:'Forged'}, {licenseExpiredDate:'2030-01-01'}, {fileUrl:'https://e-chain.airnavindonesia.co.id/other'}])assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'LICENSE_PERFORMANCE',nik,data:{...data,...changes}}),false);
 assert.equal(verifyCredentialSyncReceipt({receipt:record.syncReceipt,type:'LICENSE_PERFORMANCE',nik:'OTHER',data}),false);
});
test('ICD fixed HTTPS GET, no input or redirects, token rejection triggers refresh',async()=>{
 const result=await requestPerformance('airnav',nik,async(url,options)=>{
  assert.equal(url,'https://e-chain.airnavindonesia.co.id/api_echain/performa/performance');assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer airnav');
  return new Response(JSON.stringify({responseStatus:200,data:[row]}));
 });assert.equal(result.records.length,1);
 assert.equal((await requestPerformance('x',nik,async()=>new Response('',{status:401}))).code,'AIRNAV_TOKEN_REJECTED');
 await assert.rejects(requestPerformance('x',nik,async()=>new Response('invalid')));
});
test('actual save verifies signed selection before file download and preserves manual entry',async()=>{
 const record=performanceReview(latestPerformance([row],nik),nik).records[0];let saved;
 const original=prisma.license.create;prisma.license.create=async({data})=>(saved={...data,id:1});
 const res=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
 const body={note:record.data.note,licenseExpiredDate:record.data.licenseExpiredDate,source:'ECHAIN_PERFORMANCE',syncReceipt:record.syncReceipt};
 try{
  let response=res();await addLicenseUser({user:{nik,authenticationType:'AIRNAV_SSO'},body:{...body,echainFileUrl:'https://127.0.0.1/private'},files:[]},response);assert.equal(response.statusCode,400);assert.equal(saved,undefined);
  response=res();await addLicenseUser({user:{nik,authenticationType:'LOCAL'},body,files:[]},response);assert.equal(response.statusCode,400);
  response=res();await addLicenseUser({user:{nik,authenticationType:'AIRNAV_SSO'},body,files:[]},response);assert.equal(response.statusCode,200);assert.equal(saved.expiredDate.toISOString(),'2024-06-30T23:59:59.000Z');
  response=res();await addLicenseUser({user:{nik,authenticationType:'LOCAL'},body:{note:'Manual license',licenseExpiredDate:'2027-01-01'},files:[]},response);assert.equal(response.statusCode,200);assert.equal(saved.note,'Manual license');
 }finally{prisma.license.create=original;}
});
