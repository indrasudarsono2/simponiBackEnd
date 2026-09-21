import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

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
            briefingFile: true,
            recommendationFile: true,
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
    const { sessionId, sectorId, remarkDocId, eventName, startDate, finishDate, forExpDate, formFillingDate, passingGrade, isPractical, isSimulator} = req.body;
    const cleanIsPractical = isPractical === 'true' || isPractical === true;
    const cleanIsSimulator = isSimulator === 'true' || isSimulator === true;
    const remarkDoc = await prisma.remarkDoc.findFirst({
      where: { id: parseInt(remarkDocId), deletedAt: null },
      select: { remark: true }
    });
    if (!remarkDoc) {
      return res.status(400).json({ message: "Invalid remark." });
    }
    if (remarkDoc.remark?.trim().toUpperCase() === "PENERBITAN" && !recommendationFile) {
      return res.status(400).json({
        message: "Recommendation letter is required for PENERBITAN."
      });
    }
    // Example: Create event with file URL
    const event = await prisma.event.create({
      data: {
        sessionId: parseInt(sessionId),
        sectorId: parseInt(sectorId),
        remarkDocId: parseInt(remarkDocId),
        event: eventName,
        startDate: dayjs.utc(startDate).startOf('day').toDate(),
        finishDate: dayjs.utc(finishDate).startOf('day').toDate(),
        forExpiredDate: dayjs.utc(forExpDate).startOf('day').toDate(),
        formFillingDate: dayjs.utc(formFillingDate).startOf('day').toDate(),
        passingGrade: parseInt(passingGrade),
        isPractical: Boolean(cleanIsPractical),
        isSimulator: Boolean(cleanIsSimulator),
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
    const { sessionId, sectorId, remarkDocId, eventName, startDate, finishDate, forExpDate, formFillingDate, passingGrade, isPractical, isSimulator} = req.body;
    const cleanIsPractical = isPractical === 'true' || isPractical === true;
    const cleanIsSimulator = isSimulator === 'true' || isSimulator === true;
    // Get existing event to find old briefingFile path
    const existingEvent = await prisma.event.findUnique({
      where: { id: parseInt(id) },
      select: { briefingFile: true, recommendationFile: true }
    });

    const remarkDoc = await prisma.remarkDoc.findFirst({
      where: { id: parseInt(remarkDocId), deletedAt: null },
      select: { remark: true }
    });
    if (!remarkDoc) {
      return res.status(400).json({ message: "Invalid remark." });
    }
    const isPenerbitan = remarkDoc.remark?.trim().toUpperCase() === "PENERBITAN";
    if (isPenerbitan && !recommendationFile && !existingEvent?.recommendationFile) {
      return res.status(400).json({
        message: "Recommendation letter is required for PENERBITAN."
      });
    }

    await prisma.event.update({
      where: {
        id: parseInt(id)
      },
      data: {
        sessionId: parseInt(sessionId),
        sectorId: parseInt(sectorId),
        remarkDocId: parseInt(remarkDocId),
        event: eventName,
        startDate: dayjs.utc(startDate).startOf('day').toDate(),
        finishDate: dayjs.utc(finishDate).startOf('day').toDate(),
        forExpiredDate: dayjs.utc(forExpDate).startOf('day').toDate(),
        formFillingDate: dayjs.utc(formFillingDate).startOf('day').toDate(),
        passingGrade: parseInt(passingGrade),
        isPractical: Boolean(cleanIsPractical),
        isSimulator: Boolean(cleanIsSimulator),
        // Store file URL if file was uploaded, otherwise keep existing
        briefingFile: briefingFile
          ? eventFileUrl(briefingFile)
          : existingEvent?.briefingFile,
        recommendationFile: isPenerbitan
          ? (recommendationFile
              ? eventFileUrl(recommendationFile)
              : existingEvent?.recommendationFile)
          : null,
      }
    })
    if (briefingFile) removeStoredFile(existingEvent?.briefingFile);
    if (recommendationFile || !isPenerbitan) {
      removeStoredFile(existingEvent?.recommendationFile);
    }
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    const {id} = req.params
    const userAvailable = [];
    const event = await prisma.event.findFirst({
      where: {
        id: parseInt(id)
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
        eventId: parseInt(id)
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

    await prisma.eventUser.createMany({
      data: userNiks.map((id) => ({userNik:id, eventId}))
    })

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getEventUser = async(req, res) => {
  try {
    const {id} = req.params

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: parseInt(id)
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
    const {ids} = req.body
    await prisma.eventUser.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    })
    
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getEvents, addEvents, getEventById, deleteEventById, getUser, postUser, getEventUser, deleteEventUser };
