import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { verifiedRoomDocumentWhere, pendingTheoryRatingWhere, roomRecoveryWhere, assignDefaultRoom, ensureDefaultRoom } from '../services/defaultModeOneRoom.js';

const unfinishedRatingWhere = pendingTheoryRatingWhere;
const eligibleApplicationDocWhere = verifiedRoomDocumentWhere;
const availableAttendanceWhere = { OR: [
  { attendaces: { is: null } },
  { attendaces: { is: { deletedAt: { not: null } } } },
  { attendaces: { is: { room: { is: { defaultEventId: { not: null } } } } } },
] };

const normalizeEventUserIds = (value) => {
  const rawIds = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

const findUnavailableEventUserIds = async ({
  eventUserIds,
  branchUnitId,
  currentRoomId = null,
  db = prisma,
}) => {
  const eligibleUsers = await db.eventUser.findMany({
    where: {
      id: { in: eventUserIds },
      deletedAt: null,
      event: {
        is: {
          deletedAt: null,
          theoryMode: "MODE_1",
          sector: {
            is: {
              deletedAt: null,
              branchUnitId,
            },
          },
        },
      },
      OR: [
        {
          applicationDocs: { some: eligibleApplicationDocWhere },
          ...availableAttendanceWhere,
        },
        ...(currentRoomId
          ? [{ attendaces: { is: { roomId: currentRoomId, deletedAt: null } } }]
          : []),
      ],
    },
    select: { id: true },
  });

  const eligibleIds = new Set(eligibleUsers.map(({ id }) => id));
  return eventUserIds.filter((id) => !eligibleIds.has(id));
};

const getRoom = async (req, res) => {
  // const branchUnitId = 17
  // const branchUnitId = 5
  const branchUnitId = req.user.branchUnitId
  if (!Number.isInteger(branchUnitId) || branchUnitId <= 0) return res.status(403).json({ message: 'A branch unit is required to manage rooms.' });
  // const sect = 8
  // const sect = req.user.sectorId
  const userN = req.user.nik
  // const userN = "10077770"
  // const userN = "10011520"
  // const prof = 1
  // const prof = req.user.professionId
  try {
    const event = await prisma.sector.findMany({
      where: {
        deletedAt: null,
        branchUnitId: branchUnitId,
        events: {
          some: {
            deletedAt: null,
            theoryMode: "MODE_1",
            eventUsers: {
              some: {
                deletedAt: null,
                ...availableAttendanceWhere,
                applicationDocs: {
                  some: eligibleApplicationDocWhere,
                }
              }
            }
          }
        }
      },
      select: {
        id: true,
        branchUnit: true,
        events: {
          where: {
            deletedAt: null,
            theoryMode: "MODE_1",
          },
          select: {
            id: true,
            event: true,
            eventUsers: {
              where: {
                deletedAt: null,
                ...availableAttendanceWhere,
                applicationDocs: {
                  some: eligibleApplicationDocWhere,
                }
              },
              select: {
                id: true,
                userNik: true,
                user: {
                  select: {
                    name: true
                  }
                },
                attendaces: {
                  where: {
                    deletedAt: null
                  },
                  include: { room: { select: { defaultEventId: true } } }
                },
                applicationDocs: {
                  where: {
                    ...eligibleApplicationDocWhere,
                  },
                  select: {
                    id: true,
                    userNik: true,
                    user: {
                      select: {
                        name: true
                      }
                    },
                    appRatings: {
                      where: unfinishedRatingWhere,
                      select: {
                        id: true,
                        rating: {
                          where: {
                            deletedAt: null
                          },
                          select: {
                            rating: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })

    const room = await prisma.room.findMany({
      where: {
        deletedAt: null,
        OR: [{ checker: userN }, { defaultEvent: { is: { deletedAt: null, theoryMode: 'MODE_1', sector: { is: { branchUnitId } } } } }]
      },
      orderBy: {
        id: "desc"
      },
      include: {
        attendances: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            eventUser: {
              where: {
                deletedAt:null
              },
              select: {
                id: true,
                event: {
                  select: {
                    theoryMode: true,
                  },
                },
                applicationDocs: {
                  where: {
                    deletedAt: null,
                  },
                  select: {
                    id: true,
                    userNik: true,
                    user: {
                      select: {
                        name: true
                      }
                    },
                    appRatings: {
                      select: {
                        id: true,
                        rating: {
                          select: {
                            rating: true
                          }
                        }
                      }
                    }
                  }
                }             
              }
            }
          }
        }
      }
    })
    

    res.json({room, event});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postRoom = async(req, res) => {
  if (!Number.isInteger(req.user.branchUnitId) || req.user.branchUnitId <= 0) return res.status(403).json({ message: 'A branch unit is required to manage rooms.' });
  // const userN = "10011520"
  const userN = req.user.nik
  try {
    const files = req.files;
    const file = files && files.length > 0 ? files[0] : null;

    const {eventUsersId, startDate, finishDate, name} = req.body
    const normalizedEventUserIds = normalizeEventUserIds(eventUsersId);
    if (normalizedEventUserIds.length === 0) {
      return res.status(400).json({ message: "At least one eligible event user is required." });
    }

    const unavailableIds = await findUnavailableEventUserIds({
      eventUserIds: normalizedEventUserIds,
      branchUnitId: req.user.branchUnitId,
    });
    if (unavailableIds.length > 0) {
      return res.status(409).json({
        message: "One or more users are no longer available. Refresh the Room page and select again.",
        eventUserIds: unavailableIds,
      });
    }
    
    await prisma.$transaction(async tx => {
      for (const id of [...normalizedEventUserIds].sort((a,b) => a-b)) await tx.eventUser.update({ where: { id }, data: { updatedAt: new Date() } });
      if ((await findUnavailableEventUserIds({ eventUserIds: normalizedEventUserIds, branchUnitId: req.user.branchUnitId, db: tx })).length) throw Object.assign(new Error('A participant was assigned to another manual room. Refresh and select again.'), { code: 'P2002' });
      const createdRoom = await tx.room.create({
      data: {
        name,
        checker:  userN,
        startDate: dayjs.utc(startDate).toDate(),
        finishDate: dayjs.utc(finishDate).toDate(),
        file: file ? `/uploads/room/${file.filename}` : null,
      }
      });
      for (const eventUserId of normalizedEventUserIds) await tx.attendance.upsert({ where: { eventUserId }, create: { eventUserId, roomId: createdRoom.id }, update: { roomId: createdRoom.id, deletedAt: null } });
    });

    res.json({message: "Success"});
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        message: "A selected user has already been assigned to another Room. Refresh and select again.",
      });
    }
    res.status(500).json({ message: error.message });
  }
}

const editRoom = async(req, res) => {
  if (!Number.isInteger(req.user.branchUnitId) || req.user.branchUnitId <= 0) return res.status(403).json({ message: 'A branch unit is required to manage rooms.' });
  // const userN = "10011520"
  const userN = req.user.nik
  try {
    const {id} = req.params
    const files = req.files;
    const file = files && files.length > 0 ? files[0] : null;

    const {eventUsersId, startDate, finishDate, name} = req.body
    const normalizedEventUserIds = normalizeEventUserIds(eventUsersId);
    if (normalizedEventUserIds.length === 0) {
      return res.status(400).json({ message: "At least one eligible event user is required." });
    }

    const room = await prisma.room.findUnique({
      where: {
        id: parseInt(id),
        checker: userN,
      },
      select: {
        file: true,
        defaultEventId: true
      }
    })

    if (room?.defaultEventId) return res.status(403).json({ message: 'Automatic rooms are managed by the event. Edit the event schedule instead.' });
    const payload = {
      name,
      checker:  userN,
      startDate: dayjs.utc(startDate).toDate(),
      finishDate: dayjs.utc(finishDate).toDate(),
      attendances: {
        deleteMany: {},
        createMany: {
          data: normalizedEventUserIds.map(eventUserId => ({eventUserId}))
        }
      }
    }

    if(file && room){
      payload.file = file ? `/uploads/room/${file.filename}` : null
    }

    if (!room) return res.status(404).json({ message: "Room not found." });
    const unavailableIds = await findUnavailableEventUserIds({
      eventUserIds: normalizedEventUserIds,
      branchUnitId: req.user.branchUnitId,
      currentRoomId: parseInt(id),
    });
    if (unavailableIds.length > 0) {
      return res.status(409).json({
        message: "One or more users are no longer available. Refresh the Room page and select again.",
        eventUserIds: unavailableIds,
      });
    }
    delete payload.attendances;
    await prisma.$transaction(async tx => {
      const old = await tx.attendance.findMany({ where: { roomId: Number(id) }, select: { eventUserId: true } });
      const affected = [...new Set([...normalizedEventUserIds, ...old.map(item => item.eventUserId).filter(Boolean)])].sort((a,b) => a-b);
      for (const participantId of affected) await tx.eventUser.update({ where: { id: participantId }, data: { updatedAt: new Date() } });
      if ((await findUnavailableEventUserIds({ eventUserIds: normalizedEventUserIds, branchUnitId: req.user.branchUnitId, currentRoomId: Number(id), db: tx })).length) throw Object.assign(new Error('A participant is no longer available.'), { code: 'P2002' });
      await tx.room.update({ where: { id: Number(id) }, data: payload });
      await tx.attendance.deleteMany({ where: { roomId: Number(id) } });
      for (const eventUserId of normalizedEventUserIds) await tx.attendance.upsert({ where: { eventUserId }, create: { eventUserId, roomId: Number(id) }, update: { roomId: Number(id), deletedAt: null } });
      for (const participantId of affected.filter(value => !normalizedEventUserIds.includes(value))) await ensureDefaultRoom(tx, participantId, { branchUnitId: req.user.branchUnitId, checkerNik: userN });
    });
    if (file && room.file) {
      const oldFilePath = path.join(process.cwd(), room.file);
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    }

    res.json({message: "Success"});
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({
        message: "A selected user has already been assigned to another Room. Refresh and select again.",
      });
    }
    res.status(500).json({ message: error.message });
  }
}

const deleteRoom =  async (req, res) => {
  if (!Number.isInteger(req.user.branchUnitId) || req.user.branchUnitId <= 0) return res.status(403).json({ message: 'A branch unit is required to manage rooms.' });
  try {
    const {id} =  req.params
    const userN = req.user.nik
    const room = await prisma.room.findUnique({
      where: {
        id: parseInt(id)
        ,checker: userN
      },
      select: {
        file: true,
        defaultEventId: true
      }
    })
   
    if (!room) return res.status(404).json({ message: "Room not found." });
    if (room.defaultEventId) return res.status(403).json({ message: 'Automatic event rooms cannot be deleted.' });

    await prisma.$transaction(async tx => {
      const assignments = await tx.attendance.findMany({ where: { roomId: Number(id) }, select: { eventUserId: true } });
      const ids = assignments.map(item => item.eventUserId).filter(Boolean).sort((a,b) => a-b);
      for (const participantId of ids) await tx.eventUser.update({ where: { id: participantId }, data: { updatedAt: new Date() } });
      await tx.room.delete({ where: { id: Number(id) } });
      for (const participantId of ids) await ensureDefaultRoom(tx, participantId, { branchUnitId: req.user.branchUnitId, checkerNik: userN });
    });
    if (room.file) {
      const oldFilePath = path.join(process.cwd(), room.file);
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    }

     res.json({message: "Success"});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const missingAssignments = async (req, res) => {
  if (!Number.isInteger(req.user.branchUnitId) || req.user.branchUnitId <= 0) return res.status(400).json({ message: 'A branch unit is required.' });
  try {
    const where = roomRecoveryWhere(req.user.branchUnitId);
    const [total, participants] = await Promise.all([
      prisma.eventUser.count({ where }),
      prisma.eventUser.findMany({ where, take: 100, orderBy: { id: 'desc' }, select: { id: true, user: { select: { name: true } }, event: { select: { event: true, startDate: true, finishDate: true } } } }),
    ]);
    res.json({ total, participants });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
const repairAssignments = async (req, res) => {
  if (!Number.isInteger(req.user.branchUnitId) || req.user.branchUnitId <= 0) return res.status(400).json({ message: 'A branch unit is required.' });
  try {
    const ids = normalizeEventUserIds(req.body.eventUserIds);
    if (!ids.length || ids.length > 100) return res.status(400).json({ message: 'Select between 1 and 100 participants.' });
    const eligible = await prisma.eventUser.findMany({ where: { ...roomRecoveryWhere(req.user.branchUnitId), id: { in: ids } }, select: { id: true } });
    const results = [];
    for (const { id } of eligible) results.push({ id, ...await assignDefaultRoom(id, { branchUnitId: req.user.branchUnitId, checkerNik: req.user.nik }) });
    res.json({ results });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
export { getRoom, postRoom, editRoom, deleteRoom, missingAssignments, repairAssignments };
