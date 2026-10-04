import prisma from "../lib/prisma.js";
import sanitizeHtml from "sanitize-html";
import { createTheoryQuestionSnapshot } from "../services/theorySessionQuestions.js";
import { finalizeTheorySession, theoryClockPayload, theoryRemainingMs } from "../services/theorySessionService.js";
import { theoryWeightError } from "../services/theoryWeightValidation.js";

const positiveId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const errorResponse = (res, error) => {
  console.error("Theory session request failed", error);
  return res.status(500).json({ message: "Unable to process the theory session." });
};
const leadSessionWhere = (req, id) => ({
  id,
  event: { sector: { branchUnitId: req.user.branchUnitId, deletedAt: null }, theoryMode: "MODE_2", deletedAt: null },
});
const participantWhere = (req, id) => ({
  sessionId: id,
  eventUser: { userNik: req.user.nik, deletedAt: null },
});
const flat = (groups = []) => groups.flatMap((group) => group.questions || []);
const isActiveEvent = (event, now = new Date()) =>
  Boolean(event.startDate && event.finishDate && now >= event.startDate && now <= event.finishDate);

export const listLeadEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { theoryMode: "MODE_2", deletedAt: null, startDate: { lte: new Date() }, finishDate: { gte: new Date() }, sector: { branchUnitId: req.user.branchUnitId, deletedAt: null } },
      select: {
        id: true, event: true, startDate: true, finishDate: true, difficulty: true,
        eventUsers: {
          where: { deletedAt: null },
          select: { id: true, userNik: true, user: { select: { name: true } }, applicationDocs: {
            where: { deletedAt: null, statusId: 2, briefingDate: { not: null } },
            select: { appRatings: { where: { deletedAt: null }, select: { id: true, rating: { select: { rating: true } } } } },
          } },
        },
      },
      orderBy: { startDate: "desc" },
    });
    res.json(events);
  } catch (error) { errorResponse(res, error); }
};

export const listLeadSessions = async (req, res) => {
  try {
    const sessions = await prisma.theorySession.findMany({
      where: { event: { sector: { branchUnitId: req.user.branchUnitId, deletedAt: null }, theoryMode: "MODE_2", deletedAt: null } },
      include: {
        event: { select: { event: true, difficulty: true } },
        selectedEvents: { include: { event: { select: { id: true, event: true, startDate: true, finishDate: true } } } },
        participants: { select: { id: true, appRatingId: true, finalizedAt: true, eventUser: { select: { id: true, userNik: true, user: { select: { name: true } } } }, appRating: { select: { rating: { select: { rating: true } } } } } },
        actions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    res.json(sessions.map((session) => ({ ...session, events: session.selectedEvents.map((item) => item.event), clock: theoryClockPayload(session, now) })));
  } catch (error) { errorResponse(res, error); }
};

export const listLeadClocks = async (req, res) => {
  try {
    if (!req.user.branchUnitId) return res.status(403).json({ message: "Branch unit assignment is required." });
    const sessions = await prisma.theorySession.findMany({
      where: { event: { sector: { branchUnitId: req.user.branchUnitId, deletedAt: null }, theoryMode: "MODE_2", deletedAt: null } },
      select: { id: true, status: true, remainingSeconds: true, resumedAt: true, durationSeconds: true, startedAt: true, endedAt: true, eventId: true, name: true },
    });
    const now = new Date();
    res.json(sessions.map((session) => theoryClockPayload(session, now)));
  } catch (error) { errorResponse(res, error); }
};

export const createSession = async (req, res) => {
  try {
    const requestedEventIds = req.body?.eventIds ?? (req.body?.eventId ? [req.body.eventId] : []);
    const eventIds = Array.isArray(requestedEventIds) ? requestedEventIds.map(positiveId) : [];
    const durationMinutes = Number(req.body?.durationMinutes);
    const name = String(req.body?.name || "").trim();
    const userIds = req.body?.eventUserIds;
    if (!eventIds.length || eventIds.some((id) => !id) || new Set(eventIds).size !== eventIds.length || !name || name.length > 150 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 || !Array.isArray(userIds) || userIds.length < 1) {
      return res.status(400).json({ message: "Active events, session name, duration (1–1440 minutes), and participants are required." });
    }
    const ids = userIds.map(positiveId);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return res.status(400).json({ message: "Choose distinct valid participants." });
    const now = new Date();
    const events = await prisma.event.findMany({ where: { id: { in: eventIds }, theoryMode: "MODE_2", deletedAt: null, sector: { branchUnitId: req.user.branchUnitId, deletedAt: null } }, select: { id: true, startDate: true, finishDate: true } });
    if (events.length !== eventIds.length || events.some((event) => !isActiveEvent(event, now))) return res.status(409).json({ message: "Every selected Mode 2 event must be active and in your branch unit." });
    const eligible = await prisma.eventUser.findMany({
      where: { id: { in: ids }, eventId: { in: eventIds }, deletedAt: null, applicationDocs: { some: { deletedAt: null, statusId: 2, briefingDate: { not: null }, appRatings: { some: { deletedAt: null } } } } },
      select: { id: true, userNik: true },
    });
    if (eligible.length !== ids.length) return res.status(400).json({ message: "Every participant must have a verified application and assigned rating in this event." });
    if (new Set(eligible.map((user) => user.userNik)).size !== eligible.length) return res.status(400).json({ message: "Choose only one event enrollment per user in a session." });
    const session = await prisma.theorySession.create({ data: {
      eventId: eventIds[0], leadNik: req.user.nik, name, status: "WAITING", durationSeconds: durationMinutes * 60, remainingSeconds: durationMinutes * 60,
      selectedEvents: { create: eventIds.map((eventId) => ({ eventId })) },
      participants: { create: ids.map((eventUserId) => ({ eventUserId })) },
      actions: { create: { actorNik: req.user.nik, action: "CREATED", seconds: durationMinutes * 60 } },
    } });
    res.status(201).json({ session, clock: theoryClockPayload(session) });
  } catch (error) { errorResponse(res, error); }
};

export const controlSession = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const action = String(req.params.action || "").toUpperCase();
    if (!id || !["START", "PAUSE", "RESUME", "ADD_TIME"].includes(action)) return res.status(400).json({ message: "Invalid session action." });
    const session = await prisma.theorySession.findFirst({ where: leadSessionWhere(req, id), include: { event: { select: { startDate: true, finishDate: true } }, selectedEvents: { include: { event: { select: { id: true, startDate: true, finishDate: true } } } } } });
    if (!session) return res.status(404).json({ message: "Session not found in your branch unit." });
    const now = new Date();
    const sessionEvents = session.selectedEvents.length ? session.selectedEvents.map((item) => item.event) : [session.event];
    if (action === "START" && sessionEvents.some((event) => !isActiveEvent(event, now))) {
      return res.status(409).json({ message: "One or more selected events are outside their active date range." });
    }
    if (action === "START") {
      for (const event of sessionEvents) {
        const weightError = await theoryWeightError(event.id);
        if (weightError) return res.status(409).json({ message: weightError });
      }
    }
    const expected = action === "START" ? "WAITING" : action === "PAUSE" ? "RUNNING" : action === "RESUME" ? "PAUSED" : null;
    if (expected && session.status !== expected) return res.status(409).json({ message: `Session must be ${expected} to ${action.toLowerCase()}.` });
    if (action === "ADD_TIME" && !["RUNNING", "PAUSED"].includes(session.status)) return res.status(409).json({ message: "Extra time can only be added while running or paused." });
    const seconds = action === "ADD_TIME" ? Number(req.body?.minutes) * 60 : null;
    const reason = String(req.body?.reason || "").trim();
    if (action === "ADD_TIME" && (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400 || reason.length < 10)) {
      return res.status(400).json({ message: "Enter 1–1440 extra minutes and a reason of at least 10 characters." });
    }
    const remainingSeconds = Math.ceil(theoryRemainingMs(session, now) / 1000);
    if (session.status === "RUNNING" && remainingSeconds <= 0) {
      await finalizeTheorySession(id);
      return res.status(409).json({ message: "The session has ended." });
    }
    const nextStatus = action === "START" || action === "RESUME" ? "RUNNING" : action === "PAUSE" ? "PAUSED" : session.status;
    const nextRemaining = action === "ADD_TIME" ? remainingSeconds + seconds : remainingSeconds;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.theorySession.updateMany({
        where: { id, status: session.status, resumedAt: session.resumedAt },
        data: {
          status: nextStatus,
          remainingSeconds: nextRemaining,
          resumedAt: nextStatus === "RUNNING" ? now : null,
          ...(action === "START" ? { startedAt: now } : {}),
        },
      });
      if (result.count !== 1) return null;
      await tx.theorySessionAction.create({ data: { sessionId: id, actorNik: req.user.nik, action, seconds, reason: reason || null } });
      return tx.theorySession.findUnique({ where: { id } });
    });
    if (!updated) return res.status(409).json({ message: "Session changed. Refresh and try again." });
    res.json({ clock: theoryClockPayload(updated, now) });
  } catch (error) { errorResponse(res, error); }
};

export const listMySessions = async (req, res) => {
  try {
    const rows = await prisma.theorySessionParticipant.findMany({
      where: { eventUser: { userNik: req.user.nik, deletedAt: null, event: { theoryMode: "MODE_2", deletedAt: null } } },
      include: {
        session: { include: { event: { select: { id: true, event: true, difficulty: true, passingGrade: true } } } },
        appRating: { select: { rating: { select: { rating: true } } } },
        eventUser: { select: { event: { select: { id: true, event: true, difficulty: true, passingGrade: true } }, applicationDocs: { where: { deletedAt: null, statusId: 2, briefingDate: { not: null } }, select: { appRatings: { where: { deletedAt: null }, select: { id: true, rating: { select: { rating: true } }, status: { select: { status: true } } } } } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    res.json(rows.map((row) => ({
      id: row.id,
      session: theoryClockPayload(row.session, now),
      event: row.eventUser.event,
      appRatingId: row.appRatingId,
      rating: row.appRating?.rating?.rating || null,
      eligibleRatings: row.eventUser.applicationDocs.flatMap((doc) => doc.appRatings).filter((rating) => (
        row.eventUser.event?.difficulty === "EASY" ? ["REGISTERED", "RECHECK", "FAILED"] : ["REGISTERED", "RECHECK"]
      ).includes(rating.status?.status || "")).map((rating) => ({ id: rating.id, rating: rating.rating?.rating })),
      finalizedAt: row.finalizedAt,
    })));
  } catch (error) { errorResponse(res, error); }
};

export const getSessionClock = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid session ID." });
    const [participant, isLead] = await Promise.all([
      prisma.theorySessionParticipant.findFirst({ where: participantWhere(req, id), select: { id: true } }),
      prisma.theorySession.findFirst({ where: { ...leadSessionWhere(req, id), leadNik: req.user.nik }, select: { id: true } }),
    ]);
    if (!participant && !isLead) return res.status(403).json({ message: "Not assigned to this session." });
    let session = await prisma.theorySession.findUnique({ where: { id } });
    if (session.status === "RUNNING" && theoryRemainingMs(session) <= 0) {
      await finalizeTheorySession(id);
      session = await prisma.theorySession.findUnique({ where: { id } });
    }
    res.json(theoryClockPayload(session));
  } catch (error) { errorResponse(res, error); }
};

export const chooseRating = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    const appRatingId = positiveId(req.body?.appRatingId);
    if (!id || !appRatingId) return res.status(400).json({ message: "Choose a valid rating." });
    const participant = await prisma.theorySessionParticipant.findFirst({ where: participantWhere(req, id), include: { session: true, eventUser: { include: { event: true } } } });
    if (!participant) return res.status(403).json({ message: "Not assigned to this session." });
    if (participant.appRatingId) return res.status(409).json({ message: "Rating is already locked for this session." });
    if (!["WAITING", "RUNNING", "PAUSED"].includes(participant.session.status) || theoryRemainingMs(participant.session) <= 0) return res.status(409).json({ message: "Session is not available." });
    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null, applicationDoc: { eventUserId: participant.eventUserId, eventUser: { eventId: participant.eventUser.eventId }, deletedAt: null, statusId: 2, briefingDate: { not: null } } },
      include: { status: { select: { status: true } } },
    });
    if (!appRating) return res.status(403).json({ message: "This rating is not assigned to your verified application." });
    const currentStatus = appRating.status?.status || "";
    const allowed = participant.eventUser.event.difficulty === "EASY"
      ? ["REGISTERED", "RECHECK", "FAILED"].includes(currentStatus)
      : ["REGISTERED", "RECHECK"].includes(currentStatus);
    if (!allowed) return res.status(409).json({ message: "This rating is not eligible for another examination attempt." });
    const activeAttempt = await prisma.theorySessionParticipant.findFirst({
      where: { appRatingId, id: { not: participant.id }, session: { status: { in: ["WAITING", "RUNNING", "PAUSED", "ENDING"] } } },
      select: { id: true },
    });
    if (activeAttempt) return res.status(409).json({ message: "This rating is already selected in another active session." });
    const groupMember = await prisma.groupMember.findFirst({ where: { member: req.user.nik, deletedAt: null, group: { eventId: participant.eventUser.eventId, deletedAt: null } }, select: { id: true } });
    if (!groupMember) return res.status(409).json({ message: "Your checker group assignment is not ready." });
    const snapshot = await createTheoryQuestionSnapshot({ event: participant.eventUser.event, appRating, actorNik: req.user.nik });
    const result = await prisma.theorySessionParticipant.updateMany({ where: { id: participant.id, appRatingId: null }, data: { appRatingId, questionSnapshot: snapshot, essayAnswers: {}, multipleChoiceAnswers: {}, joinedAt: new Date() } });
    if (result.count !== 1) return res.status(409).json({ message: "Rating was selected in another tab. Refresh the page." });
    res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (/question|rating|group|MATS/i.test(error.message || "")) return res.status(409).json({ message: error.message });
    errorResponse(res, error);
  }
};

export const getAttempt = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid session ID." });
    let participant = await prisma.theorySessionParticipant.findFirst({ where: participantWhere(req, id), include: { session: true, appRating: { select: { rating: { select: { rating: true } } } } } });
    if (!participant) return res.status(403).json({ message: "Not assigned to this session." });
    if (participant.session.status === "RUNNING" && theoryRemainingMs(participant.session) <= 0) {
      await finalizeTheorySession(id);
      participant = await prisma.theorySessionParticipant.findFirst({ where: participantWhere(req, id), include: { session: true, appRating: { select: { rating: { select: { rating: true } } } } } });
    }
    const endedAt = participant.session.endedAt?.getTime();
    if (participant.session.status === "ENDED" && (!endedAt || Date.now() - endedAt >= 60_000)) {
      return res.status(410).json({ message: "The feedback window has closed. This session is now history." });
    }
    const feedbackOnly = participant.session.status === "ENDED";
    const result = {
      participantId: participant.id,
      appRatingId: participant.appRatingId,
      rating: participant.appRating?.rating?.rating || null,
      clock: theoryClockPayload(participant.session),
      questions: participant.session.status === "WAITING" || feedbackOnly ? null : !participant.questionSnapshot
        ? participant.questionSnapshot
        : {
          ...participant.questionSnapshot,
          essay: participant.essaySubmittedAt ? [] : participant.questionSnapshot.essay,
          multipleChoice: participant.multipleChoiceSubmittedAt ? [] : participant.questionSnapshot.multipleChoice,
        },
      essayAnswers: feedbackOnly ? {} : participant.essayAnswers || {},
      multipleChoiceAnswers: feedbackOnly ? {} : participant.multipleChoiceAnswers || {},
      essaySubmittedAt: participant.essaySubmittedAt,
      multipleChoiceSubmittedAt: participant.multipleChoiceSubmittedAt,
      finalizedAt: participant.finalizedAt,
    };
    if (feedbackOnly && participant.finalScoreId) {
      const score = await prisma.finalScore.findUnique({ where: { id: participant.finalScoreId }, select: { multipleChoiceScore: true, essayScore: true, finalScore: true, status: { select: { status: true } } } });
      const questions = flat(participant.questionSnapshot?.multipleChoice);
      const answers = participant.multipleChoiceAnswers || {};
      const keys = await prisma.multipleChoice.findMany({ where: { id: { in: questions.map((item) => item.id) } }, select: { id: true, key: true } });
      const keyById = new Map(keys.map((item) => [item.id, String(item.key || "").toUpperCase()]));
      const wrongQuestions = questions.filter((item) => String(answers[item.id] || "").toUpperCase() !== keyById.get(item.id));
      result.multipleChoiceResult = {
        score: score?.multipleChoiceScore,
        wrongQuestionIds: wrongQuestions.map((item) => item.id),
        wrongQuestions: wrongQuestions.map((item) => ({
          id: item.id,
          question: item.question,
          image: item.image,
          selectedAnswer: ["A", "B", "C", "D"].includes(String(answers[item.id] || "").toUpperCase())
            ? String(item[String(answers[item.id]).toLowerCase()] || "") : null,
        })),
      };
    }
    res.json(result);
  } catch (error) { errorResponse(res, error); }
};

const persistAnswers = async (req, res, submit) => {
  try {
    const id = positiveId(req.params.id);
    const kind = String(req.body?.kind || "").toUpperCase();
    if (!id || !["ESSAY", "MULTIPLE_CHOICE"].includes(kind)) return res.status(400).json({ message: "Invalid examination part." });
    const answers = req.body?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return res.status(400).json({ message: "Answers must be an object keyed by question ID." });
    const participant = await prisma.theorySessionParticipant.findFirst({ where: participantWhere(req, id), include: { session: true } });
    if (!participant?.appRatingId || !participant.questionSnapshot) return res.status(403).json({ message: "Choose your rating before answering." });
    const questions = flat(kind === "ESSAY" ? participant.questionSnapshot.essay : participant.questionSnapshot.multipleChoice);
    if (!questions.length) return res.status(400).json({ message: "This part has no questions." });
    const allowed = new Set(questions.map((item) => String(item.id)));
    if (Object.keys(answers).some((key) => !allowed.has(key))) return res.status(400).json({ message: "Answers include a question outside your assigned examination." });
    const cleanAnswers = {};
    for (const [key, value] of Object.entries(answers)) {
      if (typeof value !== "string" || value.length > (kind === "ESSAY" ? 20000 : 5)) return res.status(400).json({ message: "An answer is invalid or too long." });
      if (kind === "MULTIPLE_CHOICE" && value && !["A", "B", "C", "D"].includes(value.toUpperCase())) return res.status(400).json({ message: "Multiple Choice answers must be A, B, C, or D." });
      cleanAnswers[key] = kind === "MULTIPLE_CHOICE" ? value.toUpperCase() : sanitizeHtml(value, {
        allowedTags: ["p", "br", "strong", "b", "em", "i", "s", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2"],
        allowedAttributes: {},
      });
    }
    const field = kind === "ESSAY" ? "essayAnswers" : "multipleChoiceAnswers";
    const submittedField = kind === "ESSAY" ? "essaySubmittedAt" : "multipleChoiceSubmittedAt";
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const lock = await tx.theorySession.updateMany({ where: { id, status: "RUNNING" }, data: { updatedAt: now } });
      if (lock.count !== 1) return false;
      const active = await tx.theorySession.findUnique({ where: { id } });
      if (theoryRemainingMs(active, now) <= 0) return false;
      const updated = await tx.theorySessionParticipant.updateMany({
        where: { id: participant.id, [submittedField]: null, finalizedAt: null },
        data: { [field]: cleanAnswers, ...(submit ? { [submittedField]: now } : {}) },
      });
      return updated.count === 1;
    });
    if (!result) {
      await finalizeTheorySession(id);
      return res.status(409).json({ message: "The session is paused, ended, or this part was already submitted." });
    }
    res.json({ success: true, submitted: Boolean(submit) });
  } catch (error) { errorResponse(res, error); }
};

export const saveDraft = (req, res) => persistAnswers(req, res, false);
export const submitPart = (req, res) => persistAnswers(req, res, true);
