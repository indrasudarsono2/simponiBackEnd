import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { ROLES } from "../middleware/authorize.js";
import sanitizeHtml from "sanitize-html";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createEvidenceZip } from "../services/evidenceZip.js";
import { createTheoryEvidencePdf } from "../services/theoryEvidencePdf.js";
import { revokeCertificatesForFinalScore } from "../services/certificate.js";

const normalizeRole = (role) => String(role || "").trim().toUpperCase();
const hasRole = (req, role) => (req.user?.roleNames || []).map(normalizeRole).includes(role);
const safeTheoryHtml = (value) => sanitizeHtml(String(value || ""), {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "s", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2"],
  allowedAttributes: {},
});
const uploadsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../uploads");

const readEvidenceFile = async (storedPath) => {
  if (typeof storedPath !== "string" || !storedPath.startsWith("/uploads/")) return { reason: "No locally stored file is linked." };
  const relative = storedPath.slice("/uploads/".length).replaceAll("\\", "/");
  if (!relative || relative.split("/").some((segment) => !segment || segment === "." || segment === "..")) return { reason: "Invalid stored file path." };
  const absolute = path.resolve(uploadsRoot, relative);
  if (!absolute.startsWith(`${uploadsRoot}${path.sep}`)) return { reason: "Invalid stored file path." };
  try {
    const resolved = await realpath(absolute);
    const root = await realpath(uploadsRoot);
    if (!resolved.startsWith(`${root}${path.sep}`)) return { reason: "Invalid stored file path." };
    const details = await stat(resolved);
    if (!details.isFile() || details.size > 64 * 1024 * 1024) return { reason: "File is unavailable or exceeds 64 MB." };
    return { data: await readFile(resolved), extension: path.extname(resolved).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12) || ".bin" };
  } catch {
    return { reason: "Linked file is missing from server storage." };
  }
};

const buildTheoryEvidenceData = (score, appRating, event, imageNameByPath) => {
  const snapshot = score.theorySessionParticipant?.questionSnapshot;
  const snapshotMc = new Map((snapshot?.multipleChoice || []).flatMap((group) => group.questions || []).map((item) => [item.id, item]));
  const snapshotEssay = new Map((snapshot?.essay || []).flatMap((group) => group.questions || []).map((item) => [item.id, item]));
  const scoreText = (value) => value == null ? "Not scored" : Number(value).toFixed(2);
  const multipleChoice = score.multipleChoiceCorrections.map((correction) => {
    const question = snapshotMc.get(correction.multipleChoiceId) || correction.multipleChoice;
    const keys = ["A", "B", "C", "D"];
    const order = question?.optionOrder;
    const displayOrder = Array.isArray(order) && order.length === 4 && new Set(order).size === 4 && order.every((key) => keys.includes(key)) ? order : keys;
    const selected = String(correction.answer || "").toUpperCase();
    return { question: safeTheoryHtml(question?.question), imageName: question?.image ? imageNameByPath.get(question.image) : null,
      options: displayOrder.map((key, slot) => ({ label: keys[slot], text: safeTheoryHtml(question?.[key.toLowerCase()]), selected: selected === key })),
      answered: keys.includes(selected) };
  });
  const essay = score.essayCorrections.map((correction) => {
    const question = snapshotEssay.get(correction.essayId) || correction.essay;
    return { question: safeTheoryHtml(question?.question), imageName: question?.image ? imageNameByPath.get(question.image) : null,
      answer: safeTheoryHtml(correction.answer), score: correction.score,
      checkerName: correction.checker ? correction.checkerUser?.name || correction.checker : null };
  });
  return { metadata: {
    Application: appRating.applicationDoc.number,
    Candidate: appRating.applicationDoc.user?.name,
    Event: event?.event || "Historical event not linked",
    Rating: appRating.rating?.rating,
    "Result ID": score.id,
    "Final theory score": scoreText(score.finalScore),
    "Multiple Choice score": scoreText(score.multipleChoiceScore),
    "Essay score": scoreText(score.essayScore),
  }, multipleChoice, essay };
};

const getTheoryExaminationReview = async (req, res) => {
  try {
    const appRatingId = Number(req.params.appRatingId);
    if (!Number.isInteger(appRatingId) || appRatingId < 1) return res.status(400).json({ message: "Invalid rating ID." });
    const finalScoreId = req.query?.finalScoreId == null ? null : Number(req.query.finalScoreId);
    if (finalScoreId != null && (!Number.isInteger(finalScoreId) || finalScoreId < 1)) return res.status(400).json({ message: "Invalid theory result ID." });
    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null, applicationDoc: { deletedAt: null } },
      select: {
        id: true,
        rating: { select: { rating: true } },
        applicationDoc: { select: {
          number: true,
          user: { select: { name: true } },
          eventUser: { select: { event: { select: { id: true, event: true, sector: { select: { branchUnitId: true } } } } } },
        } },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false, ...(finalScoreId && { id: finalScoreId }) },
          orderBy: { id: "desc" }, take: 1,
          select: {
            id: true, eventId: true, createdAt: true,
            finalScore: true, multipleChoiceScore: true, essayScore: true,
            theorySessionParticipant: { select: { questionSnapshot: true } },
            multipleChoiceCorrections: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: {
              multipleChoiceId: true, answer: true,
              multipleChoice: { select: { question: true, image: true, a: true, b: true, c: true, d: true } },
            } },
            essayCorrections: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: {
              essayId: true, answer: true, score: true, checker: true,
              checkerUser: { select: { name: true } },
              essay: { select: { question: true, image: true } },
            } },
          },
        },
      },
    });
    const event = appRating?.applicationDoc?.eventUser?.event;
    if (!appRating || (!event && !hasRole(req, ROLES.GENERAL_ADMIN)) || (hasRole(req, ROLES.CHECKER_ADMIN) && !hasRole(req, ROLES.GENERAL_ADMIN) && Number(event?.sector?.branchUnitId) !== Number(req.user.branchUnitId))) {
      return res.status(404).json({ message: "Theory examination was not found in your scope." });
    }
    const result = appRating.finalScores[0];
    if (!result || (event && result.eventId != null && result.eventId !== event.id)) return res.status(404).json({ message: "No theory examination result is available for this rating." });
    const snapshot = result.theorySessionParticipant?.questionSnapshot;
    const snapshotMc = new Map((snapshot?.multipleChoice || []).flatMap((group) => group.questions || []).map((item) => [item.id, item]));
    const snapshotEssay = new Map((snapshot?.essay || []).flatMap((group) => group.questions || []).map((item) => [item.id, item]));
    res.json({
      finalScoreId: result.id,
      finalScore: result.finalScore,
      multipleChoiceScore: result.multipleChoiceScore,
      essayScore: result.essayScore,
      applicationNumber: appRating.applicationDoc?.number || null,
      name: appRating.applicationDoc?.user?.name || null,
      event: event?.event || null,
      rating: appRating.rating?.rating || null,
      multipleChoice: result.multipleChoiceCorrections.map((correction) => {
        const question = snapshotMc.get(correction.multipleChoiceId) || correction.multipleChoice;
        const sourceKeys = ["A", "B", "C", "D"];
        const savedOrder = question?.optionOrder;
        const optionOrderRecorded = Array.isArray(savedOrder) && savedOrder.length === 4 && new Set(savedOrder).size === 4 && savedOrder.every((key) => sourceKeys.includes(key));
        const displayOrder = optionOrderRecorded ? savedOrder : sourceKeys;
        const selectedKey = String(correction.answer || "").toUpperCase();
        const options = displayOrder.map((key, index) => ({
          label: sourceKeys[index], text: safeTheoryHtml(question?.[key.toLowerCase()]), selected: key === selectedKey,
        }));
        return {
          id: correction.multipleChoiceId,
          question: safeTheoryHtml(question?.question),
          image: question?.image || null,
          options,
          answered: sourceKeys.includes(selectedKey),
          optionOrderRecorded,
        };
      }),
      essay: result.essayCorrections.map((correction) => {
        const question = snapshotEssay.get(correction.essayId) || correction.essay;
        return {
          id: correction.essayId,
          question: safeTheoryHtml(question?.question),
          image: question?.image || null,
          answer: safeTheoryHtml(correction.answer),
          score: correction.score,
          checkerName: correction.checker ? correction.checkerUser?.name || correction.checker : null,
        };
      }),
    });
  } catch (error) {
    console.error("Checker theory review failed", error);
    res.status(500).json({ message: "Unable to load theory examination review." });
  }
};

const downloadRatingEvidence = async (req, res) => {
  try {
    const appRatingId = Number(req.params.appRatingId);
    if (!Number.isInteger(appRatingId) || appRatingId < 1) return res.status(400).json({ message: "Invalid rating ID." });
    const finalScoreId = req.query?.finalScoreId == null ? null : Number(req.query.finalScoreId);
    if (finalScoreId != null && (!Number.isInteger(finalScoreId) || finalScoreId < 1)) return res.status(400).json({ message: "Invalid theory result ID." });
    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null, applicationDoc: { deletedAt: null } },
      select: {
        id: true, rating: { select: { rating: true } },
        applicationDoc: { select: {
          id: true, number: true,
          user: { select: { nik: true, name: true } },
          eventUser: { select: { event: { select: { id: true, event: true, sector: { select: { branchUnitId: true } } } } } },
          ielp: { select: { id: true, file: true } },
          medex: { select: { id: true, file: true } },
          license: { select: { id: true, file: true } },
          logbook: { select: { id: true, file: true } },
        } },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false, ...(finalScoreId && { id: finalScoreId }) }, orderBy: { id: "desc" }, take: 1,
          select: {
            id: true, eventId: true, finalScore: true, multipleChoiceScore: true, essayScore: true,
            theorySessionParticipant: { select: { questionSnapshot: true } },
            multipleChoiceCorrections: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: {
              multipleChoiceId: true, answer: true,
              multipleChoice: { select: { question: true, image: true, a: true, b: true, c: true, d: true } },
            } },
            essayCorrections: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: {
              essayId: true, answer: true, score: true, checker: true,
              checkerUser: { select: { name: true } },
              essay: { select: { question: true, image: true } },
            } },
          },
        },
      },
    });
    const event = appRating?.applicationDoc?.eventUser?.event;
    if (!appRating || (!event && !hasRole(req, ROLES.GENERAL_ADMIN)) || (hasRole(req, ROLES.CHECKER_ADMIN) && !hasRole(req, ROLES.GENERAL_ADMIN) && Number(event?.sector?.branchUnitId) !== Number(req.user.branchUnitId))) {
      return res.status(404).json({ message: "Evidence is not available in your scope." });
    }
    const score = appRating.finalScores[0];
    if (!score || (event && score.eventId != null && score.eventId !== event.id)) return res.status(409).json({ message: "This rating has no theory examination result." });

    const safeFolderPart = (value) => String(value || "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\.+$/, "").slice(0, 80) || "Unknown";
    const folder = `${safeFolderPart(appRating.applicationDoc.user?.name || appRating.applicationDoc.user?.nik)}-${safeFolderPart(appRating.rating?.rating)}`;
    const entries = [];
    const linked = [
      ["ielp", appRating.applicationDoc.ielp],
      ["medex", appRating.applicationDoc.medex],
      ["logbook", appRating.applicationDoc.logbook],
      ["license", appRating.applicationDoc.license],
    ];
    for (const [label, record] of linked) {
      const file = await readEvidenceFile(record?.file);
      if (!file.data) return res.status(409).json({ message: `${label.toUpperCase()} PDF cannot be included: ${file.reason}` });
      if (file.data.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return res.status(409).json({ message: `${label.toUpperCase()} source file is not a PDF. Upload or link a PDF before downloading an all-PDF evidence bundle.` });
      }
      entries.push({ name: `${folder}/${label}.pdf`, data: file.data });
    }
    const snapshot = score.theorySessionParticipant?.questionSnapshot;
    const allQuestions = [
      ...(snapshot?.multipleChoice || []).flatMap((group) => group.questions || []),
      ...(snapshot?.essay || []).flatMap((group) => group.questions || []),
      ...score.multipleChoiceCorrections.map((item) => item.multipleChoice),
      ...score.essayCorrections.map((item) => item.essay),
    ];
    const imageNameByPath = new Map();
    const images = new Map();
    for (const question of allQuestions) {
      if (!question?.image || imageNameByPath.has(question.image)) continue;
      const file = await readEvidenceFile(question.image);
      if (!file.data) return res.status(409).json({ message: `A theory question image cannot be included: ${file.reason}` });
      const name = `Im${imageNameByPath.size + 1}`;
      imageNameByPath.set(question.image, name);
      images.set(name, file.data);
    }
    const report = createTheoryEvidencePdf({ ...buildTheoryEvidenceData(score, appRating, event, imageNameByPath), images });
    entries.push({ name: `${folder}/theory examination.pdf`, data: report });
    const archive = createEvidenceZip(entries);
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder.replace(/[^\x20-\x7e]/g, "_")}.zip"; filename*=UTF-8''${encodeURIComponent(`${folder}.zip`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(archive);
  } catch (error) {
    console.error("Evidence archive failed", error);
    if (/Unsupported (JPEG|PNG)/.test(error.message || "")) return res.status(409).json({ message: "A theory question image format cannot be embedded in PDF. Convert that image to JPEG or PNG before downloading." });
    return res.status(error.message?.includes("128 MB") ? 413 : 500).json({ message: "Unable to create the all-PDF evidence archive. Check linked files and question images, then try again." });
  }
};

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
            event: true,
            theoryMode: true,
            difficulty: true
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
        event: { select: { event: true, theoryMode: true, difficulty: true } },
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
                    deletedAt: null,
                    isInvalidated: false
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
                examinationInvalidations: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    id: true,
                    reason: true,
                    fraudCategory: true,
                    createdAt: true,
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

const getReExaminationHistory = async (req, res) => {
  try {
    if (!hasRole(req, ROLES.CHECKER_ADMIN) && !hasRole(req, ROLES.GENERAL_CHECKER)) {
      return res.status(403).json({ message: "Only CHECKER ADMIN or GENERAL CHECKER may view re-examination history." });
    }

    const appRatingId = Number(req.params?.appRatingId);
    if (!Number.isInteger(appRatingId) || appRatingId <= 0) {
      return res.status(400).json({ message: "A valid appRatingId is required." });
    }

    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        status: { select: { status: true } },
        rating: { select: { rating: true } },
        applicationDoc: {
          select: {
            number: true,
            eventUser: {
              select: {
                user: { select: { nik: true, name: true } },
                event: {
                  select: {
                    id: true,
                    event: true,
                    sector: { select: { branchUnitId: true } },
                  },
                },
              },
            },
          },
        },
        finalScores: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            statusId: true,
            essayScore: true,
            multipleChoiceScore: true,
            finalScore: true,
            isInvalidated: true,
            invalidatedAt: true,
            invalidatedBy: true,
            invalidationReason: true,
            createdAt: true,
            updatedAt: true,
            status: { select: { status: true } },
            essayCorrections: {
              select: {
                checker: true,
                checkerUser: { select: { name: true } },
              },
            },
          },
        },
        examinationInvalidations: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            finalScoreId: true,
            invalidatedBy: true,
            reason: true,
            fraudCategory: true,
            previousStatusId: true,
            previousScore: true,
            createdAt: true,
          },
        },
        examinationAttemptResets: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, attemptNumber: true, checkerNik: true, reason: true,
            previousStatusId: true, voidedFinalScoreId: true, createdAt: true },
        },
      },
    });

    if (!appRating) {
      return res.status(404).json({ message: "Examination rating was not found." });
    }

    const event = appRating.applicationDoc?.eventUser?.event;
    if (!event) {
      return res.status(409).json({ message: "The examination event could not be identified." });
    }
    if (
      hasRole(req, ROLES.CHECKER_ADMIN) &&
      Number(event.sector?.branchUnitId) !== Number(req.user.branchUnitId)
    ) {
      return res.status(403).json({ message: "This examination is outside your branch unit." });
    }

    const actorNiks = [
      ...appRating.examinationInvalidations.map((item) => item.invalidatedBy),
      ...appRating.finalScores.map((item) => item.invalidatedBy),
      ...appRating.examinationAttemptResets.map((item) => item.checkerNik),
    ].filter(Boolean);
    const actors = actorNiks.length
      ? await prisma.user.findMany({
          where: { nik: { in: [...new Set(actorNiks)] } },
          select: { nik: true, name: true },
        })
      : [];
    const actorNameByNik = new Map(actors.map((actor) => [actor.nik, actor.name]));
    const invalidationByScoreId = new Map(
      appRating.examinationInvalidations.map((item) => [item.finalScoreId, item]),
    );

    const attempts = appRating.finalScores.map((score, index) => {
      const invalidation = invalidationByScoreId.get(score.id) || null;
      const checkerMap = new Map();
      for (const correction of score.essayCorrections || []) {
        if (!correction.checker) continue;
        checkerMap.set(
          correction.checker,
          correction.checkerUser?.name || correction.checker,
        );
      }

      return {
        attemptNumber: index + 1,
        finalScoreId: score.id,
        status: score.status?.status || null,
        essayScore: score.essayScore,
        multipleChoiceScore: score.multipleChoiceScore,
        finalScore: score.finalScore,
        isInvalidated: score.isInvalidated,
        startedAt: score.createdAt,
        completedAt: score.updatedAt,
        checkers: [...checkerMap].map(([nik, name]) => ({ nik, name })),
        invalidation: invalidation
          ? {
              id: invalidation.id,
              invalidatedBy: invalidation.invalidatedBy,
              invalidatedByName:
                actorNameByNik.get(invalidation.invalidatedBy) || invalidation.invalidatedBy,
              reason: invalidation.reason,
              fraudCategory: invalidation.fraudCategory,
              previousStatusId: invalidation.previousStatusId,
              previousScore: invalidation.previousScore,
              invalidatedAt: invalidation.createdAt,
            }
          : score.isInvalidated
            ? {
                invalidatedBy: score.invalidatedBy,
                invalidatedByName:
                  actorNameByNik.get(score.invalidatedBy) || score.invalidatedBy,
                reason: score.invalidationReason,
                fraudCategory: null,
                previousStatusId: score.statusId,
                previousScore: score.finalScore,
                invalidatedAt: score.invalidatedAt,
              }
            : null,
      };
    });

    const latestInvalidation = appRating.examinationInvalidations.at(-1) || null;
    const hasAttemptAfterLatestInvalidation = latestInvalidation
      ? appRating.finalScores.some(
          (score) => new Date(score.createdAt).getTime() > new Date(latestInvalidation.createdAt).getTime(),
        )
      : false;

    return res.json({
      appRatingId: appRating.id,
      user: appRating.applicationDoc?.eventUser?.user || null,
      applicationDocument: appRating.applicationDoc?.number || null,
      event: { id: event.id, event: event.event },
      rating: appRating.rating?.rating || null,
      currentStatus: appRating.status?.status || null,
      attempts,
      checkerResets: appRating.examinationAttemptResets.map((item) => ({
        ...item, checkerName: actorNameByNik.get(item.checkerNik) || item.checkerNik,
      })),
      pendingReExamination:
        Boolean(latestInvalidation) && !hasAttemptAfterLatestInvalidation,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const invalidateExaminationAttempt = async (req, res) => {
  try {
    if (!hasRole(req, ROLES.CHECKER_ADMIN) && !hasRole(req, ROLES.GENERAL_CHECKER)) {
      return res.status(403).json({ message: "Only CHECKER ADMIN or GENERAL CHECKER may require a re-examination." });
    }

    const appRatingId = Number(req.body?.appRatingId);
    const reason = String(req.body?.reason || "").trim();
    const fraudCategory = String(req.body?.fraudCategory || "").trim() || null;

    if (!Number.isInteger(appRatingId) || appRatingId <= 0) {
      return res.status(400).json({ message: "A valid appRatingId is required." });
    }
    if (reason.length < 10 || reason.length > 2000) {
      return res.status(400).json({ message: "Reason must contain between 10 and 2000 characters." });
    }
    if (fraudCategory && fraudCategory.length > 100) {
      return res.status(400).json({ message: "Fraud category is too long." });
    }

    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null },
      select: {
        id: true,
        applicationDoc: {
          select: {
            eventUser: {
              select: {
                event: {
                  select: {
                    id: true,
                    sector: { select: { branchUnitId: true } },
                    eventQuestions: {
                      where: { deletedAt: null },
                      select: { kindOfQuestionId: true }
                    }
                  }
                }
              }
            }
          }
        },
        previews: {
          where: { deletedAt: null },
          select: { id: true },
          take: 1
        },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false },
          orderBy: { id: "desc" },
          select: { id: true, eventId: true, statusId: true, finalScore: true },
          take: 1
        }
      }
    });

    if (!appRating) return res.status(404).json({ message: "Examination rating was not found." });
    if (appRating.previews.length === 0) {
      return res.status(409).json({ message: "This examination has no evidence to support invalidation." });
    }

    const event = appRating.applicationDoc?.eventUser?.event;
    if (!event) return res.status(409).json({ message: "The examination event could not be identified." });
    if (hasRole(req, ROLES.CHECKER_ADMIN) && Number(event.sector?.branchUnitId) !== Number(req.user.branchUnitId)) {
      return res.status(403).json({ message: "This examination is outside your branch unit." });
    }

    const currentScore = appRating.finalScores[0];
    if (!currentScore) return res.status(409).json({ message: "There is no active final score to invalidate." });
    const hasEssay = event.eventQuestions.some((question) => question.kindOfQuestionId === 1);
    const retryStatusId = hasEssay ? 1 : 4;

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.finalScore.updateMany({
        where: { id: currentScore.id, appRatingId, deletedAt: null, isInvalidated: false },
        data: {
          isInvalidated: true,
          invalidatedAt: now,
          invalidatedBy: req.user.nik,
          invalidationReason: reason
        }
      });
      if (updated.count !== 1) throw new Error("This attempt has already been invalidated.");

      await tx.examinationInvalidation.create({
        data: {
          appRatingId,
          finalScoreId: currentScore.id,
          invalidatedBy: req.user.nik,
          reason,
          fraudCategory,
          previousStatusId: currentScore.statusId,
          previousScore: currentScore.finalScore
        }
      });
      await tx.userRating.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      await revokeCertificatesForFinalScore(tx, currentScore.id, "Examination attempt invalidated");
      await tx.essayCorrection.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      await tx.multipleChoiceCorrection.updateMany({
        where: { finalScoreId: currentScore.id, deletedAt: null },
        data: { deletedAt: now }
      });
      // The invalidated attempt must not carry its old question snapshot,
      // autosaved answers, or deadline into the newly authorized attempt.
      await tx.modeOneExamDraft.deleteMany({ where: { appRatingId, eventId: event.id } });
      await tx.monitorTime.deleteMany({ where: { appRatingId } });
      await tx.matsQuestionSelection.deleteMany({ where: { appRatingId, eventId: event.id } });
      await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: retryStatusId } });

      return { finalScoreId: currentScore.id };
    });

    return res.json({
      message: "The attempt was invalidated. The user may now re-execute the examination.",
      appRatingId,
      ...result
    });
  } catch (error) {
    const status = error.message === "This attempt has already been invalidated." ? 409 : 500;
    return res.status(status).json({ message: error.message });
  }
};

const getUserCheckerPractical = async (req, res) => {
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
                },
                practicalRecheckAuthorization: {
                  select: {
                    id: true,
                    status: true,
                    reason: true,
                    createdAt: true
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

const grantPracticalRecheck = async (req, res) => {
  try {
    const appRatingId = Number(req.body?.appRatingId);
    const reason = String(req.body?.reason || "").trim();
    if (!Number.isInteger(appRatingId) || appRatingId <= 0) {
      return res.status(400).json({ message: "A valid appRatingId is required." });
    }
    if (reason.length < 10 || reason.length > 2000) {
      return res.status(400).json({ message: "Reason must contain between 10 and 2000 characters." });
    }
    if (req.body?.confirmation !== "GRANT ONE PRACTICAL RECHECK") {
      return res.status(400).json({ message: "The confirmation phrase is incorrect." });
    }

    const appRating = await prisma.appRating.findFirst({
      where: { id: appRatingId, deletedAt: null },
      select: {
        id: true,
        status: { select: { status: true } },
        practicalRecheckAuthorization: { select: { id: true } },
        practicalTests: {
          where: { deletedAt: null },
          select: { id: true, score: true, checkerGroupId: true }
        },
        applicationDoc: {
          select: {
            eventUser: {
              select: {
                event: {
                  select: {
                    id: true,
                    practicalPassingGrade: true,
                    sector: { select: { branchUnitId: true } }
                  }
                }
              }
            }
          }
        },
        finalScores: {
          where: { deletedAt: null, isInvalidated: false },
          orderBy: { id: "desc" },
          take: 1,
          select: { id: true }
        }
      }
    });

    if (!appRating) return res.status(404).json({ message: "App rating was not found." });
    if (appRating.status?.status !== "FAILED") {
      return res.status(409).json({ message: "Only a failed practical examination can receive discretion." });
    }
    if (appRating.practicalRecheckAuthorization) {
      return res.status(409).json({ message: "A practical recheck has already been granted for this rating." });
    }
    const event = appRating.applicationDoc?.eventUser?.event;
    if (!event || event.practicalPassingGrade == null) {
      return res.status(409).json({ message: "The related event or passing grade is unavailable." });
    }
    if (Number(event.sector?.branchUnitId) !== Number(req.user.branchUnitId)) {
      return res.status(403).json({ message: "This examination is outside your branch unit." });
    }
    if (!appRating.practicalTests.length || appRating.practicalTests.some((test) => test.score == null)) {
      return res.status(409).json({ message: "All original practical tests must be completed before recheck discretion." });
    }
    const finalScore = appRating.finalScores[0];
    if (!finalScore) return res.status(409).json({ message: "The related final score was not found." });

    const recheckStatus = await prisma.status.findFirst({
      where: { status: "PRACTICAL RECHECK", deletedAt: null },
      select: { id: true }
    });
    if (!recheckStatus) return res.status(500).json({ message: "PRACTICAL RECHECK status is not configured." });

    const authorization = await prisma.$transaction(async (tx) => {
      const created = await tx.practicalRecheckAuthorization.create({
        data: {
          appRatingId,
          grantedBy: req.user.nik,
          reason,
          passingGrade: event.practicalPassingGrade,
          attempts: {
            create: appRating.practicalTests.map((test) => ({
              practicalTestId: test.id,
              checkerGroupId: test.checkerGroupId
            }))
          }
        },
        include: { attempts: true }
      });
      await tx.appRating.update({ where: { id: appRatingId }, data: { statusId: recheckStatus.id } });
      await tx.finalScore.update({ where: { id: finalScore.id }, data: { statusId: recheckStatus.id } });
      await tx.userRating.updateMany({
        where: { finalScoreId: finalScore.id, deletedAt: null },
        data: { deletedAt: new Date() }
      });
      await revokeCertificatesForFinalScore(tx, finalScore.id, "Practical re-examination required");
      return created;
    });

    res.status(201).json({ message: "One-time practical recheck granted for all practical tests.", authorization });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export { getUserCheckerScore, postUserCheckerScore, postUserCheckerScoreEvidance, getTheoryExaminationReview, downloadRatingEvidence, getReExaminationHistory, invalidateExaminationAttempt, getUserCheckerPractical, postUserCheckerPractical, grantPracticalRecheck };
