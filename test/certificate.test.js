import assert from "node:assert/strict";
import test from "node:test";
import { issueCertificate, revokeCertificatesForFinalScore } from "../services/certificate.js";

const fixture = ({ live = true, simulator = false } = {}) => ({
  id: 29,
  deletedAt: null,
  isInvalidated: false,
  essayScore: 40,
  multipleChoiceScore: 58.67,
  finalScore: 98.67,
  status: { status: "SUCCESS" },
  userRatings: [{ id: 14, userId: "10011124", createdAt: new Date("2026-09-28T10:00:00Z") }],
  appRating: {
    deletedAt: null,
    rating: { rating: "APP" },
    applicationDoc: { deletedAt: null, userNik: "10011124", user: { name: "MEDAN OPS" } },
    practicalTests: [
      ...(live ? [{ id: 1, score: 76, updatedAt: new Date(), kindOfPractical: { kind: "PRACTICAL" } }] : []),
      ...(simulator ? [{ id: 2, score: 81, updatedAt: new Date(), kindOfPractical: { kind: "SIMULATOR" } }] : []),
    ],
    practicalRecheckAuthorization: null,
  },
  event: {
    event: "Medan check",
    startDate: new Date("2026-09-25T00:00:00Z"),
    finishDate: new Date("2026-09-30T00:00:00Z"),
    isPractical: live,
    isSimulator: simulator,
    practicalPassingGrade: 75,
    sector: { branchUnit: { unit: "TWR-APP", branch: { branch: "MEDAN" } } },
  },
});

const transaction = (result) => {
  const certificates = [];
  return {
    certificates,
    finalScore: { findUnique: async () => result },
    certificate: {
      findFirst: async ({ where }) => certificates.find((item) =>
        item.finalScoreId === where.finalScoreId && (!where.status || item.status === where.status)) || null,
      create: async ({ data }) => {
        const item = { id: certificates.length + 1, ...data };
        certificates.push(item);
        return item;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const item of certificates) {
          if (item.finalScoreId === where.finalScoreId && item.status === where.status) {
            Object.assign(item, data);
            count++;
          }
        }
        return { count };
      },
    },
  };
};

test("certificate snapshots theory and both practical kinds only once", async () => {
  const tx = transaction(fixture({ live: true, simulator: true }));
  const first = await issueCertificate(tx, 29);
  const again = await issueCertificate(tx, 29);
  assert.equal(first.publicId, again.publicId);
  assert.equal(tx.certificates.length, 1);
  assert.equal(first.snapshot.theory.finalScore, 98.67);
  assert.deepEqual(first.snapshot.practical.map((item) => item.kind), ["Live", "Simulator"]);
});

test("simulator-only success can receive a certificate", async () => {
  const tx = transaction(fixture({ live: false, simulator: true }));
  const certificate = await issueCertificate(tx, 29);
  assert.equal(certificate.snapshot.practical[0].kind, "Simulator");
});

test("revocation preserves old snapshot and creates a new version", async () => {
  const result = fixture();
  const tx = transaction(result);
  const first = await issueCertificate(tx, 29);
  await revokeCertificatesForFinalScore(tx, 29, "Corrected score");
  result.appRating.practicalTests[0].score = 80;
  const second = await issueCertificate(tx, 29);
  assert.equal(first.status, "REVOKED");
  assert.equal(first.snapshot.practical[0].score, 76);
  assert.equal(second.snapshot.practical[0].score, 80);
  assert.equal(second.number, "PERFORMA/PC/000014/R2");
  assert.notEqual(first.publicId, second.publicId);
});

test("incomplete practical evidence is not certifiable", async () => {
  const result = fixture({ live: true, simulator: true });
  result.appRating.practicalTests[1].score = null;
  await assert.rejects(issueCertificate(transaction(result), 29), /CERTIFICATE_NOT_ELIGIBLE/);
});
