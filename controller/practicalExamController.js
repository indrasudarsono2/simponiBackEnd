import prisma from "../lib/prisma.js";
import config from "../utils/config.json";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import path from "path";
import { createSignedFileUrl } from "../middleware/privateFiles.js";

dayjs.extend(utc);

const PRACTICAL_EXAM_ECHAIN_FIELDS = [
  "profession",
  "practicalCheckedAt",
  "rating",
  "validUntil",
  "file",
];

const buildEchainHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (process.env.ECHAIN_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ECHAIN_BEARER_TOKEN}`;
  }

  if (process.env.ECHAIN_API_KEY) {
    headers["X-API-Key"] = process.env.ECHAIN_API_KEY;
  }

  return headers;
};

const toIsoStringOrNull = (value) => value ? dayjs(value).toISOString() : null;

const getRequestOrigin = (req) => {
  if (process.env.SIMPONI_PUBLIC_BASE_URL) return process.env.SIMPONI_PUBLIC_BASE_URL.replace(/\/$/, "");
  const forwardedProto = req.get("X-Forwarded-Proto");
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
};

const getFileName = (filePath = "") => filePath.replaceAll("\\", "/").split("/").pop() || filePath;

const isPdfFile = (filePath = "") => /\.pdf(\?|#|$)/i.test(filePath);

const isPdfUpload = (file) => {
  if (!file) return true;
  return file.mimetype === "application/pdf" && isPdfFile(file.originalname || file.filename || "");
};

const getLatestPracticalExamSyncSelect = {
  id: true,
  status: true,
  sentAt: true,
  errorMessage: true,
  echainRequestId: true,
  createdAt: true,
};

const getPracticalExamForEchain = async (practicalTestId) => prisma.practicalTest.findFirst({
  where: {
    id: practicalTestId,
    deletedAt: null,
  },
  select: {
    id: true,
    score: true,
    file: true,
    updatedAt: true,
    kindOfPractical: { select: { kind: true } },
    checkerGroup: {
      select: {
        checker: true,
        userChecker: {
          select: {
            nik: true,
            name: true,
          },
        },
      },
    },
    appRating: {
      select: {
        id: true,
        ratingId: true,
        status: {
          select: {
            status: true,
          },
        },
        rating: {
          select: {
            id: true,
            rating: true,
          },
        },
        applicationDoc: {
          select: {
            id: true,
            number: true,
            userNik: true,
            user: {
              select: {
                nik: true,
                name: true,
                licenseUserId: true,
                professionInBranch: {
                  select: {
                    profession: {
                      select: {
                        profession: true,
                      },
                    },
                  },
                },
              },
            },
            eventUser: {
              select: {
                event: {
                  select: {
                    id: true,
                    event: true,
                    startDate: true,
                    finishDate: true,
                    forExpiredDate: true,
                    passingGrade: true,
                  },
                },
              },
            },
          },
        },
        finalScores: {
          where: {
            deletedAt: null,
            isInvalidated: false,
          },
          orderBy: {
            id: "desc",
          },
          take: 1,
          select: {
            id: true,
            finalScore: true,
            status: {
              select: {
                status: true,
              },
            },
            userRatings: {
              where: {
                deletedAt: null,
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              select: {
                expireddate: true,
              },
            },
          },
        },
      },
    },
  },
});

const getPracticalRecheckForEchain = async (recheckAttemptId) => prisma.practicalRecheckAttempt.findFirst({
  where: {
    id: recheckAttemptId,
  },
  select: {
    id: true,
    practicalTestId: true,
    score: true,
    file: true,
    updatedAt: true,
    checkerGroup: {
      select: {
        checker: true,
      },
    },
    practicalTest: {
      select: {
        id: true,
        kindOfPractical: { select: { kind: true } },
      },
    },
    authorization: {
      select: {
        status: true,
        completedAt: true,
        appRating: {
          select: {
            id: true,
            ratingId: true,
            rating: {
              select: {
                rating: true,
              },
            },
            applicationDoc: {
              select: {
                userNik: true,
                user: {
                  select: {
                    professionInBranch: {
                      select: {
                        profession: {
                          select: {
                            profession: true,
                          },
                        },
                      },
                    },
                  },
                },
                eventUser: {
                  select: {
                    event: {
                      select: {
                        startDate: true,
                        forExpiredDate: true,
                      },
                    },
                  },
                },
              },
            },
            finalScores: {
              where: {
                deletedAt: null,
                isInvalidated: false,
              },
              orderBy: {
                id: "desc",
              },
              take: 1,
              select: {
                userRatings: {
                  where: {
                    deletedAt: null,
                  },
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                  select: {
                    expireddate: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

const buildPracticalExamEchainPayload = (practicalTest, origin) => {
  const appRating = practicalTest.appRating;
  const applicationDoc = appRating?.applicationDoc;
  const event = applicationDoc?.eventUser?.event;
  const finalScore = appRating?.finalScores?.[0];
  const userRatingExpiredAt = finalScore?.userRatings?.[0]?.expireddate;
  const ratingExpiredAt = userRatingExpiredAt || event?.forExpiredDate || null;
  const signedFileUrl = practicalTest.file ? createSignedFileUrl(practicalTest.file) : null;

  return {
    profession: applicationDoc?.user?.professionInBranch?.profession?.profession || null,
    practicalCheckedAt: toIsoStringOrNull(practicalTest.updatedAt || event?.startDate),
    rating: appRating?.rating?.rating || null,
    validUntil: toIsoStringOrNull(ratingExpiredAt),
    file: practicalTest.file ? {
      fileName: getFileName(practicalTest.file),
      fileUrl: signedFileUrl ? `${origin}${signedFileUrl}` : null,
      fileMimeType: "application/pdf",
    } : null,
    requestedFields: PRACTICAL_EXAM_ECHAIN_FIELDS,
  };
};

const buildPracticalRecheckEchainPayload = (attempt, origin) => {
  const appRating = attempt.authorization?.appRating;
  const applicationDoc = appRating?.applicationDoc;
  const event = applicationDoc?.eventUser?.event;
  const finalScore = appRating?.finalScores?.[0];
  const userRatingExpiredAt = finalScore?.userRatings?.[0]?.expireddate;
  const ratingExpiredAt = userRatingExpiredAt || event?.forExpiredDate || null;
  const signedFileUrl = attempt.file ? createSignedFileUrl(attempt.file) : null;

  return {
    profession: applicationDoc?.user?.professionInBranch?.profession?.profession || null,
    practicalCheckedAt: toIsoStringOrNull(attempt.updatedAt || attempt.authorization?.completedAt || event?.startDate),
    rating: appRating?.rating?.rating || null,
    validUntil: toIsoStringOrNull(ratingExpiredAt),
    file: attempt.file ? {
      fileName: getFileName(attempt.file),
      fileUrl: signedFileUrl ? `${origin}${signedFileUrl}` : null,
      fileMimeType: "application/pdf",
    } : null,
    requestedFields: PRACTICAL_EXAM_ECHAIN_FIELDS,
  };
};

const loadPracticalExamForEchainAction = async (practicalTestId, checkerNik, origin) => {
  const practicalTest = await getPracticalExamForEchain(practicalTestId);
  if (!practicalTest?.appRating) {
    return { status: 404, message: "Practical exam data was not found." };
  }
  if (practicalTest.checkerGroup?.checker !== checkerNik) {
    return { status: 403, message: "This practical exam is not assigned to you." };
  }
  if (practicalTest.score == null) {
    return { status: 409, message: "Input the practical exam score before sending to e-chain." };
  }
  if (practicalTest.appRating?.status?.status !== "SUCCESS") {
    return { status: 409, message: "Only SUCCESS practical exam data can be sent to e-chain." };
  }
  if (!practicalTest.file) {
    return { status: 409, message: "Upload the practical exam PDF file before sending to e-chain." };
  }
  if (!isPdfFile(practicalTest.file)) {
    return { status: 409, message: "Only PDF practical exam files can be sent to e-chain." };
  }

  return {
    status: 200,
    practicalTest,
    payload: buildPracticalExamEchainPayload(practicalTest, origin),
  };
};

const loadPracticalRecheckForEchainAction = async (recheckAttemptId, checkerNik, origin) => {
  const attempt = await getPracticalRecheckForEchain(recheckAttemptId);
  if (!attempt?.authorization?.appRating) {
    return { status: 404, message: "Practical recheck data was not found." };
  }
  if (attempt.checkerGroup?.checker !== checkerNik) {
    return { status: 403, message: "This practical recheck is not assigned to you." };
  }
  if (attempt.score == null) {
    return { status: 409, message: "Input the practical recheck score before sending to e-chain." };
  }
  if (attempt.authorization.status !== "SUCCESS") {
    return { status: 409, message: "Only SUCCESS practical recheck data can be sent to e-chain." };
  }
  if (!attempt.file) {
    return { status: 409, message: "Upload the practical recheck PDF file before sending to e-chain." };
  }
  if (!isPdfFile(attempt.file)) {
    return { status: 409, message: "Only PDF practical recheck files can be sent to e-chain." };
  }

  return {
    status: 200,
    attempt,
    payload: buildPracticalRecheckEchainPayload(attempt, origin),
  };
};

const getPractical = async(req, res) => {
  try {
    const userN = req.user.nik
    const waitingPracticalStatus = await prisma.status.findFirst({
      where: { status: "WAITING PRACTICAL", deletedAt: null },
      select: { id: true }
    });
    const eligibleStatusIds = [5, 6, 7, waitingPracticalStatus?.id].filter(Boolean);
    // const userN = "10077770"
    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        appRatings: {
          some: {
            statusId: { in: eligibleStatusIds },
            finalScores:{
              some: {
                deletedAt: null,
                isInvalidated: false,
                statusId: {
                  in: eligibleStatusIds
                },
                groupMember: {
                  group: {
                    checkerGroups: {
                      some: {
                        checker: userN
                      }
                    }
                  }
                }
              }
            },
          }
        }
      },
      select: {
        id: true,
        number: true,
        user: {
          select: {
            name: true
          }
        },
        eventUser: {
          select: {
            event: {
              select: { passingGrade: true }
            }
          }
        },
        appRatings: {
          where: {
            deletedAt: null,
            statusId: { in: eligibleStatusIds },
            finalScores: {
              some: {
                deletedAt: null,
                isInvalidated: false,
                statusId: {
                  in: eligibleStatusIds
                }
              }
            }
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
            statusId: true,
            status: {
              select: {
                status: true
              }
            },
            practicalTests: {
              where: {
                deletedAt: null,
                checkerGroup: {
                  checker: userN
                }
              },
              select: {
                id: true,
                score: true,
                file: true,
                echainSyncs: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: getLatestPracticalExamSyncSelect,
                },
                kindOfPractical: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    kind: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const rechecks = await prisma.practicalRecheckAttempt.findMany({
      where: {
        authorization: { status: { in: ["ACTIVE", "SUCCESS", "FAILED"] } },
        checkerGroup: { is: { checker: userN, deletedAt: null } }
      },
      select: {
        id: true,
        score: true,
        file: true,
        echainSyncs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: getLatestPracticalExamSyncSelect,
        },
        practicalTest: {
          select: {
            id: true,
            score: true,
            file: true,
            kindOfPractical: { select: { kind: true } }
          }
        },
        authorization: {
          select: {
            id: true,
            status: true,
            completedAt: true,
            reason: true,
            passingGrade: true,
            appRating: {
              select: {
                id: true,
                rating: { select: { rating: true } },
                applicationDoc: {
                  select: {
                    number: true,
                    user: { select: { name: true } },
                    eventUser: { select: { event: { select: { event: true } } } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { id: "asc" }
    });

    res.json({applicationDoc, rechecks})
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const putPractical = async (req, res) => {
  try {
    const {id} = req.params
    const {score} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    const practicalTestId = Number(id);
    const numericScore = Number(score);

    if (!Number.isInteger(practicalTestId) || practicalTestId <= 0) {
      return res.status(400).json({ message: "A valid practical test ID is required." });
    }
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 100) {
      return res.status(400).json({ message: "Score must be an integer between 1 and 100." });
    }
    if (file && !isPdfUpload(file)) {
      return res.status(400).json({ message: "Practical exam evidence file must be PDF." });
    }

    const existingPractialTest = await prisma.practicalTest.findFirst({
      where: {
        id: practicalTestId,
        deletedAt: null
      },
      select: {
        file: true,
        appRatingId: true,
        checkerGroup: { select: { checker: true } },
        appRating: {
          select: {
            ratingId: true,
            applicationDoc: {
              select: {
                userNik: true,
                eventUser: {
                  select: {
                    event: {
                      select: {
                        id: true,
                        passingGrade: true,
                        forExpiredDate: true,
                        isPractical: true,
                        isSimulator: true
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

    if (!existingPractialTest?.appRatingId || !existingPractialTest.appRating) {
      return res.status(404).json({ message: "Practical test was not found." });
    }
    if (existingPractialTest.checkerGroup?.checker !== req.user.nik) {
      return res.status(403).json({ message: "This practical test is not assigned to you." });
    }

    const event = existingPractialTest.appRating.applicationDoc?.eventUser?.event;
    if (!event || (!event.isPractical && !event.isSimulator)) {
      return res.status(409).json({ message: "This event does not require a practical examination." });
    }
    if (event.passingGrade == null || !Number.isFinite(Number(event.passingGrade))) {
      return res.status(409).json({ message: "The event passing grade is not configured." });
    }
    const confirmsFailingScore = req.body?.confirmBelowPassingGrade === true
      || req.body?.confirmBelowPassingGrade === "true";
    if (numericScore < Number(event.passingGrade) && !confirmsFailingScore) {
      return res.status(400).json({
        message: `Score ${numericScore} is below the passing grade of ${event.passingGrade}. Explicit confirmation is required.`
      });
    }

    const waitingPracticalStatus = await prisma.status.findFirst({
      where: { status: "WAITING PRACTICAL", deletedAt: null },
      select: { id: true }
    });
    if (!waitingPracticalStatus) {
      return res.status(500).json({ message: "WAITING PRACTICAL status is not configured." });
    }

    const putPrac = { score: numericScore }
    if(file){
      putPrac.file = `/uploads/practicalTest/${file.filename}`
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.practicalTest.update({
        where: { id: practicalTestId },
        data: putPrac
      });

      const appRating = await tx.appRating.findUnique({
        where: { id: existingPractialTest.appRatingId },
        select: {
          id: true,
          ratingId: true,
          practicalTests: {
            where: { deletedAt: null },
            select: { id: true, score: true }
          },
          finalScores: {
            where: { eventId: event.id, deletedAt: null, isInvalidated: false },
            orderBy: { id: "desc" },
            take: 1,
            select: { id: true }
          }
        }
      });

      const finalScore = appRating?.finalScores[0];
      if (!appRating || !finalScore) {
        throw new Error("A valid theory result is required before practical completion.");
      }

      const allCompleted = appRating.practicalTests.length > 0
        && appRating.practicalTests.every((test) => test.score != null);
      const allPassed = allCompleted
        && appRating.practicalTests.every((test) => Number(test.score) >= Number(event.passingGrade));
      const overallStatusId = !allCompleted
        ? waitingPracticalStatus.id
        : allPassed ? 7 : 6;

      await tx.appRating.update({
        where: { id: appRating.id },
        data: { statusId: overallStatusId }
      });
      await tx.finalScore.update({
        where: { id: finalScore.id },
        data: { statusId: overallStatusId }
      });

      if (allPassed) {
        const existingRating = await tx.userRating.findFirst({
          where: { finalScoreId: finalScore.id, deletedAt: null },
          select: { id: true }
        });
        if (!existingRating) {
          await tx.userRating.create({
            data: {
              ratingId: appRating.ratingId,
              userId: existingPractialTest.appRating.applicationDoc?.userNik,
              finalScoreId: finalScore.id,
              expireddate: event.forExpiredDate
            }
          });
        }
      } else {
        await tx.userRating.updateMany({
          where: { finalScoreId: finalScore.id, deletedAt: null },
          data: { deletedAt: new Date() }
        });
      }

      return {
        allCompleted,
        allPassed,
        overallStatus: !allCompleted ? "WAITING PRACTICAL" : allPassed ? "SUCCESS" : "FAILED"
      };
    });

    if(file && existingPractialTest.file){
      const oldFile = path.join(process.cwd(), existingPractialTest.file)
      if(fs.existsSync(oldFile)){
        await fs.promises.unlink(oldFile)
      }
    }

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
}

const putPracticalRecheck = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const score = Number(req.body?.score);
    const file = req.files?.[0] || null;
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(score) || score < 1 || score > 100) {
      return res.status(400).json({ message: "A valid recheck and score from 1 to 100 are required." });
    }
    if (!file) return res.status(400).json({ message: "Recheck evidence file is required." });
    if (!isPdfUpload(file)) return res.status(400).json({ message: "Recheck evidence file must be PDF." });

    const attempt = await prisma.practicalRecheckAttempt.findFirst({
      where: {
        id,
        authorization: { status: { in: ["ACTIVE", "SUCCESS", "FAILED"] } },
        checkerGroup: { is: { checker: req.user.nik, deletedAt: null } }
      },
      select: {
        id: true,
        score: true,
        file: true,
        authorizationId: true,
        authorization: {
          select: {
            status: true,
            passingGrade: true,
            appRatingId: true,
            appRating: {
              select: {
                ratingId: true,
                applicationDoc: {
                  select: {
                    userNik: true,
                    eventUser: { select: { event: { select: { id: true, forExpiredDate: true } } } }
                  }
                },
                finalScores: {
                  where: { deletedAt: null, isInvalidated: false },
                  orderBy: { id: "desc" },
                  take: 1,
                  select: { id: true }
                }
              }
            }
          }
        }
      }
    });
    if (!attempt) return res.status(404).json({ message: "Practical recheck was not found or is not assigned to you." });

    const passingGrade = Number(attempt.authorization.passingGrade);
    const storedFile = `/uploads/practicalTest/${file.filename}`;

    if (attempt.authorization.status !== "ACTIVE") {
      if (Number(attempt.score) !== score) {
        return res.status(409).json({ message: "Completed practical recheck score cannot be changed. Only the PDF file can be updated." });
      }

      await prisma.practicalRecheckAttempt.update({
        where: { id },
        data: { file: storedFile }
      });

      if (attempt.file) {
        const oldFile = path.join(process.cwd(), attempt.file);
        if (fs.existsSync(oldFile)) {
          await fs.promises.unlink(oldFile);
        }
      }

      return res.json({
        success: true,
        allCompleted: true,
        allPassed: attempt.authorization.status === "SUCCESS",
        overallStatus: attempt.authorization.status,
      });
    }

    const confirmsFailure = req.body?.confirmBelowPassingGrade === true || req.body?.confirmBelowPassingGrade === "true";
    if (score < passingGrade && !confirmsFailure) {
      return res.status(400).json({ message: `Score ${score} is below the passing grade of ${passingGrade}. Explicit confirmation is required.` });
    }

    const finalScore = attempt.authorization.appRating.finalScores[0];
    const event = attempt.authorization.appRating.applicationDoc?.eventUser?.event;
    if (!finalScore || !event) return res.status(409).json({ message: "The related examination result is unavailable." });

    const result = await prisma.$transaction(async (tx) => {
      await tx.practicalRecheckAttempt.update({ where: { id }, data: { score, file: storedFile } });
      const authorization = await tx.practicalRecheckAuthorization.findUnique({
        where: { id: attempt.authorizationId },
        select: { attempts: { select: { score: true } } }
      });
      const allCompleted = authorization.attempts.every((item) => item.score != null);
      if (!allCompleted) return { allCompleted: false, allPassed: false, overallStatus: "PRACTICAL RECHECK" };

      const allPassed = authorization.attempts.every((item) => Number(item.score) >= passingGrade);
      const overallStatusId = allPassed ? 7 : 6;
      await tx.practicalRecheckAuthorization.update({
        where: { id: attempt.authorizationId },
        data: { status: allPassed ? "SUCCESS" : "FAILED", completedAt: new Date() }
      });
      await tx.appRating.update({ where: { id: attempt.authorization.appRatingId }, data: { statusId: overallStatusId } });
      await tx.finalScore.update({ where: { id: finalScore.id }, data: { statusId: overallStatusId } });

      if (allPassed) {
        const existingRating = await tx.userRating.findFirst({ where: { finalScoreId: finalScore.id, deletedAt: null }, select: { id: true } });
        if (!existingRating) {
          await tx.userRating.create({
            data: {
              ratingId: attempt.authorization.appRating.ratingId,
              userId: attempt.authorization.appRating.applicationDoc?.userNik,
              finalScoreId: finalScore.id,
              expireddate: event.forExpiredDate
            }
          });
        }
      }
      return { allCompleted: true, allPassed, overallStatus: allPassed ? "SUCCESS" : "FAILED" };
    });

    if (attempt.file) {
      const oldFile = path.join(process.cwd(), attempt.file);
      if (fs.existsSync(oldFile)) {
        await fs.promises.unlink(oldFile);
      }
    }

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPracticalExamEchainPayload = async (req, res) => {
  const practicalTestId = Number(req.params.id);
  if (!Number.isInteger(practicalTestId) || practicalTestId <= 0) {
    return res.status(400).json({ success: false, message: "A valid practical test ID is required." });
  }

  try {
    const result = await loadPracticalExamForEchainAction(practicalTestId, req.user.nik, getRequestOrigin(req));
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      message: "Practical exam e-chain payload is ready for review.",
      data: result.payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to prepare practical exam data for e-chain review.",
      error: {
        code: "PRACTICAL_EXAM_ECHAIN_PREVIEW_FAILED",
        details: error.message,
      },
    });
  }
};

const getPracticalRecheckEchainPayload = async (req, res) => {
  const recheckAttemptId = Number(req.params.id);
  if (!Number.isInteger(recheckAttemptId) || recheckAttemptId <= 0) {
    return res.status(400).json({ success: false, message: "A valid practical recheck attempt ID is required." });
  }

  try {
    const result = await loadPracticalRecheckForEchainAction(recheckAttemptId, req.user.nik, getRequestOrigin(req));
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      message: "Practical recheck e-chain payload is ready for review.",
      data: result.payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to prepare practical recheck data for e-chain review.",
      error: {
        code: "PRACTICAL_RECHECK_ECHAIN_PREVIEW_FAILED",
        details: error.message,
      },
    });
  }
};

const sendPracticalExamToEchain = async (req, res) => {
  const practicalTestId = Number(req.params.id);
  if (!Number.isInteger(practicalTestId) || practicalTestId <= 0) {
    return res.status(400).json({ success: false, message: "A valid practical test ID is required." });
  }

  try {
    const practicalResult = await loadPracticalExamForEchainAction(practicalTestId, req.user.nik, getRequestOrigin(req));
    if (practicalResult.status !== 200) {
      return res.status(practicalResult.status).json({ success: false, message: practicalResult.message });
    }

    const baseUrl = process.env.ECHAIN_BASE_URL;
    const sendPath = process.env.ECHAIN_PRACTICAL_EXAM_SEND_PATH || "/api/integrations/simponi/practical-exam";
    const payload = practicalResult.payload;

    if (process.env.ECHAIN_MOCK_MODE === "true") {
      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          practicalTestId,
          echainRequestId: `mock-practical-${practicalTestId}-${Date.now()}`,
          status: "SUCCESS",
          requestPayload: payload,
          responsePayload: {
            success: true,
            message: "Practical exam received by e-chain mock mode.",
          },
          sentAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Practical exam sent to e-chain mock mode.",
        data: {
          sync,
        },
      });
    }

    if (!baseUrl) {
      return res.status(503).json({
        success: false,
        message: "e-chain integration is not configured.",
        error: {
          code: "ECHAIN_NOT_CONFIGURED",
          details: "Set ECHAIN_BASE_URL before sending practical exam data to e-chain.",
        },
      });
    }

    const controller = new AbortController();
    const timeoutMs = Number(process.env.ECHAIN_TIMEOUT_MS || 10000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(sendPath, baseUrl);
      const response = await fetch(url, {
        method: "POST",
        headers: buildEchainHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseBody = await response.json().catch(() => null);
      const responseRequestId = responseBody?.data?.echainRequestId || responseBody?.echainRequestId || null;

      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          practicalTestId,
          echainRequestId: responseRequestId,
          status: response.ok ? "SUCCESS" : "FAILED",
          requestPayload: payload,
          responsePayload: responseBody,
          errorMessage: response.ok ? null : responseBody?.message || `e-chain responded with HTTP ${response.status}.`,
          sentAt: response.ok ? new Date() : null,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: responseBody?.message || "Failed to send practical exam data to e-chain.",
          error: responseBody?.error || {
            code: "ECHAIN_HTTP_ERROR",
            details: `e-chain responded with HTTP ${response.status}.`,
          },
          data: { sync },
        });
      }

      return res.json({
        success: true,
        message: responseBody?.message || "Practical exam data sent to e-chain.",
        data: {
          sync,
          echain: responseBody?.data || null,
        },
      });
    } catch (error) {
      const isTimeout = error.name === "AbortError";
      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          practicalTestId,
          status: "FAILED",
          requestPayload: payload,
          responsePayload: null,
          errorMessage: error.message,
          sentAt: null,
        },
      });

      return res.status(isTimeout ? 504 : 502).json({
        success: false,
        message: isTimeout ? "e-chain practical exam send timed out." : "Failed to send practical exam data to e-chain.",
        error: {
          code: isTimeout ? "ECHAIN_TIMEOUT" : "ECHAIN_REQUEST_FAILED",
          details: error.message,
        },
        data: { sync },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to prepare practical exam data for e-chain.",
      error: {
        code: "PRACTICAL_EXAM_ECHAIN_SEND_FAILED",
        details: error.message,
      },
    });
  }
};

const sendPracticalRecheckToEchain = async (req, res) => {
  const recheckAttemptId = Number(req.params.id);
  if (!Number.isInteger(recheckAttemptId) || recheckAttemptId <= 0) {
    return res.status(400).json({ success: false, message: "A valid practical recheck attempt ID is required." });
  }

  try {
    const recheckResult = await loadPracticalRecheckForEchainAction(recheckAttemptId, req.user.nik, getRequestOrigin(req));
    if (recheckResult.status !== 200) {
      return res.status(recheckResult.status).json({ success: false, message: recheckResult.message });
    }

    const practicalTestId = recheckResult.attempt.practicalTestId;
    const payload = recheckResult.payload;
    const syncIdentity = {
      practicalTestId,
      practicalRecheckAttemptId: recheckAttemptId,
    };

    if (process.env.ECHAIN_MOCK_MODE === "true") {
      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          ...syncIdentity,
          echainRequestId: `mock-practical-recheck-${recheckAttemptId}-${Date.now()}`,
          status: "SUCCESS",
          requestPayload: payload,
          responsePayload: {
            success: true,
            message: "Practical recheck received by e-chain mock mode.",
          },
          sentAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Practical recheck sent to e-chain mock mode.",
        data: { sync },
      });
    }

    const baseUrl = process.env.ECHAIN_BASE_URL;
    const sendPath = process.env.ECHAIN_PRACTICAL_EXAM_SEND_PATH || "/api/integrations/simponi/practical-exam";

    if (!baseUrl) {
      return res.status(503).json({
        success: false,
        message: "e-chain integration is not configured.",
        error: {
          code: "ECHAIN_NOT_CONFIGURED",
          details: "Set ECHAIN_BASE_URL before sending practical recheck data to e-chain.",
        },
      });
    }

    const controller = new AbortController();
    const timeoutMs = Number(process.env.ECHAIN_TIMEOUT_MS || 10000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL(sendPath, baseUrl);
      const response = await fetch(url, {
        method: "POST",
        headers: buildEchainHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseBody = await response.json().catch(() => null);
      const responseRequestId = responseBody?.data?.echainRequestId || responseBody?.echainRequestId || null;

      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          ...syncIdentity,
          echainRequestId: responseRequestId,
          status: response.ok ? "SUCCESS" : "FAILED",
          requestPayload: payload,
          responsePayload: responseBody,
          errorMessage: response.ok ? null : responseBody?.message || `e-chain responded with HTTP ${response.status}.`,
          sentAt: response.ok ? new Date() : null,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          message: responseBody?.message || "Failed to send practical recheck data to e-chain.",
          error: responseBody?.error || {
            code: "ECHAIN_HTTP_ERROR",
            details: `e-chain responded with HTTP ${response.status}.`,
          },
          data: { sync },
        });
      }

      return res.json({
        success: true,
        message: responseBody?.message || "Practical recheck data sent to e-chain.",
        data: {
          sync,
          echain: responseBody?.data || null,
        },
      });
    } catch (error) {
      const isTimeout = error.name === "AbortError";
      const sync = await prisma.practicalExamEchainSync.create({
        data: {
          ...syncIdentity,
          status: "FAILED",
          requestPayload: payload,
          responsePayload: null,
          errorMessage: error.message,
          sentAt: null,
        },
      });

      return res.status(isTimeout ? 504 : 502).json({
        success: false,
        message: isTimeout ? "e-chain practical recheck send timed out." : "Failed to send practical recheck data to e-chain.",
        error: {
          code: isTimeout ? "ECHAIN_TIMEOUT" : "ECHAIN_REQUEST_FAILED",
          details: error.message,
        },
        data: { sync },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to prepare practical recheck data for e-chain.",
      error: {
        code: "PRACTICAL_RECHECK_ECHAIN_SEND_FAILED",
        details: error.message,
      },
    });
  }
};

export {getPractical, putPractical, putPracticalRecheck, getPracticalExamEchainPayload, getPracticalRecheckEchainPayload, sendPracticalExamToEchain, sendPracticalRecheckToEchain};
