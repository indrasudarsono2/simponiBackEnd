import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";

const getUserScore = async (req, res) => {
  // const userN = "10077770"
  const userN = req.user.nik
  try {
    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        userNik: userN
      },
      select: {
        event: {
          where: {
            deletedAt: null
          },
          select: {
            event: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null
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
                    deletedAt: null,
                    isInvalidated: false
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
                  essayScore: true,
                  multipleChoiceScore: true,
                  finalScore: true
                  }
                }
              }
            }
          }
        }
      }
    })

    res.json(eventUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserScorePractical = async (req, res)=> {
  // const userN = "10077770"
  const userN = req.user.nik
  try {
    const eventUser = await prisma.eventUser.findMany({
      where: {
        deletedAt: null,
        userNik: userN
      },
      select: {
        event: {
          where: {
            deletedAt: null
          },
          select: {
            event: true
          }
        },
        applicationDocs: {
          where: {
            deletedAt: null
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
                status: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    status: true
                  }
                },
                practicalTests: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    id: true,
                    score: true,
                    createdAt: true,
                    kindOfPractical: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        kind: true
                      }
                    },
                    file: true,
                    checkerGroup: {
                      where: {
                        deletedAt: null
                      },
                      select: {
                        userChecker: {
                          where: {
                            deletedAt: null
                          },
                          select: {
                            name: true
                          }
                        }
                      }
                    },
                    recheckAttempts: {
                      select: {
                        id: true,
                        score: true,
                        file: true,
                        createdAt: true,
                        updatedAt: true,
                        authorization: {
                          select: {
                            status: true
                          }
                        },
                        checkerGroup: {
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
                },
              }
            }
          }
        }
      }
    })

    res.json(eventUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
export { getUserScore, getUserScorePractical };
