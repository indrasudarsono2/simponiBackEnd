import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const unfinishedRatingWhere = {
  deletedAt: null,
  finalScores: {
    none: {
      deletedAt: null,
      isInvalidated: false,
    },
  },
};

const eligibleApplicationDocWhere = {
  deletedAt: null,
  statusId: 2,
  appRatings: {
    some: unfinishedRatingWhere,
  },
};

const normalizeEventUserIds = (value) => {
  const rawIds = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(rawIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

const findUnavailableEventUserIds = async ({
  eventUserIds,
  branchUnitId,
  currentRoomId = null,
}) => {
  const eligibleUsers = await prisma.eventUser.findMany({
    where: {
      id: { in: eventUserIds },
      deletedAt: null,
      event: {
        is: {
          deletedAt: null,
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
          attendaces: { is: null },
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
            eventUsers: {
              some: {
                deletedAt: null,
                attendaces: {
                  is: null,
                },
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
          },
          select: {
            id: true,
            event: true,
            eventUsers: {
              where: {
                deletedAt: null,
                attendaces: {
                  is: null,
                },
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
                  }
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
        checker: userN
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
    
    await prisma.room.create({
      data: {
        name,
        checker:  userN,
        startDate: dayjs.utc(startDate).toDate(),
        finishDate: dayjs.utc(finishDate).toDate(),
        file: file ? `/uploads/room/${file.filename}` : null,
        attendances: {
          createMany: {
            data: normalizedEventUserIds.map(eventUserId => ({eventUserId}))
          }
        }
      }
    })

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
        file: true
      }
    })

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

    if(file && room && room.file){
      const oldFilePath = path.join(process.cwd(), room.file);
      if(fs.existsSync(oldFilePath)){
        fs.unlinkSync(oldFilePath)
      }

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
    await prisma.room.update({
      where: {
        id: parseInt(id)
      },
      data: payload
    })

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
  try {
    const {id} =  req.params
    const userN = req.user.nik
    const room = await prisma.room.findUnique({
      where: {
        id: parseInt(id)
        ,checker: userN
      },
      select: {
        file: true
      }
    })
   
    if (!room) return res.status(404).json({ message: "Room not found." });
    if(room.file){
      const oldFilePath = path.join(process.cwd(), room.file);
      if(fs.existsSync(oldFilePath)){
        fs.unlinkSync(oldFilePath)
      }
    }

    await prisma.room.delete({
      where: {
        id: parseInt(id),
      },
    })

     res.json({message: "Success"});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getRoom, postRoom, editRoom, deleteRoom};
