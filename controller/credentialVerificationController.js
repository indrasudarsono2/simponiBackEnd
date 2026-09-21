import prisma from "../lib/prisma.js";
import { appendCredentialHistory } from "../utils/credentialHistory.js";
import path from "node:path";
import { createSignedFileUrl } from "../middleware/privateFiles.js";

const CHECKER_ROLES = new Set(["CHECKER"]);

const isChecker = (req) =>
  (req.user?.roleNames || []).some((role) => CHECKER_ROLES.has(String(role).trim().toUpperCase()));

const credentialModel = (type) => {
  if (type === "ielp") return prisma.ielp;
  if (type === "medex") return prisma.medex;
  return null;
};

const buildEchainHeaders = () => {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.ECHAIN_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.ECHAIN_BEARER_TOKEN}`;
  if (process.env.ECHAIN_API_KEY) headers["X-API-Key"] = process.env.ECHAIN_API_KEY;
  return headers;
};

const getRequestOrigin = (req) => {
  if (process.env.SIMPONI_PUBLIC_BASE_URL) return process.env.SIMPONI_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${req.get("X-Forwarded-Proto") || req.protocol || "http"}://${req.get("host")}`;
};

const toDateOnly = (value) => value ? new Date(value).toISOString().slice(0, 10) : null;
const getFileName = (value = "") => value.replaceAll("\\", "/").split("/").pop() || value;
const getFileMimeType = (value = "") => {
  const extension = path.extname(value).toLowerCase();
  return ({ ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })[extension] || "application/octet-stream";
};

const buildCredentialEchainPayload = (type, record, req) => {
  const fileUrl = record.file ? createSignedFileUrl(record.file) : null;
  const common = {
    credentialId: record.id,
    nik: record.userNik,
    institution: record.institution,
    released: toDateOnly(record.released),
    expired: toDateOnly(record.expired),
    verifiedByNik: req.user.nik,
    verifiedAt: new Date().toISOString(),
    file: record.file ? {
      fileName: getFileName(record.file),
      fileUrl: `${getRequestOrigin(req)}${fileUrl}`,
      fileMimeType: getFileMimeType(record.file),
    } : null,
  };
  return type === "ielp"
    ? { ...common, level: record.level, rater: record.rater }
    : { ...common, examiner: record.examiner };
};

const sendApprovedCredentialToEchain = async (type, record, req) => {
  if (!record.file) {
    const error = new Error(`A ${type.toUpperCase()} document file is required before approval.`);
    error.status = 409;
    throw error;
  }
  const payload = buildCredentialEchainPayload(type, record, req);
  if (process.env.ECHAIN_MOCK_MODE === "true") {
    return { payload, response: { success: true, message: `${type.toUpperCase()} received by e-chain mock mode.`, data: { echainRequestId: `mock-${type}-${record.id}-${Date.now()}` } } };
  }

  const baseUrl = process.env.ECHAIN_BASE_URL;
  if (!baseUrl) {
    const error = new Error("e-chain integration is not configured. The credential was not approved.");
    error.status = 503;
    throw error;
  }
  const sendPath = type === "ielp"
    ? process.env.ECHAIN_IELP_VERIFIED_SEND_PATH || "/api/integrations/simponi/ielp-user/verified"
    : process.env.ECHAIN_MEDEX_VERIFIED_SEND_PATH || "/api/integrations/simponi/medex-user/verified";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ECHAIN_TIMEOUT_MS || 10000));
  try {
    const response = await fetch(new URL(sendPath, baseUrl), {
      method: "POST",
      headers: buildEchainHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok || responseBody?.success === false) {
      const error = new Error(responseBody?.message || `e-chain responded with HTTP ${response.status}. The credential was not approved.`);
      error.status = response.ok ? 502 : response.status;
      throw error;
    }
    return { payload, response: responseBody };
  } catch (error) {
    if (error.name === "AbortError") {
      error.message = "e-chain credential send timed out. The credential was not approved.";
      error.status = 504;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getEligibleCheckers = async (req, res) => {
  try {
    const checkers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        nik: { not: req.user.nik },
        userRoles: {
          some: {
            deletedAt: null,
            roles: {
              deletedAt: null,
              role: { in: [...CHECKER_ROLES] },
            },
          },
        },
        OR: [
          { branchUnitId: req.user.branchUnitId },
          {
            userRoles: {
              some: {
                deletedAt: null,
                roles: { deletedAt: null, role: "GENERAL CHECKER" },
              },
            },
          },
        ],
      },
      select: {
        nik: true,
        name: true,
        userRoles: {
          where: { deletedAt: null },
          select: {
            checkerRatings: {
              where: { deletedAt: null },
              select: { rating: { select: { rating: true } } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(checkers.map((checker) => ({
      nik: checker.nik,
      name: checker.name,
      ratings: [...new Set(checker.userRoles.flatMap((role) =>
        role.checkerRatings.map((item) => item.rating?.rating).filter(Boolean),
      ))],
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAssignedTasks = async (req, res) => {
  if (!isChecker(req)) return res.status(403).json({ message: "Checker role is required." });

  try {
    const commonWhere = { requestedCheckerNik: req.user.nik, source: "MANUAL", deletedAt: null };
    const include = {
      user: { select: { nik: true, name: true } },
      verifiedBy: { select: { nik: true, name: true } },
    };
    const [ielp, medex] = await Promise.all([
      prisma.ielp.findMany({ where: commonWhere, include, orderBy: { createdAt: "desc" } }),
      prisma.medex.findMany({ where: commonWhere, include, orderBy: { createdAt: "desc" } }),
    ]);

    res.json([
      ...ielp.map((item) => ({ ...item, credentialType: "IELP" })),
      ...medex.map((item) => ({ ...item, credentialType: "MEDEX" })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reviewCredential = async (req, res) => {
  if (!isChecker(req)) return res.status(403).json({ message: "Checker role is required." });

  const model = credentialModel(String(req.params.type).toLowerCase());
  const id = Number(req.params.id);
  const status = String(req.body?.status || "").toUpperCase();
  const note = String(req.body?.note || "").trim() || null;

  if (!model || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "A valid IELP or MEDEX record is required." });
  }
  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ message: "Status must be APPROVED or REJECTED." });
  }
  if (status === "REJECTED" && !note) {
    return res.status(400).json({ message: "A rejection note is required." });
  }

  try {
    const record = await model.findFirst({
      where: {
        id,
        requestedCheckerNik: req.user.nik,
        source: "MANUAL",
        verificationStatus: "PENDING",
        deletedAt: null,
      },
      select: {
        id: true, userNik: true, institution: true, released: true, expired: true,
        rootVersionId: true, previousVersionId: true, version: true,
        file: true,
        ...(String(req.params.type).toLowerCase() === "ielp"
          ? { level: true, rater: true }
          : { examiner: true }),
      },
    });
    if (!record) return res.status(404).json({ message: "Pending assigned record was not found." });
    if (record.userNik === req.user.nik) {
      return res.status(403).json({ message: "You cannot verify your own IELP or MEDEX record." });
    }

    const echain = status === "APPROVED"
      ? await sendApprovedCredentialToEchain(String(req.params.type).toLowerCase(), record, req)
      : null;

    const type = String(req.params.type).toLowerCase() === "ielp" ? "IELP" : "MEDEX";
    const modelName = type === "IELP" ? "ielp" : "medex";
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      let superseded = [];
      if (status === "APPROVED") {
        superseded = await tx[modelName].findMany({
          where: {
            rootVersionId: record.rootVersionId || record.id,
            isCurrent: true,
            deletedAt: null,
            id: { not: id },
          },
        });
        await tx[modelName].updateMany({
          where: { rootVersionId: record.rootVersionId || record.id, isCurrent: true, deletedAt: null },
          data: { isCurrent: false },
        });
      }
      const reviewed = await tx[modelName].update({
        where: { id },
        data: {
          verificationStatus: status,
          isConfirmed: status === "APPROVED",
          isCurrent: status === "APPROVED",
          verifiedByNik: req.user.nik,
          verifiedAt: now,
          verificationNote: note,
        },
      });
      await appendCredentialHistory(tx, {
        type,
        record: reviewed,
        eventType: status,
        actorNik: req.user.nik,
        checkerNik: req.user.nik,
        note,
      });
      if (status === "APPROVED" && reviewed.version > 1) {
        for (const oldVersion of superseded) {
          await appendCredentialHistory(tx, {
            type,
            record: oldVersion,
            eventType: "SUPERSEDED",
            actorNik: req.user.nik,
            checkerNik: req.user.nik,
            note: `Superseded by approved version ${reviewed.version}; this version remains available for historical application documents.`,
          });
        }
      }
      return reviewed;
    });
    res.json({
      success: true,
      message: status === "APPROVED"
        ? `${String(req.params.type).toUpperCase()} approved and sent to e-chain.`
        : `${String(req.params.type).toUpperCase()} rejected.`,
      credential: updated,
      echain: echain?.response?.data || null,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export { getEligibleCheckers, getAssignedTasks, reviewCredential };
