import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = "test-jwt-secret-that-is-longer-than-32-characters";
const { default: prisma } = await import("../lib/prisma.js");
const { enforceRoutePolicy } = await import("../middleware/routePolicy.js");
const eventController = await import("../controller/eventController.js");
const groupController = await import("../controller/groupController.js");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const user = { nik: "checker-admin", branchUnitId: 5, branchId: 2, roleNames: ["CHECKER ADMIN"], menuNames: ["eventPreparation"] };
const replaceDelegates = (replacements) => {
  const originals = Object.fromEntries(Object.keys(replacements).map((key) => [key, prisma[key]]));
  for (const [key, value] of Object.entries(replacements)) prisma[key] = value;
  return () => { for (const [key, value] of Object.entries(originals)) prisma[key] = value; };
};

test("event-user helper routes require the Event Preparation menu", () => {
  for (const [method, path] of [
    ["GET", "/eventsGetUser/10"],
    ["GET", "/eventsGetEventUser/10"],
    ["POST", "/eventsPostUser"],
    ["POST", "/eventsDeleteEventUser"],
  ]) {
    let nextCalled = false;
    const denied = response();
    enforceRoutePolicy({ method, path, user: { ...user, menuNames: [] } }, denied, () => { nextCalled = true; });
    assert.equal(nextCalled, false, path);
    assert.equal(denied.statusCode, 403, path);
    const allowed = response();
    enforceRoutePolicy({ method, path, user }, allowed, () => { nextCalled = true; });
    assert.equal(nextCalled, true, path);
  }
});

test("event-user lookup cannot read an event outside its branch unit", async () => {
  let queriedWhere;
  let listed = false;
  const restore = replaceDelegates({
    event: { findFirst: async ({ where }) => { queriedWhere = where; return null; } },
    eventUser: { findMany: async () => { listed = true; } },
  });
  try {
    const res = response();
    await eventController.getEventUser({ params: { id: "10" }, user }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(queriedWhere.sector, { branchUnitId: 5 });
    assert.equal(listed, false);
  } finally { restore(); }
});

test("event-user assignment rejects members outside the event sector", async () => {
  let created = false;
  const restore = replaceDelegates({
    event: { findFirst: async () => ({ id: 10, sectorId: 7 }) },
    user: { count: async ({ where }) => { assert.equal(where.sectorId, 7); return 0; } },
    eventUser: { createMany: async () => { created = true; } },
  });
  try {
    const res = response();
    await eventController.postUser({ body: { eventId: 10, userNiks: ["other-branch"] }, user }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(created, false);
  } finally { restore(); }
});

test("event-user removal rejects mixed-scope assignment IDs atomically", async () => {
  let queriedWhere;
  let deleted = false;
  const restore = replaceDelegates({ eventUser: {
    count: async ({ where }) => { queriedWhere = where; return 1; },
    deleteMany: async () => { deleted = true; },
  } });
  try {
    const res = response();
    await eventController.deleteEventUser({ body: { ids: [3, 4] }, user }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(queriedWhere.event.sector, { branchUnitId: 5 });
    assert.equal(deleted, false);
  } finally { restore(); }
});

test("event creation rejects a session and sector outside the caller's branch unit", async () => {
  let created = false;
  const restore = replaceDelegates({
    session: { findFirst: async () => ({ branchUnitId: 8, branchUnit: { branchId: 2 } }) },
    sector: { findFirst: async () => ({ branchUnitId: 8, branchUnit: { branchId: 2 } }) },
    event: { create: async () => { created = true; } },
  });
  try {
    const res = response();
    await eventController.addEvents({ body: { sessionId: 2, sectorId: 3 }, files: [], user }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(created, false);
  } finally { restore(); }
});

test("event update cannot relocate an in-scope event to another branch unit", async () => {
  let updated = false;
  const restore = replaceDelegates({
    event: {
      findFirst: async () => ({ id: 10, sectorId: 3 }),
      update: async () => { updated = true; },
    },
    session: { findFirst: async () => ({ branchUnitId: 8, branchUnit: { branchId: 2 } }) },
    sector: { findFirst: async () => ({ branchUnitId: 8, branchUnit: { branchId: 2 } }) },
  });
  try {
    const res = response();
    await eventController.getEventById({ params: { id: "10" }, body: { sessionId: 2, sectorId: 3 }, files: [], user }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(updated, false);
  } finally { restore(); }
});

test("examination groups reject members not assigned to the event", async () => {
  let created = false;
  const restore = replaceDelegates({
    event: { findFirst: async () => ({ sectorId: 7 }) },
    user: { findMany: async () => [{ nik: "checker-1", userRoles: [{ checkerRatings: [{ id: 1 }] }] }] },
    eventUser: { findMany: async () => [] },
    group: { create: async () => { created = true; } },
  });
  try {
    const res = response();
    await groupController.addGroup({ body: { eventId: 10, pic: "checker-1", checkers: ["checker-1"], members: ["unassigned-user"], group: "Test" }, user }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(created, false);
  } finally { restore(); }
});
