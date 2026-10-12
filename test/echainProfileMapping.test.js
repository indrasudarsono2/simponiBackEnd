import test from 'node:test';
import assert from 'node:assert/strict';
import { mapEchainProfile } from '../services/echainProfileMapping.js';
test('maps approved fields with corporate email, address template and database gender ID', async () => {
  const mapped = await mapEchainProfile({persnum:'10011523',nama:'TEST',tgl_lahir:'1992-11-04',tempat_lahir:'CITY',no_hp:'081',email_kantor:'test@example.com',email_pribadi:'private@example.com',kelamin:'L',jabatan:'POSITION',lokasi_kedudukan:'LOCATION'},'10011523',[{id:37,gender:'LAKI-LAKI'}]);
  assert.deepEqual(mapped,{name:'TEST',placeOfBirth:'CITY',phoneNumber:'081',email:'test@example.com',dateOfBirth:'1992-11-04',personalAddress:'POSITION in LOCATION',genderId:'37',genderLabel:'LAKI-LAKI'});
  assert.ok(!('nationality' in mapped)); assert.ok(!('roles' in mapped)); assert.ok(!('licenseUserId' in mapped));
});
test('blank or invalid upstream data leaves existing fields untouched',async()=>{
  assert.deepEqual(await mapEchainProfile({persnum:'n',email_kantor:'',email_pribadi:'private@example.com',tgl_lahir:'2025-02-30',jabatan:'POSITION',kelamin:'X'},'n',[]),{});
});
test('P resolves by name, not hardcoded ID; mismatched identity is rejected',async()=>{
  assert.deepEqual(await mapEchainProfile({persnum:'n',kelamin:'P'},'n',[{id:99,gender:'PEREMPUAN'}]),{genderId:'99',genderLabel:'PEREMPUAN'});
  await assert.rejects(mapEchainProfile({persnum:'other'},'n',[]),/identity mismatch/);
});
