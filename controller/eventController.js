import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { readLiveConfiguration, captureConfiguration, assertConfigurationEditable } from '../services/eventConfiguration.js';

dayjs.extend(utc);

const eventFileUrl = (file) => file
  ? `/uploads/event/${file.fieldname === "recommendationFile" ? "recommendation" : "briefing"}/${file.filename}`
  : null;

const removeStoredFile = (storedPath) => {
  if (!storedPath) return;
  const relativePath = storedPath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
};

const positiveId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const eventScope = (req) => {
  const roles = new Set((req.user?.roleNames || []).map((role) => String(role).trim().toUpperCase()));
  if (roles.has("GENERAL ADMIN")) return {};
  if (roles.has("BRANCH ADMIN")) return req.user?.branchId
    ? { sector: { branchUnit: { branchId: req.user.branchId } } }
    : { id: -1 };
  return req.user?.branchUnitId
    ? { sector: { branchUnitId: req.user.branchUnitId } }
    : { id: -1 };
};

const findScopedEvent = (req, id) => prisma.event.findFirst({
  where: { id, deletedAt: null, ...eventScope(req) },
  select: { id: true, sectorId: true },
});

const placementIsAllowed = async (req, sessionId, sectorId) => {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, deletedAt: null },
    select: { branchUnitId: true, branchUnit: { select: { branchId: true } } },
  });
  const sector = await prisma.sector.findFirst({
    where: { id: sectorId, deletedAt: null },
    select: { branchUnitId: true, branchUnit: { select: { branchId: true } } },
  });
  if (!session?.branchUnitId || !sector?.branchUnitId || session.branchUnitId !== sector.branchUnitId) return false;
  const roles = new Set((req.user?.roleNames || []).map((role) => String(role).trim().toUpperCase()));
  if (roles.has("GENERAL ADMIN")) return true;
  if (roles.has("BRANCH ADMIN")) return Boolean(req.user?.branchId) &&
    session.branchUnit?.branchId === req.user.branchId && sector.branchUnit?.branchId === req.user.branchId;
  return Boolean(req.user?.branchUnitId) && session.branchUnitId === req.user.branchUnitId;
};

const getEvents = async (req, res) => {
  try {
    const session = await prisma.session.findMany({
      where: {
        branchUnitId: req.user.branchUnitId,
        // branchUnitId: 5,
        deletedAt: null
      },
      select: {
        id: true,
        session: true,
        branchUnit: {
          select: {
            id: true,
            unit:true,
            branch: {
              select: {
                branch: true
              },
              where: {deletedAt: null}
            },
            sectors: {
              select: {
                id: true,
                sector: true
              },
              where: {deletedAt: null}
            }
          },
          where: {
            deletedAt: null
          }
        },
        events: {
          select: {
            id: true,
            event: true,
            sectorId: true,
            createdAt: true,
            sector: {
              select: {
                sector: true
              }
            },
            formFillingDate: true,
            startDate: true,
            finishDate: true,
            forExpiredDate: true,
            remarkDoc: true,
            passingGrade: true,
            practicalPassingGrade: true,
            briefingFile: true,
            recommendationFile: true,
            theoryMode: true,
            difficulty: true,
            isPractical: true,
            isSimulator: true
          },
          where: {deletedAt: null}
        }
      }
    })

    const remarkDoc = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null
      }
    })
    // Logic to fetch regions (e.g., from a database)
    res.json({session, remarkDoc});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addEvents = async (req, res) => {
  try {
    // Access uploaded files (upload.any() stores in req.files array)
    const files = Array.isArray(req.files) ? req.files : [];
    const briefingFile = files.find((file) => file.fieldname === "briefingFile") || null;
    const recommendationFile = files.find((file) => file.fieldname === "recommendationFile") || null;
    
    // Access other form fields from req.body
    const { sessionId, sectorId, remarkDocId, eventName, startDate, finishDate, forExpDate, formFillingDate, isPractical, isSimulator, theoryMode = "MODE_1", difficulty = "HARD"} = req.body;
    const requestedSessionId = positiveId(sessionId);
    const requestedSectorId = positiveId(sectorId);
    if (!requestedSessionId || !requestedSectorId || !await placementIsAllowed(req, requestedSessionId, requestedSectorId)) {
      return res.status(403).json({ message: "Session and sector must belong to your permitted branch unit." });
    }
    if (!["MODE_1", "MODE_2"].includes(theoryMode) || !["EASY", "HARD"].includes(difficulty)) {
      return res.status(400).json({ message: "Invalid theory mode or difficulty." });
    }
    const standard = await prisma.passingGradeStandard.findUnique({ where: { id: 1 } });
    if (!standard) return res.status(503).json({ message: "Passing grade standard is not configured." });
    const cleanIsPractical = isPractical === 'true' || isPractical === true;
    const cleanIsSimulator = isSimulator === 'true' || isSimulator === true;
    const remarkDoc = await prisma.remarkDoc.findFirst({
      where: { id: parseInt(remarkDocId), deletedAt: null },
      select: { remark: true }
    });
    if (!remarkDoc) {
      return res.status(400).json({ message: "Invalid remark." });
    }
    // Example: Create event with file URL
    const event = await prisma.event.create({
      data: {
        sessionId: parseInt(sessionId),
        sectorId: parseInt(sectorId),
        remarkDocId: parseInt(remarkDocId),
        event: eventName,
        startDate: dayjs.utc(startDate).toDate(),
        finishDate: dayjs.utc(finishDate).toDate(),
        forExpiredDate: dayjs.utc(forExpDate).startOf('day').toDate(),
        formFillingDate: dayjs.utc(formFillingDate).startOf('day').toDate(),
        passingGrade: standard.theoryGrade,
        practicalPassingGrade: standard.practicalGrade,
        isPractical: Boolean(cleanIsPractical),
        isSimulator: Boolean(cleanIsSimulator),
        theoryMode,
        difficulty,
        // Store file URL if file was uploaded
        briefingFile: eventFileUrl(briefingFile),
        recommendationFile: eventFileUrl(recommendationFile),
      }
    });
    
    res.status(200).json({ 
      success: true, 
      event,
      files: files ? files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: eventFileUrl(f)
      })) : null
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
    
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    // Access uploaded files (upload.any() stores in req.files array)
    const files = Array.isArray(req.files) ? req.files : [];
    const briefingFile = files.find((file) => file.fieldname === "briefingFile") || null;
    const recommendationFile = files.find((file) => file.fieldname === "recommendationFile") || null;
    
    // Access other form fields from req.body
    const { sessionId, sectorId, remarkDocId, eventName, startDate, finishDate, forExpDate, formFillingDate, isPractical, isSimulator, theoryMode = "MODE_1", difficulty = "HARD"} = req.body;
    const requestedSessionId = positiveId(sessionId);
    const requestedSectorId = positiveId(sectorId);
    if (!requestedSessionId || !requestedSectorId || !await findScopedEvent(req, positiveId(id)) ||
        !await placementIsAllowed(req, requestedSessionId, requestedSectorId)) {
      return res.status(403).json({ message: "Event, session, or sector is outside your permitted branch unit." });
    }
    if (!["MODE_1", "MODE_2"].includes(theoryMode) || !["EASY", "HARD"].includes(difficulty)) {
      return res.status(400).json({ message: "Invalid theory mode or difficulty." });
    }
    const cleanIsPractical = isPractical === 'true' || isPractical === true;
    const cleanIsSimulator = isSimulator === 'true' || isSimulator === true;
    // Get existing event to find old briefingFile path
    const existingEvent = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      select: { briefingFile: true, recommendationFile: true, startDate: true, theoryMode: true, difficulty: true, theorySessions: { select: { id: true }, take: 1 } }
    });
    if (!existingEvent) return res.status(404).json({ message: "Event not found." });
    const savedConfig = await prisma.eventConfigurationVersion.findFirst({ where: { eventId: Number(id) }, orderBy: { version: 'desc' }, select: { snapshot: true } });
    if (savedConfig && (savedConfig.snapshot.sector?.id !== requestedSectorId || existingEvent.theoryMode !== theoryMode || existingEvent.difficulty !== difficulty)) {
      await assertConfigurationEditable(prisma, Number(id));
    }
    const standard = await prisma.passingGradeStandard.findUnique({ where: { id: 1 } });
    if (!standard) return res.status(503).json({ message: "Passing grade standard is not configured." });
    const hasStarted = existingEvent.startDate && existingEvent.startDate <= new Date();
    if (hasStarted && (existingEvent.theoryMode !== theoryMode || existingEvent.difficulty !== difficulty)) {
      return res.status(409).json({ message: "Examination mode and difficulty cannot change after the event starts." });
    }
    if (existingEvent.theorySessions.length && (existingEvent.theoryMode !== theoryMode || existingEvent.difficulty !== difficulty)) {
      return res.status(409).json({ message: "Examination mode and difficulty cannot change after a Mode 2 session has been created." });
    }

    const remarkDoc = await prisma.remarkDoc.findFirst({
      where: { id: parseInt(remarkDocId), deletedAt: null },
      select: { remark: true }
    });
    if (!remarkDoc) {
      return res.status(400).json({ message: "Invalid remark." });
    }

    await prisma.$transaction(async tx => {
      await tx.event.update({ where: { id: Number(id) }, data: { updatedAt: new Date() } });
      const latest = await tx.eventConfigurationVersion.findFirst({ where: { eventId: Number(id) }, orderBy: { version: 'desc' }, select: { snapshot: true } });
      if (latest && (latest.snapshot.sector?.id !== requestedSectorId || latest.snapshot.theoryMode !== theoryMode || latest.snapshot.difficulty !== difficulty)) await assertConfigurationEditable(tx, Number(id));
      await tx.event.update({
      where: { id: Number(id) },
      data: {
        sessionId: parseInt(sessionId),
        sectorId: parseInt(sectorId),
        remarkDocId: parseInt(remarkDocId),
        event: eventName,
        startDate: dayjs.utc(startDate).toDate(),
        finishDate: dayjs.utc(finishDate).toDate(),
        forExpiredDate: dayjs.utc(forExpDate).startOf('day').toDate(),
        formFillingDate: dayjs.utc(formFillingDate).startOf('day').toDate(),
        ...(!hasStarted && {
          passingGrade: standard.theoryGrade,
          practicalPassingGrade: standard.practicalGrade,
        }),
        isPractical: Boolean(cleanIsPractical),
        isSimulator: Boolean(cleanIsSimulator),
        theoryMode,
        difficulty,
        // Store file URL if file was uploaded, otherwise keep existing
        briefingFile: briefingFile
          ? eventFileUrl(briefingFile)
          : existingEvent?.briefingFile,
        recommendationFile: recommendationFile
          ? eventFileUrl(recommendationFile)
          : existingEvent?.recommendationFile,
      }
      });
      await tx.room.updateMany({ where: { defaultEventId: Number(id) }, data: {
        name: `Default — ${eventName || `Event ${id}`}`.slice(0, 150),
        startDate: dayjs.utc(startDate).toDate(), finishDate: dayjs.utc(finishDate).toDate(),
      } });
    });
    if (briefingFile) removeStoredFile(existingEvent?.briefingFile);
    if (recommendationFile) {
      removeStoredFile(existingEvent?.recommendationFile);
    }
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const deleteEventById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
   
      await prisma.event.update({
      where: { id: parseInt(id) },
      data: { deletedAt: now }
    });
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Valid event ID is required." });
    if (!await findScopedEvent(req, id)) return res.status(404).json({ message: "Event not found in your scope." });
    const userAvailable = [];
    const event = await prisma.event.findFirst({
      where: {
        id,
        deletedAt: null,
        ...eventScope(req),
      },
      select: {
        id: true,
        event: true,
        startDate: true,
        finishDate: true,
        remarkDoc: {
          select: {
            remark: true
          }
        },
        sector: {
          select: {
            users: {
              select: {
                nik: true,
                name: true
              }
            }
          }
        }
      }
    })

    const eventUser = await prisma.eventUser.findMany({
      where: {
        eventId: id,
        deletedAt: null,
      },
      select: {
        userNik: true
      }
    })

    const niksToRemove = eventUser.map(u => u.userNik);
    const userFilter = event.sector.users.filter(i => !niksToRemove.includes(i.nik))
    
    res.json({event, userFilter});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postUser = async (req, res) => {
  try {
    const {eventId, userNiks} = req.body;
    const id = positiveId(eventId);
    if (!id || !Array.isArray(userNiks) || !userNiks.length ||
        userNiks.some((nik) => typeof nik !== "string" || !nik.trim()) ||
        new Set(userNiks).size !== userNiks.length) {
      return res.status(400).json({ message: "Choose an event and valid, distinct users." });
    }
    const event = await findScopedEvent(req, id);
    if (!event?.sectorId) return res.status(404).json({ message: "Event not found in your scope." });
    const eligibleUsers = await prisma.user.count({
      where: { nik: { in: userNiks }, sectorId: event.sectorId, deletedAt: null },
    });
    if (eligibleUsers !== userNiks.length) {
      return res.status(403).json({ message: "One or more users are outside this event's sector." });
    }

    await prisma.eventUser.createMany({
      data: userNiks.map((nik) => ({ userNik: nik, eventId: id }))
    })

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getEventUser = async(req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Valid event ID is required." });
    if (!await findScopedEvent(req, id)) return res.status(404).json({ message: "Event not found in your scope." });

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: id,
      },
      select: {
        id: true,
        user: {
          select: {
            nik: true,
            name: true
          }
        }
      }
    })

    res.json(eventUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const deleteEventUser = async(req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !positiveId(id)) ||
        new Set(ids.map(Number)).size !== ids.length) {
      return res.status(400).json({ message: "Valid, distinct event-user IDs are required." });
    }
    const numericIds = ids.map(Number);
    const scopedAssignments = await prisma.eventUser.count({
      where: { id: { in: numericIds }, deletedAt: null, event: { deletedAt: null, ...eventScope(req) } },
    });
    if (scopedAssignments !== numericIds.length) {
      return res.status(404).json({ message: "One or more event assignments were not found in your scope." });
    }
    await prisma.eventUser.deleteMany({
      where: {
        id: {
          in: numericIds
        },
        deletedAt: null,
        event: { deletedAt: null, ...eventScope(req) },
      }
    })
    
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getQuestionConfiguration = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid event ID." });
    if (!await findScopedEvent(req, id)) return res.status(404).json({ message: "Event not found in your scope." });
    const versions = await prisma.eventConfigurationVersion.findMany({ where: { eventId: id }, orderBy: { version: 'desc' } });
    let editable = true;
    try { await assertConfigurationEditable(prisma, id); } catch (error) { if (error.status !== 409) throw error; editable = false; }
    res.json({ versions, editable, live: editable || !versions.length ? await readLiveConfiguration(prisma, id) : null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const finalizeQuestionConfiguration = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid event ID.' });
    if (!await findScopedEvent(req, id)) return res.status(404).json({ message: 'Event not found in your scope.' });
    const actor = await prisma.user.findUnique({ where: { nik: req.user.nik }, select: { name: true } });
    const version = await captureConfiguration({ eventId: id, actorNik: req.user.nik, actorName: actor?.name, reason: req.body?.reason });
    res.status(201).json({ version: version.version });
  } catch (error) { res.status(error.status || 500).json({ message: error.message }); }
};

export { finalizeQuestionConfiguration, getQuestionConfiguration, getEvents, addEvents, getEventById, deleteEventById, getUser, postUser, getEventUser, deleteEventUser };
