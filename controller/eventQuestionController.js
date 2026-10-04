import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import { assertConfigurationEditable } from '../services/eventConfiguration.js';

const isValidWeight = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
const closeToOne = (value) => Math.abs(value - 1) < 0.000001;
const percent = (value) => `${(value * 100).toFixed(0)}%`;

const getEventQuestions = async (req, res) => {
  try {
    const branchUnitId = req.user.branchUnitId;
    // const branchUnitId = 17
   const allAtribute = await prisma.branchUnit.findFirst({
      where: {
        id: branchUnitId
      },
      select: {
        id: true,
        unit: true,
        branch: {
          where: {
            deletedAt: null
          },
          select: {
            branch: true
          }
        },
        sessions: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            session: true,
            events: {
              where: {
                deletedAt: null
              },
              orderBy: [
                { createdAt: 'desc' },
                { id: 'desc' }
              ],
              select: {
                id: true,
                event: true,
                createdAt: true,
                sectorId: true,
                theoryMode: true
              }
            }
          }
        }
      }
    })
    
    const eventId = allAtribute.sessions.flatMap(s => s.events.map(event => event.id))
    const evenQuestion = await prisma.eventQuestion.findMany({
      where: {
        deletedAt: null,
        eventId :{
          in: eventId
        }
      },
      select: {
        id: true,
        eventId: true,
        sectorId: true,
        kindOfQuestionId: true,
        event: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            event: true,
            theoryMode: true
          }
        },
        kindOfQuestion: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            question: true
          }
        },
        quantity: true,
        persentage: true,
        minutes: true
      }
    })

    const kindOfQuestion = await prisma.kindOfQuestion.findMany({
      where: {
        deletedAt: null
      }
    })
  
    res.json({allAtribute,evenQuestion, kindOfQuestion});
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const addEventQuestions = async (req, res) => {
  try {
    const {eventId, sectorId, kindOfQuestionId, quantity, persentage, minutes} = req.body
    if (!isValidWeight(persentage) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || ![1, 2].includes(Number(kindOfQuestionId))) {
      return res.status(400).json({ message: "Provide a valid question type, quantity, and percentage between 0% and 100%." });
    }
    const event = await prisma.event.findFirst({ where: { id: Number(eventId), deletedAt: null, sector: { branchUnitId: req.user.branchUnitId } }, select: { theoryMode: true, sectorId: true } });
    if (!event || Number(sectorId) !== event.sectorId) return res.status(403).json({ message: "Event is outside your branch unit or sector." });
    if (event.theoryMode === "MODE_1" && (!Number.isFinite(Number(minutes)) || Number(minutes) < 1)) return res.status(400).json({ message: "Minutes are required for Mode 1." });
    const result = await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: Number(eventId) }, data: { updatedAt: new Date() } });
      await assertConfigurationEditable(tx, Number(eventId));
      const existing = await tx.eventQuestion.findMany({ where: { eventId: Number(eventId), deletedAt: null, kindOfQuestionId: { in: [1, 2] } }, select: { kindOfQuestionId: true, persentage: true } });
      if (existing.some((item) => item.kindOfQuestionId === Number(kindOfQuestionId))) return { error: "This question type is already configured for the event." };
      const remaining = 1 - existing.reduce((sum, item) => sum + Number(item.persentage || 0), 0);
      if (existing.length && !closeToOne(Number(persentage) + (1 - remaining))) return { error: `Essay and Multiple Choice must total 100%. The remaining percentage is ${percent(remaining)}.` };
      if (!existing.length && Number(persentage) > 1) return { error: "Percentage cannot exceed 100%." };
      await tx.eventQuestion.create({ data: {
        eventId: Number(eventId),
        sectorId: event.sectorId,
        kindOfQuestionId: Number(kindOfQuestionId),
        quantity: Number(quantity),
        persentage: Number(persentage),
        minutes: event.theoryMode === "MODE_2" ? null : Number(minutes)
      } });
      return { success: true };
    });
    if (result.error) return res.status(400).json({ message: result.error });

    res.status(201).json({ success: true});
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
}
const getEventQuestionById = async (req, res) => {
  try {
    const { id } = req.params;
    const {eventId, sectorId, kindOfQuestionId, quantity, persentage, minutes} = req.body
    if (!isValidWeight(persentage) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      return res.status(400).json({ message: "Provide a valid quantity and percentage between 0% and 100%." });
    }
    const event = await prisma.event.findFirst({ where: { id: Number(eventId), deletedAt: null, sector: { branchUnitId: req.user.branchUnitId } }, select: { theoryMode: true, sectorId: true } });
    if (!event || Number(sectorId) !== event.sectorId) return res.status(403).json({ message: "Event is outside your branch unit or sector." });
    if (event.theoryMode === "MODE_1" && (!Number.isFinite(Number(minutes)) || Number(minutes) < 1)) return res.status(400).json({ message: "Minutes are required for Mode 1." });
    const result = await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: Number(eventId) }, data: { updatedAt: new Date() } });
      await assertConfigurationEditable(tx, Number(eventId));
      const current = await tx.eventQuestion.findFirst({ where: { id: Number(id), eventId: Number(eventId), deletedAt: null }, select: { kindOfQuestionId: true } });
      if (!current) return { error: "Event question not found in this event." };
      if (current.kindOfQuestionId !== Number(kindOfQuestionId)) return { error: "Question type cannot be changed. Remove and recreate this configuration instead." };
      const others = await tx.eventQuestion.findMany({ where: { eventId: Number(eventId), id: { not: Number(id) }, deletedAt: null, kindOfQuestionId: { in: [1, 2] } }, select: { id: true } });
      if (others.length > 1) return { error: "Duplicate theory question types must be resolved before editing percentages." };
      await tx.eventQuestion.update({ where: { id: Number(id) }, data: {
        eventId: Number(eventId),
        sectorId: event.sectorId,
        kindOfQuestionId: Number(kindOfQuestionId),
        quantity: Number(quantity),
        persentage: Number(persentage),
        minutes: event.theoryMode === "MODE_2" ? null : Number(minutes)
      } });
      if (others[0]) await tx.eventQuestion.update({ where: { id: others[0].id }, data: { persentage: Number((1 - Number(persentage)).toFixed(6)) } });
      return { success: true, otherPercentage: others[0] ? 1 - Number(persentage) : null };
    });
    if (result.error) return res.status(400).json({ message: result.error });
    
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteEventQuestionId = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
    
    const question = await prisma.eventQuestion.findFirst({ where: { id: Number(id), deletedAt: null, event: { sector: { branchUnitId: req.user.branchUnitId }, deletedAt: null } }, select: { eventId: true } });
    if (!question) return res.status(404).json({ message: 'Event question not found in your scope.' });
    await prisma.$transaction(async tx => {
      await tx.event.update({ where: { id: question.eventId }, data: { updatedAt: new Date() } });
      await assertConfigurationEditable(tx, question.eventId);
      await tx.eventQuestion.update({ where: { id: Number(id) }, data: { deletedAt: now } });
    });
    res.status(201).json({ success: true});
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export { getEventQuestions, addEventQuestions, getEventQuestionById, deleteEventQuestionId };
