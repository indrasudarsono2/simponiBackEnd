import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { getExamConfiguration } from '../services/eventConfiguration.js';

const postTime = async (req, res) => {
  try {
    const appRatingId = Number(req.body.appRatingId);
    const eventQuestionId = Number(req.body.eventQuestionId);
    const isInitial = req.body.isInitial === true;
    if (!Number.isInteger(appRatingId) || appRatingId <= 0 || !Number.isInteger(eventQuestionId) || eventQuestionId <= 0) {
      return res.status(400).json({ message: "Valid appRatingId and eventQuestionId are required." });
    }

    const [appRating, eventQuestion] = await Promise.all([
      prisma.appRating.findFirst({
        where: {
          id: appRatingId,
          deletedAt: null,
          applicationDoc: {
            is: {
              deletedAt: null,
              eventUser: { is: { userNik: req.user.nik, deletedAt: null } },
            },
          },
        },
        select: { id: true, applicationDoc: { select: { eventUser: { select: { eventId: true } } } } },
      }),
      prisma.eventQuestion.findFirst({
        where: { id: eventQuestionId, deletedAt: null, kindOfQuestionId: { in: [1, 2] } },
        select: { id: true, eventId: true, kindOfQuestionId: true, minutes: true },
      }),
    ]);
    if (!appRating || !eventQuestion || appRating.applicationDoc?.eventUser?.eventId !== eventQuestion.eventId) {
      return res.status(404).json({ message: "Examination session was not found for this user." });
    }
    const configuration = await getExamConfiguration(eventQuestion.eventId, { actorNik: req.user.nik, trigger: 'MODE_1_TIMER_START' });
    const savedQuestion = configuration.eventQuestions.find(q => q.id === eventQuestion.id);
    if (!savedQuestion) return res.status(409).json({ message: 'This question type is not in the saved configuration.' });
    eventQuestion.minutes = savedQuestion.minutes;

    const monitor = await prisma.monitorTime.findFirst({
      where: {
        appRatingId,
        eventQuestionId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true
      }
    })
    let startedAt = monitor?.createdAt ?? null;

    // The server-owned draft deadline determines remaining time. Keep only
    // the first monitor row as historical evidence of when this part began.
    if (!monitor && isInitial) {
      const created = await prisma.monitorTime.create({
        data: {
          appRatingId,
          eventQuestionId,
          time: 0
        }
      })
      startedAt = created.createdAt;
    }

    const kind = eventQuestion.kindOfQuestionId === 1 ? "ESSAY" : "MULTIPLE_CHOICE";
    const draft = await prisma.modeOneExamDraft.findUnique({
      where: { appRatingId_kind: { appRatingId, kind } },
      select: { id: true, deadlineAt: true, submittedAt: true },
    });
    let deadlineAt = draft?.deadlineAt ?? null;
    if (draft && !draft.submittedAt && !deadlineAt && isInitial && startedAt) {
      const deadline = new Date(new Date(startedAt).getTime() + Number(eventQuestion.minutes || 0) * 60_000);
      await prisma.modeOneExamDraft.updateMany({
        where: { id: draft.id, deadlineAt: null, submittedAt: null },
        data: { deadlineAt: deadline },
      });
      deadlineAt = (await prisma.modeOneExamDraft.findUnique({ where: { id: draft.id }, select: { deadlineAt: true } }))?.deadlineAt ?? deadline;
    }
    res.status(200).json({ message: "success", deadlineAt });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};
export { postTime };
