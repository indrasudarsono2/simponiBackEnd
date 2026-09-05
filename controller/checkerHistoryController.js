import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";

const getData = async (req, res) => {
  // const branchUnitId = 5
  const branchUnitId = req.user.branchUnitId
  try {
    const remark = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        remark: true,
        events: {
          where: {
            deletedAt: null,
            sector: {
              branchUnitId: branchUnitId
            }
          },
          select: {
            id: true,
            event: true,
            session: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                session: true
              }
            }
          }
        }
      }
    })

    res.json(remark)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postData = async (req, res) => {
  try {
    const {eventId} = req.body;

    const event = await prisma.event.findFirst({
      where: {
        deletedAt: null,
        id: eventId[0]
      },
      select: {
        event: true,
        session: {
          where: {
            deletedAt: null
          },
          select: {
            session: true
          }
        },
        remarkDoc: {
          where: {
            deletedAt: null
          },
          select: {
            remark: true
          }
        }
      }
    })

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: {
          in: eventId
        }
      },
      select: {
        id: true,
        user: {
          where: {
            deletedAt: null
          },
          select: {
            name: true,
            licenseUserId: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null
          },
          select: {
            id: true,
            number: true,
            license: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                file: true,
                expiredDate: true
              }
            },
            medex: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                file: true,
                expired: true
              }
            },
            ielp: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                file: true,
                expired: true
              }
            },
            logbook: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                file: true
              }
            },
            appRatings: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                rating: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    rating: true
                  }
                },
                finalScores: {
                  where: {
                    deletedAt: null,
                    isInvalidated: false
                  },
                  select: {
                    id: true,
                    essayScore: true,
                    multipleChoiceScore: true,
                    finalScore: true,
                    cwpSnapshots: {
                      select: {
                        cwpId: true,
                        cwpName: true,
                        sectorName: true,
                        frequencies: {
                          select: {
                            id: true,
                            frequency: true,
                            isPrimary: true
                          },
                          orderBy: [
                            { isPrimary: "desc" },
                            { frequency: "asc" }
                          ]
                        }
                      },
                      orderBy: { cwpName: "asc" }
                    },
                    event: {
                      select: {
                        sector: {
                          select: {
                            sector: true,
                            sectorCwps: {
                              where: {
                                deletedAt: null,
                                cwp: { deletedAt: null }
                              },
                              select: {
                                cwp: {
                                  select: {
                                    id: true,
                                    cwp: true,
                                    ratingId: true,
                                    cwpFrequencies: {
                                      where: { deletedAt: null },
                                      select: {
                                        id: true,
                                        frequency: true,
                                        isPrimary: true
                                      },
                                      orderBy: [
                                        { isPrimary: "desc" },
                                        { frequency: "asc" }
                                      ]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    status: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        status: true
                      }
                    },
                    status: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        status: true
                      }
                    }
                  }
                },
                practicalTests: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    score: true,
                    file: true,
                    kindOfPractical: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        kind: true
                      }
                    },
                    checkerGroup: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        id: true,
                        userChecker: {
                          where: {
                            deletedAt: null
                          },
                          select: {
                            name: true
                          }
                        }
                      }
                    }
                  },
                }
              }
            }
          }
        }
      }
    })

    const sortEventUser = eventUser.sort((a, b )=> {
      const nameA = a.user.name.toUpperCase();
      const nameB = b.user.name.toUpperCase();

      if(nameA < nameB) {
        return -1
      }
      if(nameA > nameB) {
        return 1
      }
      return 0

    })

    res.json({event, sortEventUser})
  } catch (error) {
     res.status(500).json({ message: error.message });
  }

}

export { getData, postData };
