import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.JWT_SECRET ||= 'test-jwt-secret-with-at-least-32-characters';
process.env.FILE_URL_SECRET ||= 'test-file-secret-with-at-least-32-characters';
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
const {mapLatestIelp,makeIelpReview,ielpReceiptData,selectedIelpValidity,requestIelp,trustedIelpFile}=await import('../services/echainIelp.js');
const {verifyCredentialSyncReceipt}=await import('../utils/credentialSyncReceipt.js');
const {default:prisma}=await import('../lib/prisma.js');
const {addIelpUser}=await import('../controller/ielpUserController.js');
after(async()=>{await prisma.$disconnect();});
const row={persnum:'10011523',tgl:'2024-02-28',start:'2024-02-28',valid_to:'2027-02-28',lembaga:'PPIC CURUG',level:'5',file_rating_ielp:null};
test('selects latest own test independently of API ordering; maps both expiry dates',()=>{
 const data=mapLatestIelp([{...row,persnum:'OTHER',tgl:'2026-01-01'},{...row,tgl:'2023-02-28'},row],'10011523');
 assert.equal(data.released,'2024-02-28');assert.equal(data.echainExpired,'2027-02-28');assert.equal(data.calculatedExpired,'2030-02-28');assert.equal(data.rater,null);
});
test('missing institution does not block review; its signed missing flag allows user completion, not overwriting an upstream institution',()=>{
 const data=mapLatestIelp([{...row,lembaga:null}],'10011523');
 assert.equal(data.institution,'');assert.equal(data.institutionMissing,true);assert.equal(data.level,'5');
 const review=makeIelpReview(data,'10011523');
 const canonical=ielpReceiptData({...data,institution:'User supplied institution',expirySource:'ECHAIN'});
 assert.equal(verifyCredentialSyncReceipt({receipt:review.syncReceipts.ECHAIN,type:'IELP',nik:'10011523',data:canonical}),true);
 const populated=mapLatestIelp([row],'10011523');const populatedReview=makeIelpReview(populated,'10011523');
 assert.equal(verifyCredentialSyncReceipt({receipt:populatedReview.syncReceipts.ECHAIN,type:'IELP',nik:'10011523',data:ielpReceiptData({...populated,institutionMissing:true,institution:'Different institution',expirySource:'ECHAIN'})}),false);
});
test('rejects missing identity, ambiguous newest records, impossible dates and invalid levels',()=>{
 for(const records of [[],[{...row,persnum:'OTHER'}],[row,{...row,level:'4'}],[{...row,start:'2024-02-30'}],[{...row,level:'3'}],[{...row,valid_to:'2020-01-01'}]]) assert.throws(()=>mapLatestIelp(records,'10011523'));
});
test('both signed choices save exactly their selected expiry, and reject forged choices or another employee',()=>{
 const data=mapLatestIelp([row],'10011523');const review=makeIelpReview(data,'10011523');
 for(const expirySource of ['ECHAIN','PERFORMA']) {
   const canonical=ielpReceiptData({...data,expirySource,expired:expirySource==='ECHAIN'?data.echainExpired:data.calculatedExpired});
   assert.equal(verifyCredentialSyncReceipt({receipt:review.syncReceipts[expirySource],type:'IELP',nik:'10011523',data:canonical}),true);
   assert.equal(selectedIelpValidity(canonical).expired.toISOString().slice(0,10),canonical.expired);
   assert.equal(verifyCredentialSyncReceipt({receipt:review.syncReceipts[expirySource],type:'IELP',nik:'OTHER',data:canonical}),false);
   assert.equal(verifyCredentialSyncReceipt({receipt:review.syncReceipts[expirySource],type:'IELP',nik:'10011523',data:{...canonical,expired:'2031-01-01'}}),false);
 }
 assert.throws(()=>selectedIelpValidity({...data,expirySource:'PERFORMA',expired:data.echainExpired}));
 assert.throws(()=>selectedIelpValidity(data));
});
test('level 6 allows choosing a finite ECHAIN date or PERFORMA lifetime; leap years use backend calculation',()=>{
 const data=mapLatestIelp([{...row,level:'6'}],'10011523');
 assert.equal(selectedIelpValidity({...data,expirySource:'PERFORMA',expired:null}).expired,null);
 assert.equal(selectedIelpValidity({...data,expirySource:'ECHAIN'}).expired.toISOString().slice(0,10),'2027-02-28');
 assert.equal(mapLatestIelp([{...row,level:'4',start:'2024-02-29'}],'10011523').calculatedExpired,'2027-02-28');
});
test('fixed HTTPS GET passes AirNav token, refuses redirects; token rejection enables refresh',async()=>{
 const result=await requestIelp('airnav-token','10011523',async(url,options)=>{
  assert.equal(url,'https://e-chain.airnavindonesia.co.id/api_echain/performa/ielp');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer airnav-token');assert.equal(options.body,undefined);
  return new Response(JSON.stringify({responseStatus:200,data:[row]}));
 });assert.equal(result.level,'5');
 assert.equal((await requestIelp('x','10011523',async()=>new Response('',{status:401}))).code,'AIRNAV_TOKEN_REJECTED');
 await assert.rejects(requestIelp('x','10011523',async()=>new Response('not json')));
});
test('file addresses cannot target internal hosts, HTTP, credentials, arbitrary ports or unrelated sites',()=>{
 for(const url of ['http://e-chain.airnavindonesia.co.id/a','https://127.0.0.1/a','https://e-chain.airnavindonesia.co.id:8443/a','https://user:password@e-chain.airnavindonesia.co.id/a','https://example.com/a']) assert.throws(()=>trustedIelpFile(url));
 assert.equal(trustedIelpFile(null),null);
});
test('save verifies receipt before external download and retains choice in verification history; manual rules unchanged',()=>{
 const source=fs.readFileSync(new URL('../controller/ielpUserController.js',import.meta.url),'utf8');
 const add=source.slice(source.indexOf('const addIelpUser'),source.indexOf('const getIelpById'));
 assert.ok(add.indexOf('verifyCredentialSyncReceipt')<add.indexOf('await downloadEchainIelpUserFile'));
 assert.ok(add.includes('isEchain ? selectedIelpValidity(receiptData) : normalizeIelpValidity({ level, released })'));
 assert.ok(add.includes('note: verificationNote'));
});
test('actual save controller persists either signed choice, leaves manual calculation unchanged, and rejects forged data before download',async()=>{
 const originalTransaction=prisma.$transaction;const originalChecker=prisma.user.findFirst;
 let saved;const history=[];
 prisma.$transaction=async(callback)=>callback({
  ielp:{create:async({data})=>{saved={id:91,...data};return saved;},update:async()=>({...saved,rootVersionId:91})},
  credentialHistory:{create:async({data})=>{history.push(data);return data;}},
 });
 prisma.user.findFirst=async()=>({nik:'checker'});
 const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}});
 try {
  const data=mapLatestIelp([row],'10011523');const review=makeIelpReview(data,'10011523');
  for(const expirySource of ['ECHAIN','PERFORMA']) {
   const expired=expirySource==='ECHAIN'?data.echainExpired:data.calculatedExpired;
   const res=response();await addIelpUser({user:{nik:'10011523',authenticationType:'AIRNAV_SSO'},body:{...data,expired,expirySource,rater:'Test Rater',source:'ECHAIN',syncReceipt:review.syncReceipts[expirySource]},files:[]},res);
   assert.equal(res.statusCode,200);assert.equal(saved.expired.toISOString().slice(0,10),expired);assert.equal(saved.userNik,'10011523');
   assert.ok(history.at(-1).note.includes(`expiry chosen: ${expirySource}`));
   if(expirySource==='PERFORMA') assert.ok(saved.verificationNote.includes('Please correct'));
  }
  const manual=response();await addIelpUser({user:{nik:'10011523',branchUnitId:1,authenticationType:'LOCAL'},body:{institution:'Test Institute',level:'5',released:'2024-02-28',expired:'2027-02-28',rater:'Test Rater',requestedCheckerNik:'checker',source:'MANUAL'},files:[]},manual);
  assert.equal(manual.statusCode,200);assert.equal(saved.expired.toISOString().slice(0,10),'2030-02-28');assert.equal(saved.verificationStatus,'PENDING');
  const before=saved;const forged=response();await addIelpUser({user:{nik:'10011523',authenticationType:'AIRNAV_SSO'},body:{...data,source:'ECHAIN',expirySource:'ECHAIN',echainFileUrl:'https://127.0.0.1/private',syncReceipt:review.syncReceipts.ECHAIN},files:[]},forged);
  assert.equal(forged.statusCode,400);assert.equal(saved,before);
  const missing=mapLatestIelp([{...row,lembaga:null}],'10011523');const missingReview=makeIelpReview(missing,'10011523');
  const missingBody={...missing,source:'ECHAIN',expirySource:'ECHAIN',institutionMissing:'true',syncReceipt:missingReview.syncReceipts.ECHAIN,rater:'Test Rater'};
  const blank=response();await addIelpUser({user:{nik:'10011523',authenticationType:'AIRNAV_SSO'},body:missingBody,files:[]},blank);
  assert.equal(blank.statusCode,400);assert.equal(saved,before);
  const completed=response();await addIelpUser({user:{nik:'10011523',authenticationType:'AIRNAV_SSO'},body:{...missingBody,institution:'User supplied institute'},files:[]},completed);
  assert.equal(completed.statusCode,200);assert.equal(saved.institution,'User supplied institute');assert.ok(saved.verificationNote.includes('Institution supplied by user'));
 } finally {prisma.$transaction=originalTransaction;prisma.user.findFirst=originalChecker;}
});
