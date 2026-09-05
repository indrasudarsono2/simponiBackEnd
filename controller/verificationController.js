import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

dayjs.extend(utc);

const getVerificationInit = async (req, res) => {
  const userN = req.user.nik
  // const userN = "10077770"
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
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
  // const userN = "10077770"
  const userN = req.user.nik
  // const eventId = 11
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
                    },
                    ojtUser: {
                      select: {
                        licenseUserId:true,
                        name: true
                      }
                    }
                  }
                },
              }
            },
            verification: {
              select: {
                applicationDoc: {
                  select: {
                    number: true
                  }
                },
                verificationData: true,
                updatedAt: true
              }
            }
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
    const parsedApplicationDocId = Number(applicationDocId);
    const parsedGroupMemberId = Number(groupMemberId);

    if (!Number.isInteger(parsedApplicationDocId) || parsedApplicationDocId <= 0) {
      return res.status(400).json({ message: "A valid application document is required." });
    }
    if (!Number.isInteger(parsedGroupMemberId) || parsedGroupMemberId <= 0) {
      return res.status(400).json({ message: "A valid group member is required." });
    }
    if (!Array.isArray(verificationItems) || verificationItems.length === 0) {
      return res.status(400).json({ message: "Verification items are required." });
    }

    const [applicationDoc, groupMember] = await Promise.all([
      prisma.applicationDoc.findFirst({
        where: { id: parsedApplicationDocId, deletedAt: null },
        select: {
          id: true,
          eventUser: { select: { eventId: true } }
        }
      }),
      prisma.groupMember.findFirst({
        where: { id: parsedGroupMemberId, deletedAt: null },
        select: {
          id: true,
          group: { select: { eventId: true, pic: true, deletedAt: true } }
        }
      })
    ]);

    if (!applicationDoc) {
      return res.status(404).json({ message: "Application document was not found." });
    }
    if (!groupMember?.group || groupMember.group.deletedAt) {
      return res.status(404).json({ message: "Group member was not found." });
    }
    if (Number(applicationDoc.eventUser?.eventId) !== Number(groupMember.group.eventId)) {
      return res.status(409).json({ message: "The application document and group member belong to different events." });
    }
    if (groupMember.group.pic !== req.user.nik) {
      return res.status(403).json({ message: "You are not authorized to verify this group member." });
    }

    await prisma.$transaction([
      prisma.applicationDoc.update({
        where: { id: parsedApplicationDocId },
        data: { statusId: 2 }
      }),
      prisma.verification.upsert({
        where: { applicationDocId: parsedApplicationDocId },
        update: {
          groupMemberId: parsedGroupMemberId,
          verificationData: JSON.stringify(verificationItems),
          isValid: true,
          deletedAt: null
        },
        create: {
          applicationDocId: parsedApplicationDocId,
          groupMemberId: parsedGroupMemberId,
          verificationData: JSON.stringify(verificationItems),
          isValid: true
        }
      })
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to submit verification:", error);
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
