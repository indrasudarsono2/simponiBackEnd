import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { issueCertificate } from "../services/certificate.js";

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
                  finalScore: true,
                  userRatings: {
                    where: { deletedAt: null, userId: userN },
                    select: { id: true }
                  }
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

const getUserCertificate = async (req, res) => {
  const finalScoreId = Number(req.params.finalScoreId);
  if (!Number.isSafeInteger(finalScoreId) || finalScoreId < 1) {
    return res.status(400).json({ message: "Invalid score ID." });
  }
  try {
    const score = await prisma.finalScore.findFirst({
      where: {
        id: finalScoreId,
        deletedAt: null,
        isInvalidated: false,
        appRating: {
          deletedAt: null,
          applicationDoc: { deletedAt: null, userNik: req.user.nik },
        },
      },
      select: { id: true },
    });
    if (!score) {
      return res.status(404).json({ message: "Certificate is not available for this rating." });
    }
    const certificate = await prisma.$transaction((tx) => issueCertificate(tx, score.id));
    const snapshot = certificate.snapshot;
    res.set("Cache-Control", "private, no-store");
    return res.json({
      finalScoreId: certificate.finalScoreId,
      certificateNumber: certificate.number,
      publicId: certificate.publicId,
      issuedAt: certificate.issuedAt,
      ...snapshot,
    });
  } catch (error) {
    if (error.message === "CERTIFICATE_NOT_ELIGIBLE") {
      return res.status(404).json({ message: "Certificate is not available for this rating." });
    }
    return res.status(500).json({ message: error.message });
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
export { getUserScore, getUserScorePractical, getUserCertificate };
