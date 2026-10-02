import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.JWT_SECRET = "test-jwt-secret-that-is-longer-than-32-characters";
process.env.FILE_URL_SECRET = "test-file-secret-that-is-longer-than-32-characters";

const { requireRole, enforceTenantBody, ROLES } = await import("../middleware/authorize.js");
const { enforceRoutePolicy } = await import("../middleware/routePolicy.js");
const { enforceResourceScope } = await import("../middleware/resourceScope.js");
const { default: prisma } = await import("../lib/prisma.js");
const { sanitizeRichText } = await import("../middleware/sanitize.js");
const { createSignedFileUrl, signFileUrlsInJson } = await import("../middleware/privateFiles.js");
const { validateUploadedFiles } = await import("../lib/multer.js");
const { enforceCsrf } = await import("../middleware/csrf.js");
const { parseCookies } = await import("../middleware/cookies.js");
const { canEnableTestLoginBypass } = await import("../config/security.js");
const { calculateCooldownMs, calculateFailureState } = await import("../security/loginProtection.js");
const { skipGeneralApiLimit } = await import("../middleware/rateLimitPolicy.js");

test("clock reads and separately limited authentication routes bypass only the general API limit", () => {
  for (const [method, path] of [
    ["GET", "/theorySessions/7/clock"],
    ["GET", "/theorySessions/lead/clocks"],
    ["POST", "/auth/login"],
    ["POST", "/auth/forgot-password"],
    ["POST", "/auth/reset-password"],
  ]) assert.equal(skipGeneralApiLimit({ method, path }), true, `${method} ${path}`);
  for (const [method, path] of [
    ["GET", "/theorySessions/lead"],
    ["GET", "/theorySessions/lead/events"],
    ["PATCH", "/theorySessions/7/draft"],
    ["POST", "/theorySessions/7/submit"],
    ["GET", "/auth/login"],
  ]) assert.equal(skipGeneralApiLimit({ method, path }), false, `${method} ${path}`);
});

test("lead clock batch remains role and menu protected", () => {
  for (const [role, menu, allowed] of [
    [ROLES.CHECKER_EXAMINATION_LEAD, "theorySession", true],
    [ROLES.OPERATIONAL, "examination", false],
  ]) {
    const res = response();
    let nextCalled = false;
    enforceRoutePolicy({ path: "/theorySessions/lead/clocks", user: { roleNames: [role], menuNames: [menu] } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, allowed);
  }
});

test("Operational guide is read-only and limited to the Operational dashboard role", () => {
  for (const [role, menu, allowed] of [
    [ROLES.OPERATIONAL, "dashboardOperational", true],
    [ROLES.CHECKER, "dashboardOperational", false],
    [ROLES.OPERATIONAL, "dashboardChecker", false],
  ]) {
    const res = response();
    let nextCalled = false;
    enforceRoutePolicy({ method: "GET", path: "/operationalGuide", user: { roleNames: [role], menuNames: [menu] } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, allowed);
  }
});

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

test("proposal letters allow supervisor or assigned OJTI decisions while keeping assignment applicant-only", () => {
  const cases = [
    { path: "/proposalLetters/application/12/assign", role: ROLES.OPERATIONAL, menu: "applicationDoc", allowed: true },
    { path: "/proposalLetters/application/12/assign", role: ROLES.SUPERVISOR, menu: "proposalLetters", allowed: false },
    { path: "/proposalLetters/7/decision", role: ROLES.SUPERVISOR, menu: "proposalLetters", allowed: true },
    { path: "/proposalLetters/7/decision", role: ROLES.OPERATIONAL, menu: "applicationDoc", allowed: true },
    { path: "/proposalLetters/7/decision", role: ROLES.OPERATIONAL, menu: "ojtiRequests", allowed: true },
    { path: "/proposalLetters/7", role: ROLES.OPERATIONAL, menu: "ojtiRequests", allowed: true },
    { path: "/ojtiRecommendations/inbox", role: ROLES.OPERATIONAL, menu: "ojtiRequests", allowed: true },
    { path: "/ojtiRecommendations/inbox", role: ROLES.OPERATIONAL, menu: "applicationDoc", allowed: false },
    { path: "/ojtiRecommendations/eligible", role: ROLES.OPERATIONAL, menu: "applicationDoc", allowed: true },
    { path: "/proposalLetters/7/revise", role: ROLES.OPERATIONAL, menu: "applicationDoc", allowed: true },
    { path: "/proposalLetters/7/revise", role: ROLES.SUPERVISOR, menu: "proposalLetters", allowed: false },
  ];
  for (const { path, role, menu, allowed } of cases) {
    const res = response();
    let nextCalled = false;
    enforceRoutePolicy({ path, user: { roleNames: [role], menuNames: [menu] } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, allowed, `${role} ${path}`);
    if (!allowed) assert.equal(res.state.status, 403);
  }
});

test("theory lead controls are isolated from participant examination routes", () => {
  let leadAllowed = false;
  enforceRoutePolicy({ path: "/theorySessions/lead", user: { roleNames: [ROLES.CHECKER_EXAMINATION_LEAD], menuNames: ["theorySession"] } }, response(), () => { leadAllowed = true; });
  assert.equal(leadAllowed, true);

  const participantDenied = response();
  enforceRoutePolicy({ path: "/theorySessions/lead", user: { roleNames: [ROLES.OPERATIONAL], menuNames: ["examination"] } }, participantDenied, () => assert.fail("participant must not control sessions"));
  assert.equal(participantDenied.state.status, 403);

  let participantAllowed = false;
  enforceRoutePolicy({ path: "/theorySessions/42/attempt", user: { roleNames: [ROLES.OPERATIONAL], menuNames: ["examination"] } }, response(), () => { participantAllowed = true; });
  assert.equal(participantAllowed, true);

  const leadDenied = response();
  enforceRoutePolicy({ path: "/theorySessions/42/attempt", user: { roleNames: [ROLES.CHECKER_EXAMINATION_LEAD], menuNames: ["theorySession"] } }, leadDenied, () => assert.fail("lead must not open participant questions"));
  assert.equal(leadDenied.state.status, 403);
});

test("practical theory review requires the Checker role and Practical Exam menu", () => {
  for (const [role, menu, allowed] of [
    [ROLES.CHECKER, "practicalExam", true],
    [ROLES.OPERATIONAL, "examination", false],
    [ROLES.CHECKER, "history", false],
  ]) {
    const res = response();
    let nextCalled = false;
    enforceRoutePolicy({ method: "GET", path: "/practicalExam/theory-review/42", user: { roleNames: [role], menuNames: [menu] } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, allowed);
    if (!allowed) assert.equal(res.state.status, 403);
  }
});

test("practical updates and e-chain sends require the Practical Exam menu", () => {
  for (const [method, route] of [["PUT", "/practicalExam/12"], ["PUT", "/practicalExam/recheck/12"], ["POST", "/practicalExam/12/send-echain"]]) {
    const denied = response();
    enforceRoutePolicy({ method, path: route, user: { roleNames: [ROLES.CHECKER], menuNames: [] } }, denied, () => assert.fail("must not continue"));
    assert.equal(denied.state.status, 403);
    let allowed = false;
    enforceRoutePolicy({ method, path: route, user: { roleNames: [ROLES.CHECKER], menuNames: ["practicalExam"] } }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
  }
});

test("score evidence downloads and theory reviews are available to General Admin without opening checker mutations", () => {
  for (const path of ["/scoreChecker/theory-review/7", "/scoreChecker/evidence-download/7"]) {
    for (const [role, menu, allowed] of [
      [ROLES.GENERAL_ADMIN, "pfcScore", true],
      [ROLES.CHECKER_ADMIN, "score", true],
      [ROLES.GENERAL_CHECKER, "score", true],
      [ROLES.GENERAL_ADMIN, "history", false],
      [ROLES.OPERATIONAL, "pfcScore", false],
    ]) {
      const res = response();
      let nextCalled = false;
      enforceRoutePolicy({ method: "GET", path, user: { roleNames: [role], menuNames: [menu] } }, res, () => { nextCalled = true; });
      assert.equal(nextCalled, allowed, `${role} ${menu} ${path}`);
      if (!allowed) assert.equal(res.state.status, 403);
    }
  }
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

test("interrupted attempt reset endpoints require the Checker role and Performance Check menu", () => {
  for (const route of ["/performanceCheck/reset-options/7", "/performanceCheck/reset-attempt"]) {
    for (const [role, menu, allowed] of [
      [ROLES.CHECKER, "performanceCheck", true],
      [ROLES.CHECKER_ADMIN, "performanceCheck", false],
      [ROLES.CHECKER, "dashboardChecker", false],
    ]) {
      let nextCalled = false;
      enforceRoutePolicy({ path: route, user: { roleNames: [role], menuNames: [menu] } }, response(), () => { nextCalled = true; });
      assert.equal(nextCalled, allowed, `${role} ${menu} ${route}`);
    }
  }
});

test("MATS management is restricted to General Admin", () => {
  const denied = response();
  enforceRoutePolicy({ path: "/mats/questions", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["mandatoryQuestion"] } }, denied, () => assert.fail("must not continue"));
  assert.equal(denied.state.status, 403);

  let nextCalled = false;
  enforceRoutePolicy({ path: "/mats/questions", user: { roleNames: [ROLES.GENERAL_ADMIN], menuNames: ["mandatoryQuestion"] } }, response(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("only General Admin can change the global passing grades", () => {
  const denied = response();
  enforceRoutePolicy(
    { method: "PUT", path: "/passingGradeStandard", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["eventPreparation"] } },
    denied,
    () => assert.fail("must not continue"),
  );
  assert.equal(denied.state.status, 403);

  let readAllowed = false;
  enforceRoutePolicy(
    { method: "GET", path: "/passingGradeStandard", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["eventPreparation"] } },
    response(),
    () => { readAllowed = true; },
  );
  assert.equal(readAllowed, true);

  let updateAllowed = false;
  enforceRoutePolicy(
    { method: "PUT", path: "/passingGradeStandard", user: { roleNames: [ROLES.GENERAL_ADMIN], menuNames: ["mandatoryQuestion"] } },
    response(),
    () => { updateAllowed = true; },
  );
  assert.equal(updateAllowed, true);
});

test("user login security management is restricted to General Admin", () => {
  const denied = response();
  enforceRoutePolicy(
    { path: "/userLoginSecurity", user: { roleNames: [ROLES.BRANCH_ADMIN], menuNames: ["userManagement"] } },
    denied,
    () => assert.fail("must not continue"),
  );
  assert.equal(denied.state.status, 403);

  let allowed = false;
  enforceRoutePolicy(
    { path: "/userLoginSecurity", user: { roleNames: [ROLES.GENERAL_ADMIN], menuNames: ["userManagement"] } },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);
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

test("Checker Examination can only access the sanitized question review endpoint", () => {
  let reviewAllowed = false;
  enforceRoutePolicy(
    {
      method: "GET",
      path: "/questionReview",
      user: { roleNames: [ROLES.CHECKER_EXAMINATION], menuNames: ["questionReview"] },
    },
    response(),
    () => { reviewAllowed = true; },
  );
  assert.equal(reviewAllowed, true);

  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const denied = response();
    enforceRoutePolicy(
      {
        method,
        path: "/multipleChoices",
        user: {
          roleNames: [ROLES.CHECKER_EXAMINATION],
          menuNames: ["questionReview", "multipleChoiceQuestion"],
        },
      },
      denied,
      () => assert.fail("must not continue"),
    );
    assert.equal(denied.state.status, 403);
  }
});

test("Checker Admin can access branch-unit events", () => {
  let allowed = false;
  enforceRoutePolicy({ path: "/events", user: { roleNames: [ROLES.CHECKER_ADMIN], menuNames: ["eventPreparation"] } }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test("examination APIs require the Operational role and examination menu", () => {
  for (const path of [
    "/examination",
    "/examinationEssay",
    "/examinationAnswer",
    "/examinationMultipleChoice",
    "/examinationMultipleChoiceAnswer",
  ]) {
    let allowed = false;
    enforceRoutePolicy(
      { path, user: { roleNames: [ROLES.OPERATIONAL], menuNames: ["examination"] } },
      response(),
      () => { allowed = true; },
    );
    assert.equal(allowed, true, `${path} should allow an authorized Operational user`);
  }

  const wrongRole = response();
  enforceRoutePolicy(
    { path: "/examinationEssay", user: { roleNames: [ROLES.DOCTOR], menuNames: ["examination"] } },
    wrongRole,
    () => assert.fail("must not continue"),
  );
  assert.equal(wrongRole.state.status, 403);

  const missingMenu = response();
  enforceRoutePolicy(
    { path: "/examinationEssay", user: { roleNames: [ROLES.OPERATIONAL], menuNames: [] } },
    missingMenu,
    () => assert.fail("must not continue"),
  );
  assert.equal(missingMenu.state.status, 403);
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

test("rating endpoints require their explicit database menu assignments", () => {
  for (const path of ["/ratingSummary", "/allRatings"]) {
    const denied = response();
    enforceRoutePolicy(
      { method: "GET", path, user: { roleNames: [ROLES.OPERATIONAL], menuNames: [] } },
      denied,
      () => assert.fail("must not continue"),
    );
    assert.equal(denied.state.status, 403);
  }

  let summaryAllowed = false;
  enforceRoutePolicy(
    { method: "GET", path: "/ratingSummary", user: { menuNames: ["ratingSummary"] } },
    response(),
    () => { summaryAllowed = true; },
  );
  assert.equal(summaryAllowed, true);
});

test("every personal document mutation includes the authenticated owner in resource lookup", async () => {
  const cases = [
    ["license", "/licenseUser/42", "userNik"],
    ["logBookUser", "/logbookUser/42", "userNik"],
    ["ielp", "/ielpUser/42", "userNik"],
    ["medex", "/medexUser/42", "userNik"],
    ["competence", "/competenceUser/42", "userId"],
    ["applicationDoc", "/applicationDocument/42", "userNik"],
  ];

  for (const [modelName, requestPath, ownerField] of cases) {
    const model = prisma[modelName];
    const originalFindFirst = model.findFirst;
    let lookupWhere;
    model.findFirst = async ({ where }) => {
      lookupWhere = where;
      return null;
    };

    try {
      const denied = response();
      await enforceResourceScope(
        {
          method: "DELETE",
          path: requestPath,
          user: { nik: "owner-100", roleNames: [ROLES.GENERAL_ADMIN] },
        },
        denied,
        () => assert.fail("must not continue"),
      );
      assert.deepEqual(lookupWhere, { id: 42, [ownerField]: "owner-100", deletedAt: null });
      assert.equal(denied.state.status, 404);
    } finally {
      model.findFirst = originalFindFirst;
    }
  }
});

test("test login bypass refuses non-loopback binding", () => {
  assert.equal(canEnableTestLoginBypass({ production: false, host: "127.0.0.1" }), true);
  assert.equal(canEnableTestLoginBypass({ production: false, host: "localhost" }), true);
  assert.equal(canEnableTestLoginBypass({ production: false, host: "0.0.0.0" }), false);
  assert.equal(canEnableTestLoginBypass({ production: true, host: "127.0.0.1" }), false);
});

test("account login cooldown escalates after repeated failures", () => {
  const config = {
    failureWindowMs: 30 * 60 * 1000,
    cooldownThreshold: 5,
    firstCooldownMs: 5 * 60 * 1000,
    secondCooldownMs: 15 * 60 * 1000,
    maximumCooldownMs: 30 * 60 * 1000,
  };
  assert.equal(calculateCooldownMs(4, config), 0);
  assert.equal(calculateCooldownMs(5, config), 5 * 60 * 1000);
  assert.equal(calculateCooldownMs(6, config), 15 * 60 * 1000);
  assert.equal(calculateCooldownMs(7, config), 30 * 60 * 1000);
});

test("expired failure windows restart the per-account counter", () => {
  const now = new Date("2026-08-14T10:00:00.000Z");
  const state = calculateFailureState({
    previous: {
      failedLoginCount: 6,
      firstFailedAt: new Date("2026-08-14T08:00:00.000Z"),
      lastFailedAt: new Date("2026-08-14T08:10:00.000Z"),
    },
    now,
    config: {
      failureWindowMs: 30 * 60 * 1000,
      cooldownThreshold: 5,
      firstCooldownMs: 5 * 60 * 1000,
      secondCooldownMs: 15 * 60 * 1000,
      maximumCooldownMs: 30 * 60 * 1000,
    },
  });
  assert.equal(state.failedLoginCount, 1);
  assert.equal(state.lockedUntil, null);
  assert.equal(state.firstFailedAt, now);
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

test("Checker Admin may manage another sector inside the same branch unit", () => {
  let allowed = false;
  enforceTenantBody(
    {
      user: {
        roleNames: [ROLES.CHECKER_ADMIN],
        branchId: 1,
        branchUnitId: 5,
        sectorId: 8,
      },
      body: { sectorId: 9 },
    },
    response(),
    () => { allowed = true; },
  );
  assert.equal(allowed, true);
});

test("Checker Admin cannot manage another branch unit", () => {
  const res = response();
  enforceTenantBody(
    {
      user: {
        roleNames: [ROLES.CHECKER_ADMIN],
        branchId: 1,
        branchUnitId: 5,
        sectorId: 8,
      },
      body: { branchUnitId: 6, sectorId: 9 },
    },
    res,
    () => assert.fail("must not continue"),
  );
  assert.equal(res.state.status, 403);
});

test("rich text sanitizer keeps editor formatting but removes executable markup", () => {
  const req = { body: { question: '<h1>Heading</h1><p onclick="alert(1)">Safe<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>' } };
  sanitizeRichText(req, {}, () => {});
  assert.equal(req.body.question.includes("<h1>Heading</h1>"), true);
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

test("upload validation rejects spoofed MIME types and removes the file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simponi-upload-"));
  const filePath = path.join(directory, "spoofed.png");
  await fs.writeFile(filePath, "this is not a PNG");

  const req = {
    files: [{
      fieldname: "image",
      filename: "spoofed.png",
      path: filePath,
      mimetype: "image/png",
    }],
  };

  const error = await new Promise(resolve => {
    validateUploadedFiles(new Set(["image/png"]))(req, {}, resolve);
  });

  assert.equal(error?.code, "INVALID_FILE_CONTENT");
  await assert.rejects(fs.access(filePath));
  await fs.rm(directory, { recursive: true, force: true });
});

test("upload validation detects content and normalizes the extension", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simponi-upload-"));
  const filePath = path.join(directory, "image.fake");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await fs.writeFile(filePath, png);

  const req = {
    files: [{
      fieldname: "image",
      filename: "image.fake",
      path: filePath,
      mimetype: "image/png",
    }],
  };

  const error = await new Promise(resolve => {
    validateUploadedFiles(new Set(["image/png"]))(req, {}, resolve);
  });

  assert.equal(error, undefined);
  assert.equal(req.files[0].filename, "image.png");
  assert.equal(req.files[0].mimetype, "image/png");
  await fs.access(req.files[0].path);
  await fs.rm(directory, { recursive: true, force: true });
});

test("cookie parser handles encoded session values", () => {
  assert.deepEqual(parseCookies("auth_token=abc.def; csrf_token=a%2Fb"), {
    auth_token: "abc.def",
    csrf_token: "a/b",
  });
});

test("CSRF middleware rejects a missing or mismatched token", () => {
  for (const headerToken of [undefined, "wrong-token"]) {
    const res = response();
    enforceCsrf({
      method: "POST",
      headers: { cookie: "csrf_token=expected-token" },
      get: () => headerToken,
    }, res, () => assert.fail("must not continue"));
    assert.equal(res.state.status, 403);
  }
});

test("CSRF middleware accepts matching tokens and safe methods", () => {
  let postAllowed = false;
  enforceCsrf({
    method: "POST",
    headers: { cookie: "csrf_token=expected-token" },
    get: () => "expected-token",
  }, response(), () => { postAllowed = true; });
  assert.equal(postAllowed, true);

  let getAllowed = false;
  enforceCsrf({ method: "GET", headers: {}, get: () => undefined }, response(), () => { getAllowed = true; });
  assert.equal(getAllowed, true);
});

test("CWP management scopes records and mutations to the authenticated branch unit", async () => {
  const controllers = await Promise.all([
    "cwpController.js",
    "cwpSectorController.js",
    "cwpFrequencyController.js",
    "cwpSupervisorController.js",
  ].map((file) => fs.readFile(new URL(`../controller/${file}`, import.meta.url), "utf8")));

  for (const controller of controllers) {
    assert.match(controller, /branchUnitId/);
    assert.match(controller, /prisma\.cwp\.findMany\([\s\S]*?branchUnitId/);
  }

  assert.match(controllers[0], /prisma\.cwp\.create\([\s\S]*?branchUnitId/);
  assert.match(controllers[0], /prisma\.cwp\.findFirst\([\s\S]*?branchUnitId/);
});
