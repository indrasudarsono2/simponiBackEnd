import assert from "node:assert/strict";
import test from "node:test";

import {
  EXAMINATION_STATUSES,
  deriveOverallExaminationStatus,
  deriveMode1TheoryOutcome,
  deriveRatingExaminationStatus,
} from "../services/examinationStatus.js";

const now = new Date("2026-09-21T04:00:00.000Z");
const event = {
  startDate: "2026-09-20T00:00:00.000Z",
  finishDate: "2026-09-22T00:00:00.000Z",
};
const openRoom = {
  startDate: "2026-09-21T00:00:00.000Z",
  finishDate: "2026-09-21T08:00:00.000Z",
};

test("Mode 1 failure opens the first re-check and Easy repeats, while Hard stops after two attempts", () => {
  assert.deepEqual(deriveMode1TheoryOutcome({ passed: false, difficulty: "HARD", attemptCount: 1 }), {
    finalScoreStatusId: 6,
    appRatingStatusId: 5,
  });
  assert.equal(deriveMode1TheoryOutcome({ passed: false, difficulty: "HARD", attemptCount: 2 }).appRatingStatusId, 6);
  assert.equal(deriveMode1TheoryOutcome({ passed: false, difficulty: "EASY", attemptCount: 3 }).appRatingStatusId, 5);
});

test("passing a re-check closes theory instead of leaving its score in RECHECK", () => {
  assert.deepEqual(deriveMode1TheoryOutcome({ passed: true, difficulty: "EASY", attemptCount: 2 }), {
    finalScoreStatusId: 7,
    appRatingStatusId: 7,
  });
  assert.deepEqual(deriveMode1TheoryOutcome({ passed: true, difficulty: "HARD", attemptCount: 2, waitingPracticalStatusId: 8 }), {
    finalScoreStatusId: 8,
    appRatingStatusId: 8,
  });
});

test("completed examination is derived from the active final score", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: {
      status: { status: "SUCCESS" },
      finalScores: [
        {
          status: { status: "SUCCESS" },
          finalScore: 90,
          updatedAt: "2026-09-21T03:30:00.000Z",
        },
      ],
    },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.COMPLETED);
  assert.equal(result.canStart, false);
  assert.equal(result.completedAt, "2026-09-21T03:30:00.000Z");
});

test("failed theory attempt is still a completed attempt", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: {
      status: { status: "FAILED" },
      finalScores: [{ status: { status: "FAILED" } }],
    },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.COMPLETED);
});

test("re-check status takes precedence over the previous failed score", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: {
      status: { status: "RECHECK" },
      finalScores: [{ status: { status: "FAILED" }, finalScore: 61.1111 }],
    },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.IN_PROGRESS);
  assert.equal(result.canStart, true);
});

test("checked essay is an in-progress examination ready for multiple choice", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: { status: { status: "CHECKED" }, finalScores: [] },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.IN_PROGRESS);
  assert.equal(result.canStart, true);
});

test("registered examination with monitoring progress can be resumed", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: {
      status: { status: "REGISTERED" },
      finalScores: [],
      monitorTimes: [{ time: 12 }],
    },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.IN_PROGRESS);
  assert.equal(result.canStart, true);
});

test("registered rating without a room waits for room assignment", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: null,
    appRating: { status: { status: "REGISTERED" }, finalScores: [] },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.WAITING_ROOM);
  assert.equal(result.canStart, false);
});

test("registered rating in an open room is not started and can start", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: { status: { status: "REGISTERED" }, finalScores: [] },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.NOT_STARTED);
  assert.equal(result.canStart, true);
});

test("uncompleted examination after the room closes is expired", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: {
      startDate: "2026-09-20T00:00:00.000Z",
      finishDate: "2026-09-20T08:00:00.000Z",
    },
    appRating: { status: { status: "REGISTERED" }, finalScores: [] },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.EXPIRED);
});

test("waiting practical reports completed theory without enabling theory restart", () => {
  const result = deriveRatingExaminationStatus({
    now,
    event,
    room: openRoom,
    appRating: {
      status: { status: "WAITING PRACTICAL" },
      finalScores: [{ status: { status: "WAITING PRACTICAL" } }],
    },
  });

  assert.equal(result.status, EXAMINATION_STATUSES.COMPLETED);
  assert.equal(result.awaitingPractical, true);
  assert.equal(result.canStart, false);
});

test("overall status is completed only when every assigned rating is completed", () => {
  const completed = deriveOverallExaminationStatus({
    assigned: true,
    event,
    now,
    ratingStatuses: [
      { status: EXAMINATION_STATUSES.COMPLETED },
      { status: EXAMINATION_STATUSES.COMPLETED },
    ],
  });
  const mixed = deriveOverallExaminationStatus({
    assigned: true,
    event,
    now,
    ratingStatuses: [
      { status: EXAMINATION_STATUSES.COMPLETED },
      { status: EXAMINATION_STATUSES.NOT_STARTED },
    ],
  });

  assert.equal(completed.status, EXAMINATION_STATUSES.COMPLETED);
  assert.equal(mixed.status, EXAMINATION_STATUSES.NOT_STARTED);
});

test("missing event assignment returns not assigned", () => {
  const result = deriveOverallExaminationStatus({
    assigned: false,
    event: null,
    now,
  });

  assert.equal(result.status, EXAMINATION_STATUSES.NOT_ASSIGNED);
});
