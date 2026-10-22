import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertManualDeclaration, credentialIsLinked, assertCredentialUnlinked, SELF_DECLARATION } from '../services/credentialPolicy.js';

test('manual credentials require declaration and evidence; no checker identity is required', () => {
  assert.throws(() => assertManualDeclaration({}, { filename: 'file.pdf' }), { status: 400 });
  assert.throws(() => assertManualDeclaration({ selfDeclared: 'true' }, null), { status: 400 });
  assert.doesNotThrow(() => assertManualDeclaration({ selfDeclared: 'true' }, { filename: 'file.pdf' }));
  assert.match(SELF_DECLARATION, /not checker, AirNav, or e-Chain verification/);
});
test('any application reference freezes a credential, even archived/unscored applications', async () => {
  for (const type of ['ielp','medex']) {
    const db = { applicationDoc: { findFirst: async args => {
      assert.deepEqual(args.where, { [type+'Id']: 27 });
      return { id: 1 };
    } } };
    assert.equal(await credentialIsLinked(db,type,27),true);
    await assert.rejects(assertCredentialUnlinked(db,type,27),{status:409});
    await assert.doesNotReject(assertCredentialUnlinked({applicationDoc:{findFirst:async()=>null}},type,27));
  }
});
test('paired credential endpoints preserve linked records and activate self-declared entries', () => {
  for (const type of ['ielp','medex']) {
    const source = fs.readFileSync(new URL(`../controller/${type}UserController.js`,import.meta.url),'utf8');
    assert.match(source,/if \(!isEchain\) assertManualDeclaration\(req.body, file\)/);
    assert.match(source,/isApplicationLinked: record\._count\.applicationDocs > 0/);
    assert.match(source,/verificationStatus: "APPROVED",\s*requestedCheckerNik: null/);
    assert.match(source,/verifiedAt: isEchain \? now : null/);
    assert.match(source,/credentialIsLinked\(tx,/);
    assert.match(source,/assertCredentialUnlinked\(tx,/);
    assert.doesNotMatch(source,/eventType: "CHECKER_ASSIGNED"/);
    assert.match(source,/isolationLevel: "Serializable"/);
  }
});
