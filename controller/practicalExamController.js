import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { createSignedFileUrl } from "../middleware/privateFiles.js";
import sanitizeHtml from "sanitize-html";
import { issueCertificate, revokeCertificatesForFinalScore } from "../services/certificate.js";

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
  requestPayload: true,
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
    recheckAttempts: { orderBy: { updatedAt: 'desc' }, take: 1,
      select: { updatedAt: true, authorization: { select: { status: true } } } },
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
    groupMember: { select: { member: true, group: { select: { pic: true } } } },
    appRating: {
      select: {
        id: true,
        practicalLicense: { select: { id: true, file: true, expiredDate: true } },
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
                    practicalPassingGrade: true,
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
        groupMember: { select: { member: true, group: { select: { pic: true } } } },
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
            practicalLicense: { select: { id: true, file: true, expiredDate: true } },
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
  const ratingExpiredAt = appRating?.practicalLicense?.expiredDate || userRatingExpiredAt || event?.forExpiredDate || null;
  const licenseFile = appRating?.practicalLicense?.file;
  const signedFileUrl = licenseFile ? createSignedFileUrl(licenseFile) : null;

  return {
    profession: applicationDoc?.user?.professionInBranch?.profession?.profession || null,
    practicalCheckedAt: toIsoStringOrNull(
      practicalTest.recheckAttempts?.[0]?.authorization?.status === 'SUCCESS'
        ? practicalTest.recheckAttempts[0].updatedAt : practicalTest.updatedAt || event?.startDate,
    ),
    rating: appRating?.rating?.rating || null,
    validUntil: toIsoStringOrNull(ratingExpiredAt),
    file: licenseFile ? {
      fileName: getFileName(licenseFile),
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
  const ratingExpiredAt = appRating?.practicalLicense?.expiredDate || userRatingExpiredAt || event?.forExpiredDate || null;
  const licenseFile = appRating?.practicalLicense?.file;
  const signedFileUrl = licenseFile ? createSignedFileUrl(licenseFile) : null;

  return {
    profession: applicationDoc?.user?.professionInBranch?.profession?.profession || null,
    practicalCheckedAt: toIsoStringOrNull(attempt.updatedAt || attempt.authorization?.completedAt || event?.startDate),
    rating: appRating?.rating?.rating || null,
    validUntil: toIsoStringOrNull(ratingExpiredAt),
    file: licenseFile ? {
      fileName: getFileName(licenseFile),
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
  if (practicalTest.groupMember?.group?.pic !== checkerNik ||
      practicalTest.groupMember.member !== practicalTest.appRating.applicationDoc?.userNik) {
    return { status: 403, message: "Only this member's assigned PIC can send the license." };
  }
  if (practicalTest.score == null) {
    return { status: 409, message: "Input the practical exam score before sending to e-chain." };
  }
  if (practicalTest.appRating?.status?.status !== "SUCCESS") {
    return { status: 409, message: "Only SUCCESS practical exam data can be sent to e-chain." };
  }
  if (!practicalTest.appRating.practicalLicense?.file) {
    return { status: 409, message: "Upload the rating license PDF before sending to e-chain." };
  }
  if (!isPdfFile(practicalTest.appRating.practicalLicense.file)) {
    return { status: 409, message: "Only a PDF license can be sent to e-chain." };
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
  if (attempt.practicalTest?.groupMember?.group?.pic !== checkerNik ||
      attempt.practicalTest.groupMember.member !== attempt.authorization.appRating.applicationDoc?.userNik) {
    return { status: 403, message: "Only this member's assigned PIC can send the license." };
  }
  if (attempt.score == null) {
    return { status: 409, message: "Input the practical recheck score before sending to e-chain." };
  }
  if (attempt.authorization.status !== "SUCCESS") {
    return { status: 409, message: "Only SUCCESS practical recheck data can be sent to e-chain." };
  }
  if (!attempt.authorization.appRating.practicalLicense?.file) {
    return { status: 409, message: "Upload the rating license PDF before sending to e-chain." };
  }
  if (!isPdfFile(attempt.authorization.appRating.practicalLicense.file)) {
    return { status: 409, message: "Only a PDF license can be sent to e-chain." };
  }

  return {
    status: 200,
    attempt,
    payload: buildPracticalRecheckEchainPayload(attempt, origin),
  };
};

const licenseAlreadySent = async (appRatingId, licenseFileName) => {
  const sent = await prisma.practicalExamEchainSync.findMany({
    where: { practicalTest: { appRatingId }, status: 'SUCCESS' },
    select: { requestPayload: true },
  });
  return sent.some((item) => item.requestPayload?.file?.fileName === licenseFileName);
};

const getPractical = async(req, res) => {
  try {
    const userN = req.user.nik
    const waitingPracticalStatus = await prisma.status.findFirst({
      where: { status: "WAITING PRACTICAL", deletedAt: null },
      select: { id: true }
    });
    const eligibleStatusIds = [5, 6, 7, waitingPracticalStatus?.id].filter(Boolean);
    const eligibleRating = {
      statusId: { in: eligibleStatusIds },
      finalScores: {
        some: {
          deletedAt: null,
          isInvalidated: false,
          statusId: { in: eligibleStatusIds },
          groupMember: { group: { pic: userN } }
        }
      }
    };
    if (req.query.view === 'events') {
      const events = await prisma.event.findMany({
        where: {
          deletedAt: null,
          eventUsers: {
            some: {
              applicationDocs: {
                some: { deletedAt: null, appRatings: { some: eligibleRating } }
              }
            }
          }
        },
        select: { id: true, event: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      });
      return res.json({ events });
    }
    const eventId = Number(req.query.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ message: 'Select an event to load practical exam data.' });
    }
    // const userN = "10077770"
    const applicationDoc = await prisma.applicationDoc.findMany({
      where: {
        deletedAt: null,
        eventUser: { eventId },
        appRatings: { some: eligibleRating }
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
              select: { event: true, forExpiredDate: true, passingGrade: true, practicalPassingGrade: true }
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
                },
                groupMember: { group: { pic: userN } }
              }
            }
          },
          select: {
            id: true,
            practicalLicense: { select: { id: true, file: true, expiredDate: true } },
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
            finalScores: {
              where: {
                deletedAt: null,
                isInvalidated: false
              },
              orderBy: { id: "desc" },
              take: 1,
              select: {
                statusId: true,
                finalScore: true,
                status: {
                  select: { status: true }
                }
              }
            },
            practicalTests: {
              where: {
                deletedAt: null,
                groupMember: { group: { pic: userN } }
              },
              orderBy: { id: 'asc' },
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
        practicalTest: { groupMember: { group: { pic: userN } } },
        authorization: {
          status: { in: ["ACTIVE", "SUCCESS", "FAILED"] },
          appRating: { applicationDoc: { eventUser: { eventId } } }
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
                practicalLicense: { select: { id: true, file: true, expiredDate: true } },
                rating: { select: { rating: true } },
                applicationDoc: {
                  select: {
                    number: true,
                    user: { select: { name: true } },
                    eventUser: { select: { event: { select: { event: true, forExpiredDate: true } } } }
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
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files.find((item) => item.fieldname === 'evaluationFile') || null;
    const licenseFile = files.find((item) => item.fieldname === 'licenseFile') || null;
    const practicalTestId = Number(id);
    const numericScore = Number(score);

    if (!Number.isInteger(practicalTestId) || practicalTestId <= 0) {
      return res.status(400).json({ message: "A valid practical test ID is required." });
    }
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 100) {
      return res.status(400).json({ message: "Score must be an integer between 1 and 100." });
    }
    if (files.length > 2 || files.some((item) => !['evaluationFile', 'licenseFile'].includes(item.fieldname)) ||
        files.filter((item) => item.fieldname === 'evaluationFile').length > 1 ||
        files.filter((item) => item.fieldname === 'licenseFile').length > 1 ||
        files.some((item) => !isPdfUpload(item))) {
      return res.status(400).json({ message: "Provide at most one PDF evaluation sheet and one PDF license." });
    }

    const existingPractialTest = await prisma.practicalTest.findFirst({
      where: {
        id: practicalTestId,
        deletedAt: null
      },
      select: {
        score: true,
        file: true,
        appRatingId: true,
        groupMember: { select: { member: true, group: { select: { pic: true } } } },
        checkerGroup: { select: { checker: true } },
        appRating: {
          select: {
            statusId: true,
            ratingId: true,
            practicalLicenseId: true,
            finalScores: {
              where: {
                deletedAt: null,
                isInvalidated: false
              },
              orderBy: { id: "desc" },
              take: 1,
              select: { id: true, statusId: true }
            },
            applicationDoc: {
              select: {
                userNik: true,
                eventUser: {
                  select: {
                    event: {
                      select: {
                        id: true,
                        event: true,
                        practicalPassingGrade: true,
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
    if (existingPractialTest.groupMember?.group?.pic !== req.user.nik ||
        existingPractialTest.groupMember.member !== existingPractialTest.appRating.applicationDoc?.userNik) {
      return res.status(403).json({ message: "Only this member's assigned PIC may update the practical exam." });
    }

    const event = existingPractialTest.appRating.applicationDoc?.eventUser?.event;
    if (!event || (!event.isPractical && !event.isSimulator)) {
      return res.status(409).json({ message: "This event does not require a practical examination." });
    }
    if (!event.forExpiredDate) {
      return res.status(409).json({ message: "Set the event expiration date before creating the examinee's license." });
    }
    if (!event.event || !existingPractialTest.appRating.applicationDoc?.userNik) {
      return res.status(409).json({ message: "The event name and examinee are required for the license record." });
    }
    if (!file && !existingPractialTest.file) {
      return res.status(400).json({ message: "An evaluation sheet PDF is required for this practical exam." });
    }
    if (!licenseFile && !existingPractialTest.appRating.practicalLicenseId) {
      return res.status(400).json({ message: "A license PDF is required for this rating." });
    }
    if (event.practicalPassingGrade == null || !Number.isFinite(Number(event.practicalPassingGrade))) {
      return res.status(409).json({ message: "The event passing grade is not configured." });
    }
    const confirmsFailingScore = req.body?.confirmBelowPassingGrade === true
      || req.body?.confirmBelowPassingGrade === "true";
    if (numericScore < Number(event.practicalPassingGrade) && !confirmsFailingScore) {
      return res.status(400).json({
        message: `Score ${numericScore} is below the practical passing grade of ${event.practicalPassingGrade}. Explicit confirmation is required.`
      });
    }

    const waitingPracticalStatus = await prisma.status.findFirst({
      where: { status: "WAITING PRACTICAL", deletedAt: null },
      select: { id: true }
    });
    if (!waitingPracticalStatus) {
      return res.status(500).json({ message: "WAITING PRACTICAL status is not configured." });
    }

    const activeTheoryResult = existingPractialTest.appRating.finalScores?.[0];
    const isInitialPracticalInput = existingPractialTest.score == null;
    if (
      isInitialPracticalInput
      && (
        existingPractialTest.appRating.statusId !== waitingPracticalStatus.id
        || activeTheoryResult?.statusId !== waitingPracticalStatus.id
      )
    ) {
      return res.status(409).json({
        message: "The theory examination must be passed before entering a practical exam score."
      });
    }

    const putPrac = { score: numericScore }
    if(file){
      putPrac.file = `/uploads/practicalTest/${file.filename}`
    }

    const result = await prisma.$transaction(async (tx) => {
      if (licenseFile) {
        const license = await tx.license.create({ data: {
          userNik: existingPractialTest.appRating.applicationDoc?.userNik,
          note: event.event,
          expiredDate: event.forExpiredDate,
          file: `/uploads/license/${licenseFile.filename}`,
        } });
        await tx.appRating.update({ where: { id: existingPractialTest.appRatingId },
          data: { practicalLicenseId: license.id } });
      }
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

      if (existingPractialTest.score != null && Number(existingPractialTest.score) !== numericScore) {
        await revokeCertificatesForFinalScore(tx, finalScore.id, "Practical score was changed");
      }

      const allCompleted = appRating.practicalTests.length > 0
        && appRating.practicalTests.every((test) => test.score != null);
      const allPassed = allCompleted
        && appRating.practicalTests.every((test) => Number(test.score) >= Number(event.practicalPassingGrade));
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
        await issueCertificate(tx, finalScore.id);
      } else {
        await revokeCertificatesForFinalScore(tx, finalScore.id, "Practical result no longer passes");
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

const safeReviewHtml = (value) => sanitizeHtml(String(value || ""), {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "s", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2"],
  allowedAttributes: {},
});

const getTheoryReview = async (req, res) => {
  try {
    const appRatingId = Number(req.params.appRatingId);
    if (!Number.isInteger(appRatingId) || appRatingId < 1) return res.status(400).json({ message: "Invalid rating ID." });
    const score = await prisma.finalScore.findFirst({
      where: { appRatingId, deletedAt: null, isInvalidated: false },
      orderBy: { id: "desc" },
      select: {
        id: true, finalScore: true,
        status: { select: { status: true } },
        event: { select: { event: true, passingGrade: true, isPractical: true, isSimulator: true, sector: { select: { branchUnitId: true } } } },
        groupMember: { select: { group: { select: { pic: true, checkerGroups: { where: { checker: req.user.nik, deletedAt: null }, select: { id: true } } } } } },
        appRating: { select: { rating: { select: { rating: true } }, applicationDoc: { select: { number: true, user: { select: { name: true } } } } } },
        theorySessionParticipant: { select: { questionSnapshot: true } },
        essayCorrections: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: { essayId: true, answer: true, essay: { select: { question: true, image: true } } } },
        multipleChoiceCorrections: { where: { deletedAt: null, isTrue: false }, orderBy: { id: "asc" }, select: { multipleChoiceId: true, answer: true, multipleChoice: { select: { question: true, image: true, a: true, b: true, c: true, d: true } } } },
      },
    });
    if (!score || (score.groupMember?.group?.pic !== req.user.nik && !score.groupMember?.group?.checkerGroups?.length) ||
        (req.user.branchUnitId && score.event?.sector?.branchUnitId !== req.user.branchUnitId)) {
      return res.status(404).json({ message: "Theory result not found for this checker." });
    }
    if (!score.event || (!score.event.isPractical && !score.event.isSimulator) ||
        score.status?.status === "CHECKING ESSAY" || Number(score.finalScore) < Number(score.event.passingGrade)) {
      return res.status(409).json({ message: "This rating has not passed theory examination for practical review." });
    }
    const snapshot = score.theorySessionParticipant?.questionSnapshot;
    const snapshotEssays = new Map((snapshot?.essay || []).flatMap((group) => group.questions || []).map((question) => [question.id, question]));
    const snapshotMultipleChoice = new Map((snapshot?.multipleChoice || []).flatMap((group) => group.questions || []).map((question) => [question.id, question]));
    res.json({
      finalScoreId: score.id,
      event: score.event.event || null,
      reviewedBy: { name: req.user.name || req.user.nik, nik: req.user.nik },
      applicationNumber: score.appRating?.applicationDoc?.number || null,
      name: score.appRating?.applicationDoc?.user?.name || null,
      rating: score.appRating?.rating?.rating || null,
      incorrectMultipleChoice: score.multipleChoiceCorrections.map((item) => {
        const question = snapshotMultipleChoice.get(item.multipleChoiceId) || item.multipleChoice;
        const answerKey = String(item.answer || "").toLowerCase();
        return {
          id: item.multipleChoiceId,
          question: safeReviewHtml(question?.question),
          image: question?.image || null,
          selectedAnswer: ["a", "b", "c", "d"].includes(answerKey) ? safeReviewHtml(question?.[answerKey]) : null,
        };
      }),
      essay: score.essayCorrections.map((item) => {
        const question = snapshotEssays.get(item.essayId) || item.essay;
        return { id: item.essayId, question: safeReviewHtml(question?.question), image: question?.image || null, answer: safeReviewHtml(item.answer) };
      }),
    });
  } catch (error) {
    console.error("Theory review failed", error);
    res.status(500).json({ message: "Unable to load theory review." });
  }
};

const putPracticalRecheck = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const score = Number(req.body?.score);
    const files = Array.isArray(req.files) ? req.files : [];
    const file = files.find((item) => item.fieldname === 'evaluationFile') || null;
    const licenseFile = files.find((item) => item.fieldname === 'licenseFile') || null;
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(score) || score < 1 || score > 100) {
      return res.status(400).json({ message: "A valid recheck and score from 1 to 100 are required." });
    }
    if (files.length > 2 || files.some((item) => !['evaluationFile', 'licenseFile'].includes(item.fieldname)) ||
        files.filter((item) => item.fieldname === 'evaluationFile').length > 1 ||
        files.filter((item) => item.fieldname === 'licenseFile').length > 1 ||
        files.some((item) => !isPdfUpload(item))) {
      return res.status(400).json({ message: "Provide at most one PDF evaluation sheet and one PDF license." });
    }

    const attempt = await prisma.practicalRecheckAttempt.findFirst({
      where: {
        id,
        authorization: { status: { in: ["ACTIVE", "SUCCESS", "FAILED"] } },
        practicalTest: { groupMember: { group: { pic: req.user.nik } } }
      },
      select: {
        id: true,
        score: true,
        file: true,
        practicalTest: { select: { groupMember: { select: { member: true } } } },
        authorizationId: true,
        authorization: {
          select: {
            status: true,
            passingGrade: true,
            appRatingId: true,
            appRating: {
              select: {
                ratingId: true,
                practicalLicenseId: true,
                applicationDoc: {
                  select: {
                    userNik: true,
                    eventUser: { select: { event: { select: { id: true, event: true, forExpiredDate: true } } } }
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
    if (!attempt || attempt.practicalTest?.groupMember?.member !== attempt.authorization.appRating.applicationDoc?.userNik) {
      return res.status(404).json({ message: "Practical recheck was not found or is not assigned to your PIC group." });
    }

    const event = attempt.authorization.appRating.applicationDoc?.eventUser?.event;
    if (!event?.forExpiredDate) return res.status(409).json({ message: "Set the event expiration date before creating the examinee's license." });
    if (!event.event || !attempt.authorization.appRating.applicationDoc?.userNik) {
      return res.status(409).json({ message: "The event name and examinee are required for the license record." });
    }
    if (!file && !attempt.file) return res.status(400).json({ message: "An evaluation sheet PDF is required for this recheck." });
    if (!licenseFile && !attempt.authorization.appRating.practicalLicenseId) {
      return res.status(400).json({ message: "A license PDF is required for this rating." });
    }

    const saveRatingLicense = async (tx) => {
      if (!licenseFile) return;
      const license = await tx.license.create({ data: {
        userNik: attempt.authorization.appRating.applicationDoc?.userNik,
        note: event.event,
        expiredDate: event.forExpiredDate,
        file: `/uploads/license/${licenseFile.filename}`,
      } });
      await tx.appRating.update({ where: { id: attempt.authorization.appRatingId }, data: { practicalLicenseId: license.id } });
    };

    const passingGrade = Number(attempt.authorization.passingGrade);
    const storedFile = file ? `/uploads/practicalTest/${file.filename}` : attempt.file;

    if (attempt.authorization.status !== "ACTIVE") {
      if (Number(attempt.score) !== score) {
        return res.status(409).json({ message: "Completed practical recheck score cannot be changed. Only the PDF file can be updated." });
      }

      await prisma.$transaction(async (tx) => {
        await saveRatingLicense(tx);
        await tx.practicalRecheckAttempt.update({ where: { id }, data: { file: storedFile } });
      });

      if (file && attempt.file) {
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
    if (!finalScore || !event) return res.status(409).json({ message: "The related examination result is unavailable." });

    const result = await prisma.$transaction(async (tx) => {
      await saveRatingLicense(tx);
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
        await issueCertificate(tx, finalScore.id);
      }
      return { allCompleted: true, allPassed, overallStatus: allPassed ? "SUCCESS" : "FAILED" };
    });

    if (file && attempt.file) {
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
    if (await licenseAlreadySent(practicalResult.practicalTest.appRating.id, practicalResult.payload.file.fileName)) {
      return res.status(409).json({ success: false, message: 'This rating license has already been sent to e-chain.' });
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
    if (await licenseAlreadySent(recheckResult.attempt.authorization.appRating.id, recheckResult.payload.file.fileName)) {
      return res.status(409).json({ success: false, message: 'This rating license has already been sent to e-chain.' });
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

export {getPractical, getTheoryReview, putPractical, putPracticalRecheck, getPracticalExamEchainPayload, getPracticalRecheckEchainPayload, sendPracticalExamToEchain, sendPracticalRecheckToEchain, buildPracticalExamEchainPayload, buildPracticalRecheckEchainPayload};
