import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getGroups = async (req, res) => {
  try {
    const branchUnitId = req.user.branchUnitId;
    if (!branchUnitId) return res.status(400).json({ message: 'Your account has no branch unit.' });
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
              orderBy: [
                { createdAt: 'desc' },
                { id: 'desc' }
              ],
              select: {
                id: true,
                event: true,
                createdAt: true,
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
                    subBranchUnitRatings: { where: { deletedAt: null, rating: { deletedAt: null } }, select: { ratingId: true, rating: { select: { id: true, rating: true } } } },
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
      orderBy: [
        { event: { createdAt: 'desc' } },
        { eventId: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      select: {
        id:true,
        pic: true,
        assignmentPolicy: true,
        ratingIds: true,
        group: true,
        createdAt: true,
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
            ratingAssignments: { select: { ratingId: true, rating: { select: { rating: true } } } },
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
            createdAt: true,
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
    const checkerUsers = await prisma.user.findMany({ where: { branchUnitId, deletedAt: null,
      userRoles: { some: { deletedAt: null, roles: { role: 'CHECKER', deletedAt: null } } } },
      select: { nik: true, name: true, userRoles: { where: { deletedAt: null }, select: {
        id: true, roles: { select: { role: true } }, checkerRatings: { where: { deletedAt: null, rating: { deletedAt: null } }, select: { ratingId: true, rating: { select: { rating: true } } } }
      } } }, orderBy: { name: 'asc' } });
    for (const session of allAtribute.sessions) for (const event of session.events) {
      if (event.sector) event.sector.users = checkerUsers;
    }
    res.json({allAtribute,group});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getGroups };
export { addGroup, updateGroup as getGroupById, deleteGroup as deleteGroupById } from './groupAssignmentController.js';
