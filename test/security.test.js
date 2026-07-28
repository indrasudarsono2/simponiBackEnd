import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-secret-that-is-longer-than-32-characters";
process.env.FILE_URL_SECRET = "test-file-secret-that-is-longer-than-32-characters";

const { requireRole, enforceTenantBody, ROLES } = await import("../middleware/authorize.js");
const { enforceRoutePolicy } = await import("../middleware/routePolicy.js");
const { sanitizeRichText } = await import("../middleware/sanitize.js");
const { createSignedFileUrl, signFileUrlsInJson } = await import("../middleware/privateFiles.js");

const response = () => {
  const state = { status: 200, body: null };
  return {
    state,
    status(code) { state.status = code; return this; },
    json(body) { state.body = body; return this; },
  };
};

test("role middleware denies a user without an allowed role", () => {
  const res = response();
  let nextCalled = false;
  requireRole(ROLES.GENERAL_ADMIN)({ user: { roleNames: ["OPERATIONAL"] } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.state.status, 403);
});

test("attempt invalidation role policy allows only Checker Admin or General Checker", () => {
  for (const role of [ROLES.CHECKER_ADMIN, ROLES.GENERAL_CHECKER]) {
    let allowed = false;
    requireRole(ROLES.CHECKER_ADMIN, ROLES.GENERAL_CHECKER)(
      { user: { roleNames: [role] } },
      response(),
      () => { allowed = true; },
    );
    assert.equal(allowed, true);
  }

  const denied = response();
  requireRole(ROLES.CHECKER_ADMIN, ROLES.GENERAL_CHECKER)(
    { user: { roleNames: [ROLES.CHECKER] } },
    denied,
    () => assert.fail("must not continue"),
  );
  assert.equal(denied.state.status, 403);
});

test("MATS management is restricted to General Admin", () => {
  const denied = response();
  enforceRoutePolicy({ path: "/mats/questions", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["mandatoryQuestion"] } }, denied, () => assert.fail("must not continue"));
  assert.equal(denied.state.status, 403);

  let nextCalled = false;
  enforceRoutePolicy({ path: "/mats/questions", user: { roleNames: [ROLES.GENERAL_ADMIN], menuNames: ["mandatoryQuestion"] } }, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("Checker Admin can manage branch-unit question banks but not MATS", () => {
  let essayAllowed = false;
  enforceRoutePolicy({ path: "/essays", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["essayChoiceQuestion"] } }, response(), () => { essayAllowed = true; });
  assert.equal(essayAllowed, true);

  let multipleChoiceAllowed = false;
  enforceRoutePolicy({ path: "/multipleChoices", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["multipleChoiceQuestion"] } }, response(), () => { multipleChoiceAllowed = true; });
  assert.equal(multipleChoiceAllowed, true);

  const matsDenied = response();
  enforceRoutePolicy({ path: "/mats", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["mandatoryQuestion"] } }, matsDenied, () => assert.fail("must not continue"));
  assert.equal(matsDenied.state.status, 403);
});

test("Checker Admin can access branch-unit events", () => {
  let allowed = false;
  enforceRoutePolicy({ path: "/events", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["eventPreparation"] } }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test("Doctor dashboard requires its database menu assignment", () => {
  let allowed = false;
  enforceRoutePolicy(
    { path: "/dashboardDoctor", user: { roleNames: [ROLES.DOCTOR], menuNames: ["dashboardDoctor"] } },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);

  const denied = response();
  enforceRoutePolicy(
    { path: "/dashboardDoctor", user: { roleNames: [ROLES.DOCTOR], menuNames: [] } },
    denied,
    () => assert.fail("must not continue"),
  );
  assert.equal(denied.state.status, 403);
});

test("Supervisor can read shifts for duty reports but cannot manage them", () => {
  let readAllowed = false;
  enforceRoutePolicy(
    { method: "GET", path: "/shifts", user: { roleNames: [ROLES.SUPERVISOR], menuNames: ["dutyReport"] } },
    response(),
    () => { readAllowed = true; },
  );
  assert.equal(readAllowed, true);

  const writeDenied = response();
  enforceRoutePolicy(
    { method: "POST", path: "/shifts", user: { roleNames: [ROLES.SUPERVISOR], menuNames: ["dutyReport"] } },
    writeDenied,
    () => assert.fail("must not continue"),
  );
  assert.equal(writeDenied.state.status, 403);
});

test("Supervisor can read CWP supervisors for duty reports but cannot manage them", () => {
  let readAllowed = false;
  enforceRoutePolicy(
    { method: "GET", path: "/cwpSupervisors", user: { roleNames: [ROLES.SUPERVISOR], menuNames: ["dutyReport"] } },
    response(),
    () => { readAllowed = true; },
  );
  assert.equal(readAllowed, true);

  const writeDenied = response();
  enforceRoutePolicy(
    { method: "POST", path: "/cwpSupervisors", user: { roleNames: [ROLES.SUPERVISOR], menuNames: ["dutyReport"] } },
    writeDenied,
    () => assert.fail("must not continue"),
  );
  assert.equal(writeDenied.state.status, 403);
});

test("route access is denied when the database menu assignment is absent", () => {
  const denied = response();
  enforceRoutePolicy({ path: "/events", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: [] } }, denied, () => assert.fail("must not continue"));
  assert.equal(denied.state.status, 403);
});

test("question statistics route has an explicit role policy", () => {
  const denied = response();
  enforceRoutePolicy({ path: "/checkerStatisticQuestion", user: { roleNames: [ROLES.OPERATIONAL] } }, denied, () => assert.fail("must not continue"));
  assert.equal(denied.state.status, 403);
});

test("tenant middleware rejects a forged branch unit", () => {
  const res = response();
  enforceTenantBody({ user: { roleNames: ["BRANCH UNIT ADMIN"], branchId: 1, branchUnitId: 5, sectorId: 8 }, body: { branchUnitId: 6 } }, res, () => assert.fail("must not continue"));
  assert.equal(res.state.status, 403);
});

test("rich text sanitizer removes executable markup", () => {
  const req = { body: { question: '<p onclick="alert(1)">Safe<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>' } };
  sanitizeRichText(req, {}, () => {});
  assert.equal(req.body.question.includes("script"), false);
  assert.equal(req.body.question.includes("onclick"), false);
  assert.equal(req.body.question.includes("javascript:"), false);
});

test("stored upload paths are converted to expiring signed paths", () => {
  const url = createSignedFileUrl("/uploads/room/example.pdf");
  assert.match(url, /^\/files\/\d+\/[A-Za-z0-9_-]+\/room\/example\.pdf$/);
});

test("file URL response middleware preserves Date values", () => {
  const originalDate = new Date("2026-07-01T00:00:00.000Z");
  let body;
  const res = { json(value) { body = value; return this; } };
  signFileUrlsInJson({}, res, () => {});
  res.json({ startDate: originalDate, file: "/uploads/event/example.pdf" });
  assert.equal(body.startDate, originalDate);
  assert.match(body.file, /^\/files\//);
});
