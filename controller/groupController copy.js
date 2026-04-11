import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getGroups = async (req, res) => {
  try {
    const allAtribute = await prisma.branchUnit.findFirst({
      where: {
        // id: req.user.branchUnitId
        id: parseInt(config.branchUnitId)
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
              select: {
                id: true,
                event: true,
                remarkDoc: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    remark: true
                  }
                },
                sector: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    sector: true,
                    users: {
                      select: {
                        nik: true,
                        name: true,
                        userRoles: {
                        where: {
                          deletedAt: null
                        },
                          select: {
                            id: true,
                            roles: {
                              where: {
                                deletedAt: null
                              },
                              select: {
                                role: true
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
          }
        }
      }
    })
    
    // const eventId = allAtribute.flatMap(i => i.sessions.map(item => item.events.map(event => event.id))).flat();
    const eventId = allAtribute.sessions.flatMap(s => s.events.map(event => event.id))

    const group = await prisma.group.findMany({
      where: {
        deletedAt: null,
        eventId: {
          in: eventId
        },
      },
      select: {
        id:true,
        group: true,
        userPic: {
          select: {
            name: true
          }
        },
        checkerGroups: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            checker: true,
            userChecker: {
              select: {
                name: true
              }
            }
          }
        },
        groupMembers: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            member: true,
            userMember: {
              select: {
                name: true
              }
            }
          }
        },
        event: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            event: true,
            remarkDoc: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                remark: true
              }
            },
            sector: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                sector: true
              }
            }
          }
        }
      }
    })
    res.json({allAtribute,group});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addGroup = async (req, res) => {
  try {
    const { eventId, pic, group, checkers, members } = req.body;
    await prisma.group.create({
      data: {
        eventId: eventId,
        pic: pic,
        group: group,
        checkerGroups: {
          createMany: {
            data: checkers.map((id) => ({ checker: id }))
          }
        },
        groupMembers: {
          createMany: {
            data: members.map((id) => ({ member: id }))
          }
        }
      }
  });

  res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    const { eventId, pic, group, checkers, members } = req.body;
   
    await prisma.group.update({
      where: {
        id: parseInt(id)
      },
      data: {
        eventId,
        group,
        pic,
        checkerGroups: {
          deleteMany:{},
          createMany: {
            data: checkers.map((id) => ({ checker: id }))
          }
        },
        groupMembers: {
          deleteMany:{},
          createMany: {
            data: members.map((id) => ({ member: id }))
          }
        }
      }
    })
    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteGroupById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
    await prisma.group.update({
      where: { id: parseInt(id) },
        data: { 
          deletedAt: now,
          checkerGroups: {
            updateMany: {
              where: {deletedAt: null},
              data: {
                deletedAt: now
              }
            }
          },
          groupMembers: {
            updateMany: {
              where: {deletedAt: null},
              data: {
                deletedAt: now
              }
            }
          }
        }
      });
    res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getGroups, addGroup, getGroupById, deleteGroupById};