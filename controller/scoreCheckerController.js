import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getUserCheckerScore = async (req, res) => {
  const branchUnitId = req.user.branchUnitId
  // const branchUnitId = 17
  try {
    const data = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null,
        events: {
          some: {
            sector: {
              branchUnitId
            }
          }
        }
      },
      select: {
        id: true,
        remark: true,
        events: {
          where: {
            deletedAt: null,
            sector: {
              branchUnitId
            }
          },
          select: {
            id: true,
            event: true
          }
        }
      }
    })

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const postUserCheckerScore = async (req, res) => {
  try {
    const {eventId} = req.body

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: parseInt(eventId),
      },
      select: {
        id: true,
        user: {
          select: {
            name: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            number: true,
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
                    rating: true
                  }
                },
                finalScores: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    finalScore: true,
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
                previews: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                  },
                  take: 1
                }
              },
            }
          }
        }
      }
    })

    const sort = eventUser.sort((a, b) => {
      const name = a.user.name.toUpperCase();
      const name2 = b.user.name.toUpperCase();
      if (name < name2) {
        return -1;
      }
    })

    res.json(sort)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postUserCheckerScoreEvidance = async (req, res) => {
  try {
    const {appRatingId} = req.body
    
    const preview = await prisma.preview.findMany({
      where: {
        deletedAt: null,
        appRatingId
      },
      select: {
        id: true,
        file: true,
        createdAt: true
      }
    })
    res.json(preview)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getUserCheckerPractical = async (req, res) => {
  // const brachUnitId = req.user.branchUnitId
  const branchUnitId = 17
  try {
    const data = await prisma.remarkDoc.findMany({
      where: {
        deletedAt: null,
        events: {
          some: {
            sector: {
              branchUnitId
            }
          }
        }
      },
      select: {
        id: true,
        remark: true,
        events: {
          where: {
            deletedAt: null,
            sector: {
              branchUnitId
            }
          },
          select: {
            id: true,
            event: true
          }
        }
      }
    })

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const postUserCheckerPractical = async (req, res) => {
  try {
    const {eventId} = req.body

    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        eventId: parseInt(eventId),
      },
      select: {
        id: true,
        user: {
          select: {
            name: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
            number: true,
            appRatings: {
              where: {
                deletedAt: null
              },
              select: {
                id: true,
                status: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    status: true
                  }
                },
                rating: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    rating: true
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
                        kind: true
                      }
                    },
                    checkerGroup: {
                      where: {
                        deletedAt: null
                      },
                      select: {
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
            }
          }
        }
      }
    })

    const sort = eventUser.sort((a, b) => {
      const name = a.user.name.toUpperCase();
      const name2 = b.user.name.toUpperCase();
      if (name < name2) {
        return -1;
      }
    })

    res.json(sort)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getUserCheckerScore, postUserCheckerScore, postUserCheckerScoreEvidance, getUserCheckerPractical, postUserCheckerPractical };