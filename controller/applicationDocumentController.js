import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getApplicationDoc = async (req, res) => {
  // const sect = 8
  const sect = req.user.sectorId
  // const userN = "10077772"
  const userN = req.user.nik
  // const prof = 1
  const prof = req.user.professionId
  try {
    
    const now = dayjs.utc().toDate();

    const firstEvent = await prisma.event.findMany({
      where: {
        deletedAt: null,
        sectorId: sect,
        formFillingDate: {
          gte: now
        },
        eventUsers: {
          some: {
            userNik: userN
          },
        }
      },
      select: {
        id: true,
        event: true,
        remarkDoc: {
          select: {
            remark: true
          }
        },
        startDate: true,
        finishDate: true,
        passingGrade: true,
        isPractical: true,
        isSimulator: true,
        eventUsers: {
          where: {
            userNik: userN
          },
          select: {
            id: true,
            userNik: true,
            applicationDocs: {
              where: {
                appRatings: {
                  some: {
                    statusId: {
                      not: 6
                    }
                  }
                }
              },
              select: {
                id: true
              }
            },
            event: {
              select: {
                id: true,
                groups: {
                  where: {
                    groupMembers: {
                      some: {
                        member: userN
                      }
                    }
                  },
                  select: {
                    id: true,
                    group: true,
                    pic: true,
                    checkerGroups: {
                      where: {
                        deletedAt: null,
                      },
                      select: {
                        id: true,
                        userChecker: {
                          where: {
                            deletedAt: null,
                          },
                          select: {
                            nik: true,
                            name: true,
                            userRoles:{
                              where: {
                                deletedAt: null,
                                checkerRatings: {
                                  some: {}
                                }
                              },
                              select: {
                                id: true,
                                checkerRatings: {
                                  where: {
                                    deletedAt: null,
                                  },
                                  select: {
                                    id: true,
                                    rating: {
                                      where: {
                                        deletedAt: null,
                                      },
                                      select: {
                                        id: true,
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
                    },
                    groupMembers: {
                      where: {
                        deletedAt:null,
                        member: userN
                      },
                      select: {
                        id: true,
                        member: true
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

    const event = firstEvent.filter(e => {
      // Include event when user has no application docs yet (null or empty array).
      return e.eventUsers.some(
        (user) => !user.applicationDocs || user.applicationDocs.length === 0
      );
    });
  
    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        userNik: userN
      },
      include: {
        eventUser: {
          where: {
            deletedAt:null
          },
          include: {
            event: {
              where: {
                deletedAt: null
              },
              include: {
                remarkDoc: true
              }
            }
          }
        },
        medex: true,
        ielp: true,
        status: true,
        appRatings: {
          where: {
            deletedAt: null
          },
          include: {
            rating: true,
            practicalTests: {
              select: {
                id: true,
                kindOfPractical: true,
                checkerGroup: {
                  select: {
                    id: true,
                    userChecker: {
                      select: {
                        name: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        verifications: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const subBranchRating = await prisma.subBranchUnitRating.findMany({
      where: {
        deletedAt: null,
        sectorId: sect
      },
      select: {
        ratingId: true
      }
    })

    const ratingId = subBranchRating.map(i => i.ratingId);

    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        nik: userN
      },
      include: {
        ielp: {
          where: {
            deletedAt:null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        medex: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        logbookUsers: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        license: {
          where: {
            deletedAt: null
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 6
        },
        competences: {
          where: {
            deletedAt: null,
            ratingId: {
              in: ratingId
            }
          }
        },
      }
    })
    
    const rating = await prisma.rating.findMany({
      where: {
        deletedAt: null,
        professionId: prof,
      }
    })

    const getRatingId = subBranchRating.map(i => i.ratingId);

    const competence = await prisma.competence.findMany({
      where: {
        deletedAt: null,
        ratingId: {
          in: getRatingId
        },
        userId: userN
      },
    })
    const getRatingIdFromCompetence = competence.map(c => c.ratingId);
    const ratingReal = rating.filter(r => getRatingIdFromCompetence.includes(r.id));

    res.json({event, applicationDoc, user, rating, competence, ratingReal});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addApplicationDoc = async (req, res) => {
  try {
    const {eventId, groupMemberId, eventUserId, licenseId, logbookUserId, atsName, address, appRating, confirmRating, reason, ratings, location, dateForExpired, confirmOjt, letterNumber, letterDate, controlHour, ojtLicenseId, ojtNik, isDrugs, isFailed, medexId, ielpId } = req.body
    const parsedOjtLicenseId = (ojtLicenseId ?? ojtNik) !== '' ? (ojtLicenseId ?? ojtNik) : null
    
    const eventUser = await prisma.eventUser.findFirst({
      where: {
        id: parseInt(eventUserId),
      },
      select: {
        event: {
          where: {
            groups: {
              some: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              }
            }
          },
          select: {
            id: true,
            remarkDoc: {
              select: {
                remark: true
              }
            },
            isPractical: true,
            isSimulator: true,
            groups: {
              where: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              },
              select: {
                groupMembers: {
                  where: {
                    member: req.user.nik
                    // member: "10011520"
                  },
                  select: {
                    id: true,
                    member: true
                  }
                },
                checkerGroups: {
                  select: {
                    id: true,
                    checker: true,
                    userChecker: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        name: true,
                        userRoles: {
                          where: {
                            deletedAt: null,
                            checkerRatings: {
                              some: {}
                            }
                          },
                          select: {
                            id: true,
                            checkerRatings: {
                              where: {
                                deletedAt: null,
                              },
                              select: {
                                rating: {
                                  where: {
                                    deletedAt: null
                                  },
                                  select: {
                                    id: true,
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
            }
          }
        },
        user: {
          select: {
            professionInBranch: {
              select: {
                profession: {
                  select: {
                    profession: true
                  }
                }
              }
            },
            licenseUserId: true
          }
        }
      }
    })

    const number = `${eventUser.user.professionInBranch.profession.profession}/${eventUser.event.remarkDoc.remark}/${eventUser.user.licenseUserId}-${eventUser.event.id}`
 
    const appDoc = await prisma.applicationDoc.create({
      data: {
        userNik: req.user.nik,
        // userNik: "10011520",
        number,
        medexId: parseInt(medexId),
        ielpId: parseInt(ielpId),
        eventUserId: parseInt(eventUserId),
        licenseId: parseInt(licenseId),
        logbookUserId: parseInt(logbookUserId),
        atsName: atsName !== '' ? atsName : null,
        address: address !== '' ? address : null,
        confirmRating: confirmRating,
        reason: reason !== '' ? reason : null,
        rating: JSON.stringify(ratings),
        location: location !== '' ? location : null,
        dateForExpired: dayjs.utc(dateForExpired).endOf('day').toDate(),
        confirmOjt: confirmOjt,
        letterNumber: letterNumber !== '' ? letterNumber : null,
        letterDate: letterDate !== '' ? dayjs.utc(letterDate).startOf('day').toDate() : null,
        controlHour: controlHour !== '' ? controlHour : null,
        ojtLicenseId: parsedOjtLicenseId,
        isDrugs: isDrugs,
        isFailed: isFailed,
        statusId: 1,
        appRatings: {
          createMany: {
            data: appRating.map(data => ({ratingId : parseInt(data.rating.id), controlHour: data.controlHour, statusId: 1}))
          },
        }
      }
    })
    
    const appRat = await prisma.appRating.findMany({
      where: {
        deletedAt: null,
        applicationDocId: appDoc.id
      },
      select:{
        id: true,
        ratingId: true
      }
    })

    for(let i in appRat){
      // const find = appRating.find(d => d.rating.id === appRat[i].ratingId)
      const find = appRating.find(d => parseInt(d.rating.id) === appRat[i].ratingId)
    
      if(eventUser.event.isPractical === true && find){
        await prisma.practicalTest.createMany({
          data: find.checkerGroupId.map(d => ({
            groupMemberId: parseInt(groupMemberId),
            checkerGroupId: parseInt(d),
            appRatingId: appRat[i].id,
            kindOfPracticalId: 1
          }))
        })
      }

      if(eventUser.event.isSimulator === true && find){
        await prisma.practicalTest.createMany({
          data: find.checkerGroupId.map(d => ({
            groupMemberId: parseInt(groupMemberId),
            checkerGroupId: parseInt(d),
            appRatingId: appRat[i].id,
            kindOfPracticalId: 2
          }))
        })
      }
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
};

const getApplicationDocById = async (req, res) => {
  try {
    const {id} = req.params
    const {eventId, eventUserId, licenseId, logbookUserId, atsName, address, appRating, confirmRating, reason, ratings, location, dateForExpired, confirmOjt, letterNumber, letterDate, controlHour, ojtLicenseId, ojtNik, isDrugs, isFailed, medexId, ielpId } = req.body
    const parsedOjtLicenseId = (ojtLicenseId ?? ojtNik) !== '' ? (ojtLicenseId ?? ojtNik) : null

    const eventUser = await prisma.eventUser.findFirst({
      where: {
        id: parseInt(eventUserId),
      },
      select: {
        event: {
          where: {
            groups: {
              some: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              }
            }
          },
          select: {
            id: true,
            remarkDoc: {
              select: {
                remark: true
              }
            },
            isPractical: true,
            isSimulator: true,
            groups: {
              where: {
                groupMembers: {
                  some: {
                    member: req.user.nik
                    // member: "10011520"
                  }
                }
              },
              select: {
                groupMembers: {
                  where: {
                    member: req.user.nik
                    // member: "10011520"
                  },
                  select: {
                    id: true,
                    member: true
                  }
                },
                checkerGroups: {
                  select: {
                    id: true,
                    checker: true
                  }
                }
              }
            }
          }
        },
        user: {
          select: {
            professionInBranch: {
              select: {
                profession: {
                  select: {
                    profession: true
                  }
                }
              }
            },
            licenseUserId: true
          }
        }
      }
    })

    const groupMember = eventUser.event.groups[0].groupMembers
    const checkerGroup = eventUser.event.groups[0].checkerGroups 
    
    const data = {
      medexId: parseInt(medexId),
      ielpId: parseInt(ielpId),
      licenseId: parseInt(licenseId),
      logbookUserId: parseInt(logbookUserId),
      atsName: atsName !== '' ? atsName : null,
      address: address !== '' ? address : null,
      confirmRating: confirmRating,
      reason: reason !== '' ? reason : null,
      location: location !== '' ? location : null,
      dateForExpired: dayjs.utc(dateForExpired).endOf('day').toDate(),
      confirmOjt: confirmOjt,
      letterNumber: letterNumber !== '' ? letterNumber : null,
      letterDate: letterDate !== '' ? dayjs.utc(letterDate).startOf('day').toDate() : null,
      controlHour: controlHour !== '' ? controlHour : null,
      ojtLicenseId: parsedOjtLicenseId,
      isDrugs: isDrugs,
      isFailed: isFailed,
      statusId: 1,
      appRatings: {
        deleteMany: {},
        createMany: {
          data: appRating.map(data => ({ratingId : parseInt(data.rating.id), controlHour: data.controlHour, statusId: 1}))
        },
      }
    }

    if(ratings.length !== 0){
      data.rating = JSON.stringify(ratings)
    }

    const appDoc = await prisma.applicationDoc.update({
      where: {
        id: parseInt(id)
      },
      data
    })

    const appRat = await prisma.appRating.findMany({
      where: {
        deletedAt: null,
        applicationDocId: appDoc.id
      },
      select:{
        id: true
      }
    })

    for(let i in appRat){
      if(eventUser.event.isPractical === true){
        await prisma.practicalTest.createMany({
          data: checkerGroup.map(d => ({
            groupMemberId: groupMember[0].id,
            checkerGroupId: d.id,
            appRatingId: appRat[i].id,
            kindOfPracticalId: 1
          }))
        })
      }

      if(eventUser.event.isSimulator === true){
        await prisma.practicalTest.createMany({
          data: checkerGroup.map(d => ({
            groupMemberId: groupMember[0].id,
            checkerGroupId: d.id,
            appRatingId: appRat[i].id,
            kindOfPracticalId: 2
          }))
        })
      }
    }

    res.status(201).json({ success: true}); 
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
};

const deleteApplicationDoc = async (req, res) => {
  try {
    const now = dayjs.utc().toDate();
    const { id } = req.params;
  
    await prisma.applicationDoc.update({
      where: { id: parseInt(id) },
        data: { 
          deletedAt: now,
        }
      });

    res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getApplicationDoc, addApplicationDoc, getApplicationDocById, deleteApplicationDoc};
