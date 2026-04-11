import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

dayjs.extend(utc);

const getVerificationInit = async (req, res) => {
  const userN = req.user.nik
  // const userN = "10077771"
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 6
  try {

    const group = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pic: userN
      },
      select: {
        id: true,
        group: true,
        event: {
          select: {
            id: true,
            event: true,
            remarkDoc: {
              select: {
                id: true,
                remark: true
              }
            },
            session: {
              select: {
                id: true,
                session: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    const event = group.map(e => e.event).flat();
    res.json({event});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getVerificationItem = async(req, res) => {
  try {
    const {remark} = req.body
    
    const whereClause = {
      deletedAt: null
    }

    if (remark === "PERPANJANGAN") {
      whereClause.isPenerbitan = false
    }

    const items = await prisma.verificationItems.findMany({
      where: whereClause
    })

    res.json(items)
  } catch (error) {
     res.status(500).json({ message: error.message });
  }
}

const getVerification = async (req, res) => {
  const {eventId} = req.body
  const userN = req.user.nik
  // const userN = "10077771"
  // const eventId = 10
  try {
    const eventUsr = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pic: userN
      },
      select: {
        id: true,
        group: true,
        event: {
          select: {
            id: true,
            event: true,
            eventUsers: {
              select: {
                id: true
              }
            }
          }
        }
      }
    })
    const eventUserId = eventUsr.map(data => data.event.eventUsers.map(eu => eu.id)).flat()

    const rating = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        nik: userN
      },
      select: {
        sector: {
          select: {
            subBranchUnitRatings: {
              select: {
                ratingId: true
              }
            }
          }
        }
      }
    })
    const ratingId = rating.sector.subBranchUnitRatings.map(d => d.ratingId).flat();
    
    const group = await prisma.group.findMany({
      where: {
        deletedAt: null,
        pic: userN,
        event: {
          id: eventId
        }
      },
      select: {
        id: true,
        group: true,
        userPic: {
          select: {
            name: true
          }
        },
        event: {
          select: {
            id: true,
            event: true,
            startDate: true,
            finishDate: true,
            remarkDoc: true,
            session: {
              select: {
                id: true,
                session: true
              }
            },
          }
        },
        checkerGroups: {
          select: {
            id: true,
            userChecker: {
              select: {
                nik: true,
                name: true,
              }
            }
          }
        },
        groupMembers: {
          select: {
            id: true,
            userMember: {
              select: {
                nik: true,
                name: true,
                competences: {
                  where: {
                    deletedAt: null,
                    ratingId: {
                      in: ratingId
                    }
                  },
                  include: {
                    rating: true
                  }
                },
                applicationDocs: {
                  where: {
                    deletedAt: null,
                    eventUserId: {
                      in: eventUserId
                    }
                  },
                  include: {
                    ielp: true,
                    medex: true,
                    logbook: true,
                    license: true,
                    appRatings: {
                      include: {
                        rating: true
                      }
                    },
                    eventUser: {
                      include: {
                        event: {
                          include: {
                            remarkDoc: true
                          }
                        }
                      }
                    },
                    user: {
                      include: {
                        gender: true,
                      }
                    }
                  }
                },
              }
            },
            verification: true
          }
        }
      }
    })

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postVerification = async(req, res) => {
  try {
    const {applicationDocId, groupMemberId, verificationItems} = req.body

    const verification = await prisma.verification.findFirst({
      where: {
        applicationDocId,
        groupMemberId
      }
    })

    if(verification) {
      await prisma.verification.update({
        where: {
          id: verification.id
        },
        data: {
          verificationData: JSON.stringify(verificationItems),
        }
      })
    }else{
      await prisma.applicationDoc.update({
        where: {
          id: applicationDocId
        },
        data: {
          statusId: 2
        }
      })
      
      await prisma.verification.create({
        data: {
          applicationDocId,
          groupMemberId,
          verificationData: JSON.stringify(verificationItems),
          isValid: true
        }
      })
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getVerificationDetail = async (req, res) => {
  try {
    const {applicationDocId, groupMemberId} = req.body

    const verification = await prisma.verification.findFirst({
      where: {
        applicationDocId,
        groupMemberId
      }
    })

    res.json(verification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export { getVerification, getVerificationInit, getVerificationItem, postVerification, getVerificationDetail};