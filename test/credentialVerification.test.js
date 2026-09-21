import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

process.env.JWT_SECRET ||= "test-jwt-secret-with-at-least-32-characters";
process.env.FILE_URL_SECRET ||= "test-file-secret-with-at-least-32-characters";
const { createCredentialSyncReceipt, verifyCredentialSyncReceipt } = await import("../utils/credentialSyncReceipt.js");
const { normalizeIelpValidity } = await import("../utils/ielpValidity.js");

const data = {
  institution: "Aviation Center",
  released: "2026-01-01",
  expired: "2027-01-01",
  fileName: "credential.pdf",
  fileUrl: null,
  fileUrlExpiresAt: null,
  fileMimeType: "application/pdf",
  fileSizeBytes: 100,
};

test("e-chain credential receipt validates its exact user, type, and data", () => {
  const receipt = createCredentialSyncReceipt({ type: "MEDEX", nik: "10077773", data });
  assert.equal(verifyCredentialSyncReceipt({ receipt, type: "MEDEX", nik: "10077773", data }), true);
  assert.equal(verifyCredentialSyncReceipt({ receipt, type: "IELP", nik: "10077773", data }), false);
  assert.equal(verifyCredentialSyncReceipt({ receipt, type: "MEDEX", nik: "OTHER", data }), false);
});

test("e-chain credential receipt rejects modified credential data", () => {
  const receipt = createCredentialSyncReceipt({ type: "MEDEX", nik: "10077773", data });
  assert.equal(verifyCredentialSyncReceipt({
    receipt,
    type: "MEDEX",
    nik: "10077773",
    data: { ...data, expired: "2035-01-01" },
  }), false);
});

test("manual credential workflow prohibits self-assignment and self-verification", () => {
  const verificationController = fs.readFileSync(new URL("../controller/credentialVerificationController.js", import.meta.url), "utf8");
  const ielpController = fs.readFileSync(new URL("../controller/ielpUserController.js", import.meta.url), "utf8");
  const medexController = fs.readFileSync(new URL("../controller/medexUserController.js", import.meta.url), "utf8");

  assert.match(verificationController, /nik:\s*\{\s*not:\s*req\.user\.nik\s*\}/);
  assert.match(verificationController, /record\.userNik\s*===\s*req\.user\.nik/);
  assert.match(ielpController, /requestedCheckerNik\s*===\s*req\.user\.nik/);
  assert.match(medexController, /requestedCheckerNik\s*===\s*req\.user\.nik/);
  assert.match(verificationController, /new Set\(\["CHECKER"\]\)/);
  assert.doesNotMatch(verificationController, /new Set\(\["CHECKER",\s*"GENERAL CHECKER"/);
});

test("IELP validity is derived from level and released date", () => {
  assert.equal(normalizeIelpValidity({ level: "4", released: "2026-09-08" }).expired.toISOString(), "2029-09-08T23:59:59.999Z");
  assert.equal(normalizeIelpValidity({ level: "5", released: "2026-09-08" }).expired.toISOString(), "2032-09-08T23:59:59.999Z");
  assert.equal(normalizeIelpValidity({ level: "6", released: "2026-09-08" }).expired, null);
  assert.throws(() => normalizeIelpValidity({ level: "3", released: "2026-09-08" }), /4, 5, or 6/);
});

test("credential approval sends the complete manual credential to e-chain before local approval", () => {
  const controller = fs.readFileSync(new URL("../controller/credentialVerificationController.js", import.meta.url), "utf8");

  for (const field of ["institution", "released", "expired", "file", "level", "rater", "examiner"]) {
    assert.match(controller, new RegExp(`\\b${field}\\b`));
  }
  const sendPosition = controller.indexOf("await sendApprovedCredentialToEchain");
  const updatePosition = controller.indexOf("const updated = await prisma.$transaction", sendPosition);
  assert.ok(sendPosition >= 0 && updatePosition > sendPosition, "e-chain acceptance must happen before local approval");
  assert.match(controller, /ECHAIN_IELP_VERIFIED_SEND_PATH/);
  assert.match(controller, /ECHAIN_MEDEX_VERIFIED_SEND_PATH/);
});

test("approved credential edits create revisions instead of overwriting historical rows", () => {
  const ielp = fs.readFileSync(new URL("../controller/ielpUserController.js", import.meta.url), "utf8");
  const medex = fs.readFileSync(new URL("../controller/medexUserController.js", import.meta.url), "utf8");
  for (const controller of [ielp, medex]) {
    assert.match(controller, /previousVersionId:\s*existing/);
    assert.match(controller, /version:\s*\(existing.*\.version\s*\|\|\s*1\)\s*\+\s*1/);
    assert.match(controller, /userNik:\s*req\.user\.nik/);
    assert.match(controller, /eventType:\s*"REVISION_SUBMITTED"/);
  }
});

test("credential history is authorized for the owner or same-branch checker admin", () => {
  const history = fs.readFileSync(new URL("../controller/credentialHistoryController.js", import.meta.url), "utf8");
  assert.match(history, /credential\.userNik\s*===\s*req\.user\.nik/);
  assert.match(history, /roleNames\.has\("CHECKER ADMIN"\)/);
  assert.match(history, /credential\.user\?\.branchUnitId\s*===\s*req\.user\.branchUnitId/);
  assert.match(history, /not authorized to view this credential history/);
});

test("approving a revision makes it current without changing historical application document links", () => {
  const controller = fs.readFileSync(new URL("../controller/credentialVerificationController.js", import.meta.url), "utf8");
  assert.match(controller, /updateMany\([\s\S]*isCurrent:\s*true[\s\S]*data:\s*\{\s*isCurrent:\s*false/);
  assert.match(controller, /isCurrent:\s*status\s*===\s*"APPROVED"/);
  assert.doesNotMatch(controller, /applicationDoc\.updateMany/);
});
