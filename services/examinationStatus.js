const toTime = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const latestDate = (items = [], field = "createdAt") => {
  const times = items
    .map((item) => toTime(item?.[field]))
    .filter((time) => time !== null);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
};

export const EXAMINATION_STATUSES = Object.freeze({
  COMPLETED: "COMPLETED",
  IN_PROGRESS: "IN_PROGRESS",
  NOT_STARTED: "NOT_STARTED",
  WAITING_ROOM: "WAITING_ROOM",
  NOT_ASSIGNED: "NOT_ASSIGNED",
  EXPIRED: "EXPIRED",
});

export const deriveRatingExaminationStatus = ({
  appRating,
  event,
  room,
  now = new Date(),
}) => {
  const nowTime = toTime(now) ?? Date.now();
  const eventStart = toTime(event?.startDate);
  const eventFinish = toTime(event?.finishDate);
  const roomStart = toTime(room?.startDate);
  const roomFinish = toTime(room?.finishDate);
  const statusName = String(appRating?.status?.status || "").toUpperCase();
  const finalScores = Array.isArray(appRating?.finalScores)
    ? appRating.finalScores.filter((score) => !score?.deletedAt && !score?.isInvalidated)
    : [];
  const latestFinalScore = finalScores[0] || null;
  const finalStatusName = String(latestFinalScore?.status?.status || "").toUpperCase();
  const completedAt = latestFinalScore?.updatedAt || latestFinalScore?.createdAt || null;

  if (["SUCCESS", "FAILED"].includes(finalStatusName || statusName)) {
    return {
      status: EXAMINATION_STATUSES.COMPLETED,
      message:
        (finalStatusName || statusName) === "SUCCESS"
          ? "Examination completed successfully."
          : "Examination completed; the passing grade was not achieved.",
      completedAt,
      canStart: false,
    };
  }

  if (["WAITING PRACTICAL", "PRACTICAL RECHECK"].includes(finalStatusName || statusName)) {
    return {
      status: EXAMINATION_STATUSES.COMPLETED,
      message:
        finalStatusName === "PRACTICAL RECHECK" || statusName === "PRACTICAL RECHECK"
          ? "Theory examination completed; practical recheck is required."
          : "Theory examination completed; waiting for the practical examination.",
      completedAt,
      canStart: false,
      awaitingPractical: true,
    };
  }

  const hasProgress =
    ["CHECKING ESSAY", "CHECKED"].includes(statusName) ||
    finalScores.length > 0 ||
    (Array.isArray(appRating?.monitorTimes) && appRating.monitorTimes.length > 0);

  if (hasProgress) {
    return {
      status: EXAMINATION_STATUSES.IN_PROGRESS,
      message:
        statusName === "CHECKING ESSAY"
          ? "Essay submitted and waiting to be checked."
          : "Examination is in progress.",
      completedAt: null,
      canStart: ["REGISTERED", "RECHECK", "CHECKED"].includes(statusName),
    };
  }

  const effectiveFinish = roomFinish ?? eventFinish;
  if (effectiveFinish !== null && nowTime > effectiveFinish) {
    return {
      status: EXAMINATION_STATUSES.EXPIRED,
      message: "The examination period has ended.",
      completedAt: null,
      canStart: false,
    };
  }

  if (eventStart !== null && nowTime < eventStart) {
    return {
      status: EXAMINATION_STATUSES.NOT_STARTED,
      message: "The examination has not started yet.",
      completedAt: null,
      canStart: false,
    };
  }

  if (roomStart === null || roomFinish === null) {
    return {
      status: EXAMINATION_STATUSES.WAITING_ROOM,
      message: "The examination room has not been assigned yet.",
      completedAt: null,
      canStart: false,
    };
  }

  if (nowTime < roomStart) {
    return {
      status: EXAMINATION_STATUSES.WAITING_ROOM,
      message: "The examination room is assigned but not open yet.",
      completedAt: null,
      canStart: false,
    };
  }

  return {
    status: EXAMINATION_STATUSES.NOT_STARTED,
    message: "The examination is ready to start.",
    completedAt: null,
    canStart: ["REGISTERED", "RECHECK"].includes(statusName),
  };
};

export const deriveOverallExaminationStatus = ({
  ratingStatuses = [],
  event,
  assigned = false,
  now = new Date(),
}) => {
  if (!assigned || !event) {
    return {
      status: EXAMINATION_STATUSES.NOT_ASSIGNED,
      message: "No examination has been assigned to you.",
    };
  }

  if (!ratingStatuses.length) {
    const finishTime = toTime(event.finishDate);
    if (finishTime !== null && (toTime(now) ?? Date.now()) > finishTime) {
      return {
        status: EXAMINATION_STATUSES.EXPIRED,
        message: "The assigned examination period has ended.",
      };
    }
    return {
      status: EXAMINATION_STATUSES.NOT_ASSIGNED,
      message: "No rating has been assigned for this examination.",
    };
  }

  const statuses = ratingStatuses.map((item) => item.status);
  if (statuses.every((status) => status === EXAMINATION_STATUSES.COMPLETED)) {
    return {
      status: EXAMINATION_STATUSES.COMPLETED,
      message: "You have completed all assigned examinations.",
      completedAt: latestDate(ratingStatuses, "completedAt"),
    };
  }
  if (statuses.includes(EXAMINATION_STATUSES.IN_PROGRESS)) {
    return {
      status: EXAMINATION_STATUSES.IN_PROGRESS,
      message: "You have an examination in progress.",
    };
  }
  if (statuses.includes(EXAMINATION_STATUSES.NOT_STARTED)) {
    return {
      status: EXAMINATION_STATUSES.NOT_STARTED,
      message: "An assigned examination is ready or waiting to start.",
    };
  }
  if (statuses.includes(EXAMINATION_STATUSES.WAITING_ROOM)) {
    return {
      status: EXAMINATION_STATUSES.WAITING_ROOM,
      message: "The examination is waiting for an available room.",
    };
  }
  return {
    status: EXAMINATION_STATUSES.EXPIRED,
    message: "The examination period has ended.",
  };
};
