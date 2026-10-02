import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getGroups = async (req, res) => {
  try {
    const branchUnitId = req.user.branchUnitId;
    // const branchUnitId = 17
    const allAtribute = await prisma.branchUnit.findFirst({
      where: {
        id: branchUnitId
        // id: parseInt(config.branchUnitId)
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
                            },
                            checkerRatings: {
                              where: { deletedAt: null, rating: { deletedAt: null } },
                              select: { ratingId: true, rating: { select: { rating: true } } }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                eventUsers: {
                  select: {
                    user: {
                      select: {
                        name: true,
                        nik: true,
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
                },
                groups: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    checkerGroups: {
                      select: {
                        id: true,
                        checker: true
                      }
                    },
                    groupMembers: {
                      select: {
                        id: true,
                        member: true
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
    const eligibilityError = await validateCheckerSelection(req, eventId, pic, checkers);
    if (eligibilityError) return res.status(400).json({ message: eligibilityError });
    const memberError = await validateMemberSelection(req, eventId, members);
    if (memberError) return res.status(400).json({ message: memberError });
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
    const eligibilityError = await validateCheckerSelection(req, eventId, pic, checkers);
    if (eligibilityError) return res.status(400).json({ message: eligibilityError });
    const memberError = await validateMemberSelection(req, eventId, members);
    if (memberError) return res.status(400).json({ message: memberError });
   
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

const validateCheckerSelection = async (req, eventId, pic, checkers) => {
  const ids = [...new Set([pic, ...(Array.isArray(checkers) ? checkers : [])])];
  if (!Number.isInteger(Number(eventId)) || !pic || !Array.isArray(checkers) || !checkers.length || ids.some((id) => typeof id !== 'string')) {
    return 'Select an event, PIC, and at least one checker.';
  }
  const event = await prisma.event.findFirst({
    where: { id: Number(eventId), deletedAt: null, session: { branchUnitId: req.user.branchUnitId } },
    select: { sectorId: true }
  });
  if (!event?.sectorId) return 'Event is not available in your branch unit.';
  const users = await prisma.user.findMany({
    where: { nik: { in: ids }, deletedAt: null, branchUnitId: req.user.branchUnitId, sectorId: event.sectorId },
    select: { nik: true, name: true, userRoles: {
      where: { deletedAt: null, roles: { role: 'CHECKER', deletedAt: null } },
      select: { checkerRatings: { where: { deletedAt: null, rating: { deletedAt: null } }, select: { id: true } } }
    } }
  });
  const eligible = new Set(users.filter((user) => user.userRoles.some((role) => role.checkerRatings.length)).map((user) => user.nik));
  const invalid = ids.filter((id) => !eligible.has(id));
  if (invalid.length) return `PIC/checker ${invalid.join(', ')} must have the CHECKER role and at least one assigned rating before being added to this event. Assign a checker rating first.`;
  return null;
};

const validateMemberSelection = async (req, eventId, members) => {
  if (!Array.isArray(members) || !members.length ||
      members.some((nik) => typeof nik !== "string" || !nik.trim()) ||
      new Set(members).size !== members.length) {
    return "Select valid, distinct event members.";
  }
  const assignments = await prisma.eventUser.findMany({
    where: {
      eventId: Number(eventId), deletedAt: null,
      userNik: { in: members },
      user: { deletedAt: null, branchUnitId: req.user.branchUnitId },
    },
    select: { userNik: true },
  });
  const eligible = new Set(assignments.map((assignment) => assignment.userNik));
  return members.every((nik) => eligible.has(nik))
    ? null
    : "One or more members are not assigned to this event in your branch unit.";
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
