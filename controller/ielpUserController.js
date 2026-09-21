import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createCredentialSyncReceipt, verifyCredentialSyncReceipt } from "../utils/credentialSyncReceipt.js";
import { normalizeIelpValidity } from "../utils/ielpValidity.js";
import { appendCredentialHistory } from "../utils/credentialHistory.js";

dayjs.extend(utc);

const ECHAIN_IELP_USER_FIELDS = [
  "institution",
  "level",
  "released",
  "expired",
  "rater",
  "fileName",
  "fileUrl",
  "fileUrlExpiresAt",
  "fileMimeType",
  "fileSizeBytes",
];

const ECHAIN_IELP_USER_MOCK_DATA = {
  institution: "PPIC CURUG",
  level: "5",
  released: "2024-02-28",
  expired: "2027-02-28",
  rater: null,
  fileName: "indra-ielp-2024.pdf",
  fileUrl: null,
  fileUrlExpiresAt: null,
  fileMimeType: "application/pdf",
  fileSizeBytes: 245000,
};
const ielpReceiptData = (data) => ({
  institution: data.institution,
  level: data.level,
  released: data.released,
  expired: data.expired || null,
  fileName: data.fileName || null,
  fileUrl: data.fileUrl || null,
  fileUrlExpiresAt: data.fileUrlExpiresAt || null,
  fileMimeType: data.fileMimeType || null,
  fileSizeBytes: data.fileSizeBytes == null ? null : Number(data.fileSizeBytes),
});

const IELP_UPLOAD_DIR = path.join(process.cwd(), "uploads", "ielp");
const MAX_ECHAIN_IELP_USER_FILE_BYTES = Number(process.env.ECHAIN_IELP_USER_MAX_FILE_BYTES || 2 * 1024 * 1024);
const ALLOWED_ECHAIN_IELP_USER_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

const ECHAIN_IELP_USER_EXTENSIONS = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
]);

const verifyEchainWebhookSecret = (req) => {
  const expectedSecret = process.env.ECHAIN_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return {
      ok: false,
      status: 503,
      message: "e-chain webhook integration is not configured.",
      code: "ECHAIN_WEBHOOK_NOT_CONFIGURED",
    };
  }

  const providedSecret = req.get("X-ECHAIN-WEBHOOK-SECRET");
  if (providedSecret !== expectedSecret) {
    return {
      ok: false,
      status: 401,
      message: "Invalid e-chain webhook secret.",
      code: "ECHAIN_WEBHOOK_UNAUTHORIZED",
    };
  }

  return { ok: true };
};

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

const pickIelpUserSyncData = (data = {}) => ECHAIN_IELP_USER_FIELDS.reduce((result, field) => {
  if (Object.prototype.hasOwnProperty.call(data, field)) {
    result[field] = data[field];
  }
  return result;
}, {});

const validateIelpUserSyncData = (data = {}) => {
  const errors = [];

  if (typeof data.institution !== "string" || data.institution.trim().length < 2) {
    errors.push("institution is required and must be at least 2 characters.");
  }
  if (typeof data.level !== "string" || !data.level.trim()) errors.push("level is required.");
  if (typeof data.released !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.released)) {
    errors.push("released must use YYYY-MM-DD format.");
  }
  if (data.level === "6") {
    if (data.expired != null && data.expired !== "") errors.push("expired must be null for Level 6.");
  } else if (typeof data.expired !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.expired)) {
    errors.push("expired must use YYYY-MM-DD format for Level 4 or 5.");
  }
  if (data.rater != null && typeof data.rater !== "string") errors.push("rater must be a string or null.");
  if (data.fileName != null && typeof data.fileName !== "string") errors.push("fileName must be a string or null.");

  if (data.fileUrl != null) {
    if (typeof data.fileUrl !== "string") {
      errors.push("fileUrl must be a string or null.");
    } else {
      try {
        const url = new URL(data.fileUrl);
        if (!["http:", "https:"].includes(url.protocol)) errors.push("fileUrl must use HTTP or HTTPS.");
      } catch {
        errors.push("fileUrl must be a valid URL.");
      }
    }
  }

  if (data.fileMimeType != null && typeof data.fileMimeType !== "string") errors.push("fileMimeType must be a string or null.");
  if (data.fileSizeBytes != null && (!Number.isInteger(Number(data.fileSizeBytes)) || Number(data.fileSizeBytes) < 0)) {
    errors.push("fileSizeBytes must be a positive integer or null.");
  }

  return errors;
};

const validateIelpWebhookPayload = (payload = {}) => {
  const errors = [];

  if (typeof payload.eventId !== "string" || !payload.eventId.trim()) errors.push("eventId is required.");
  if (payload.eventType !== "IELP_VERIFIED") errors.push("eventType must be IELP_VERIFIED.");
  if (typeof payload.occurredAt !== "string" || Number.isNaN(Date.parse(payload.occurredAt))) {
    errors.push("occurredAt must be a valid ISO date-time string.");
  }
  if (typeof payload.nik !== "string" || !payload.nik.trim()) errors.push("nik is required.");
  if (typeof payload.data !== "object" || payload.data == null) errors.push("data object is required.");

  if (payload.data && typeof payload.data === "object") {
    errors.push(...validateIelpUserSyncData(payload.data));
  }

  return errors;
};

const getExtensionForIelpUserFile = (fileName, mimeType) => {
  const originalExtension = path.extname(fileName || "").toLowerCase();
  if ([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"].includes(originalExtension)) return originalExtension;
  return ECHAIN_IELP_USER_EXTENSIONS.get(mimeType) || ".pdf";
};

const downloadEchainIelpUserFile = async ({ fileUrl, fileName, fileMimeType }) => {
  if (!fileUrl) return null;

  const response = await fetch(fileUrl, {
    method: "GET",
    headers: buildEchainHeaders(),
  });

  if (!response.ok) throw new Error(`e-chain file download failed with HTTP ${response.status}.`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || fileMimeType || "";
  if (contentType && !ALLOWED_ECHAIN_IELP_USER_MIME_TYPES.has(contentType)) {
    throw new Error(`Unsupported e-chain IELP file type: ${contentType}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ECHAIN_IELP_USER_FILE_BYTES) throw new Error("e-chain IELP file exceeds maximum allowed size.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ECHAIN_IELP_USER_FILE_BYTES) throw new Error("e-chain IELP file exceeds maximum allowed size.");

  fs.mkdirSync(IELP_UPLOAD_DIR, { recursive: true });

  const extension = getExtensionForIelpUserFile(fileName, contentType);
  const filename = `ielp-echain-${Date.now()}-${randomUUID()}${extension}`;
  const destination = path.join(IELP_UPLOAD_DIR, filename);
  fs.writeFileSync(destination, buffer);

  return {
    filename,
    originalname: fileName || filename,
    mimetype: contentType || fileMimeType || "application/octet-stream",
    size: buffer.length,
    url: `/uploads/ielp/${filename}`,
  };
};

const getIelpUser = async (req, res) => {
  try {
    const ielp = await prisma.ielp.findMany({
      where: {
        deletedAt: null,
        userNik: req.user.nik
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        requestedChecker: { select: { nik: true, name: true } },
        verifiedBy: { select: { nik: true, name: true } },
      }
    })

    res.json(ielp);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const syncIelpUserFromEchain = async (req, res) => {
  if (process.env.ECHAIN_MOCK_MODE === "true") {
    return res.json({
      success: true,
      message: "IELP data found from e-chain mock mode",
      data: ECHAIN_IELP_USER_MOCK_DATA,
      syncReceipt: createCredentialSyncReceipt({ type: "IELP", nik: req.user.nik, data: ielpReceiptData(ECHAIN_IELP_USER_MOCK_DATA) }),
    });
  }

  const baseUrl = process.env.ECHAIN_BASE_URL;
  const ielpUserPath = process.env.ECHAIN_IELP_USER_SYNC_PATH || "/api/integrations/simponi/ielp-user";

  if (!baseUrl) {
    return res.status(503).json({
      success: false,
      message: "e-chain integration is not configured.",
      error: {
        code: "ECHAIN_NOT_CONFIGURED",
        details: "Set ECHAIN_BASE_URL before using IELP user sync.",
      },
    });
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.ECHAIN_TIMEOUT_MS || 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(ielpUserPath, baseUrl);
    const payload = {
      nik: req.user.nik,
      requestedFields: ECHAIN_IELP_USER_FIELDS,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: buildEchainHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: responseBody?.message || "Failed to sync IELP data from e-chain.",
        error: responseBody?.error || {
          code: "ECHAIN_HTTP_ERROR",
          details: `e-chain responded with HTTP ${response.status}.`,
        },
      });
    }

    if (!responseBody?.success || typeof responseBody.data !== "object" || responseBody.data == null) {
      return res.status(502).json({
        success: false,
        message: "Invalid IELP sync response from e-chain.",
        error: {
          code: "ECHAIN_INVALID_RESPONSE",
          details: "Response must follow the agreed IELP user sync ICD envelope.",
        },
      });
    }

    const data = pickIelpUserSyncData(responseBody.data);
    const validationErrors = validateIelpUserSyncData(data);

    if (validationErrors.length) {
      return res.status(502).json({
        success: false,
        message: "Invalid IELP data from e-chain.",
        error: {
          code: "ECHAIN_IELP_VALIDATION_FAILED",
          details: validationErrors,
        },
      });
    }

    return res.json({
      success: true,
      message: responseBody.message || "IELP data found",
      data,
      syncReceipt: createCredentialSyncReceipt({ type: "IELP", nik: req.user.nik, data: ielpReceiptData(data) }),
    });
  } catch (error) {
    const isTimeout = error.name === "AbortError";

    return res.status(isTimeout ? 504 : 502).json({
      success: false,
      message: isTimeout ? "e-chain IELP sync timed out." : "Failed to sync IELP data from e-chain.",
      error: {
        code: isTimeout ? "ECHAIN_TIMEOUT" : "ECHAIN_REQUEST_FAILED",
        details: error.message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const receiveIelpUserVerifiedFromEchain = async (req, res) => {
  const secretCheck = verifyEchainWebhookSecret(req);
  if (!secretCheck.ok) {
    return res.status(secretCheck.status).json({
      success: false,
      message: secretCheck.message,
      error: {
        code: secretCheck.code,
      },
    });
  }

  const validationErrors = validateIelpWebhookPayload(req.body);
  if (validationErrors.length) {
    return res.status(400).json({
      success: false,
      message: "Invalid IELP verified webhook payload.",
      error: {
        code: "ECHAIN_IELP_WEBHOOK_VALIDATION_FAILED",
        details: validationErrors,
      },
    });
  }

  try {
    const { eventId, nik, occurredAt, data } = req.body;
    const user = await prisma.user.findUnique({
      where: { nik },
      select: { nik: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "SIMPONI user not found for e-chain IELP webhook.",
        error: {
          code: "SIMPONI_USER_NOT_FOUND",
          details: `No SIMPONI user found for nik ${nik}.`,
        },
      });
    }

    const validity = normalizeIelpValidity(data);
    const released = validity.released;
    const expired = validity.expired;
    const downloadedFile = data.fileUrl
      ? await downloadEchainIelpUserFile({
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileMimeType: data.fileMimeType,
        })
      : null;

    const existingIelp = await prisma.ielp.findFirst({
      where: {
        deletedAt: null,
        userNik: nik,
        institution: data.institution,
        level: data.level,
        released,
        expired,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const ielpData = {
      userNik: nik,
      isConfirmed: true,
      isCurrent: true,
      userConfirmedAt: new Date(occurredAt),
      source: "ECHAIN",
      verificationStatus: "APPROVED",
      requestedCheckerNik: null,
      verifiedByNik: null,
      verifiedAt: new Date(occurredAt),
      verificationNote: "Verified by e-chain",
      institution: data.institution,
      level: validity.level,
      released,
      expired,
      rater: data.rater,
    };

    if (downloadedFile) {
      ielpData.file = downloadedFile.url;
    }

    let ielp = existingIelp
      ? await prisma.ielp.update({
          where: { id: existingIelp.id },
          data: ielpData,
        })
      : await prisma.ielp.create({
          data: ielpData,
        });
    if (!ielp.rootVersionId) {
      ielp = await prisma.ielp.update({ where: { id: ielp.id }, data: { rootVersionId: ielp.id } });
    }
    await appendCredentialHistory(prisma, {
      type: "IELP", record: ielp, eventType: "ECHAIN_SYNCED", actorNik: nik,
      note: existingIelp ? "Verified IELP data refreshed by e-chain." : "Verified IELP data received from e-chain.",
    });
    await appendCredentialHistory(prisma, { type: "IELP", record: ielp, eventType: "APPROVED", actorNik: nik, note: "Verified by e-chain" });

    return res.status(existingIelp ? 200 : 201).json({
      success: true,
      message: existingIelp ? "IELP webhook processed; existing SIMPONI record updated." : "IELP webhook processed; SIMPONI record created.",
      data: {
        eventId,
        action: existingIelp ? "updated" : "created",
        nik,
        ielpId: ielp.id,
        fileStored: Boolean(downloadedFile),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process e-chain IELP verified webhook.",
      error: {
        code: "ECHAIN_IELP_WEBHOOK_PROCESSING_FAILED",
        details: error.message,
      },
    });
  }
};

const addIelpUser = async (req, res) => {
  try {
    const {institution, level, released, expired, rater, echainFileUrl, echainFileName, echainFileMimeType, source, requestedCheckerNik, syncReceipt} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    const downloadedFile = !file && echainFileUrl
      ? await downloadEchainIelpUserFile({
          fileUrl: echainFileUrl,
          fileName: echainFileName,
          fileMimeType: echainFileMimeType,
        })
      : null;
    
    const receiptData = ielpReceiptData({ institution, level, released, expired, fileName: echainFileName, fileUrl: echainFileUrl, fileUrlExpiresAt: req.body.echainFileUrlExpiresAt, fileMimeType: echainFileMimeType, fileSizeBytes: req.body.echainFileSizeBytes });
    const isEchain = source === "ECHAIN" && req.user.authenticationType !== "LOCAL" && verifyCredentialSyncReceipt({ receipt: syncReceipt, type: "IELP", nik: req.user.nik, data: receiptData });
    if (source === "ECHAIN" && !isEchain) return res.status(400).json({ message: "The e-chain synchronization receipt is invalid or expired. Please sync again." });
    if (!isEchain && !requestedCheckerNik) {
      return res.status(400).json({ message: "Please select a checker for manual IELP verification." });
    }
    if (!isEchain && requestedCheckerNik === req.user.nik) {
      return res.status(400).json({ message: "You cannot select yourself to verify your own IELP record." });
    }
    if (!isEchain) {
      const checker = await prisma.user.findFirst({
        where: {
          nik: requestedCheckerNik,
          deletedAt: null,
          userRoles: { some: { deletedAt: null, roles: { deletedAt: null, role: "CHECKER" } } },
        },
        select: { nik: true },
      });
      if (!checker) return res.status(400).json({ message: "Selected checker is not eligible." });
    }

    const validity = normalizeIelpValidity({ level, released });
    const now = new Date();
    const ielp = await prisma.$transaction(async (tx) => {
      const created = await tx.ielp.create({ data: {
        userNik: req.user.nik,
        isConfirmed: isEchain,
        isCurrent: isEchain,
        userConfirmedAt: now,
        source: isEchain ? "ECHAIN" : "MANUAL",
        verificationStatus: isEchain ? "APPROVED" : "PENDING",
        requestedCheckerNik: isEchain ? null : requestedCheckerNik,
        verifiedAt: isEchain ? now : null,
        verificationNote: isEchain ? "Verified by e-chain" : null,
        institution,
        level: validity.level,
        released: validity.released,
        expired: validity.expired,
        rater,      
        file: file ? `/uploads/ielp/${file.filename}` : downloadedFile?.url || null,
      }});
      const rooted = await tx.ielp.update({ where: { id: created.id }, data: { rootVersionId: created.id } });
      await appendCredentialHistory(tx, { type: "IELP", record: rooted, eventType: isEchain ? "ECHAIN_SYNCED" : "CREATED", actorNik: req.user.nik, checkerNik: requestedCheckerNik || null });
      await appendCredentialHistory(tx, { type: "IELP", record: rooted, eventType: "PERSONALLY_CONFIRMED", actorNik: req.user.nik });
      if (isEchain) {
        await appendCredentialHistory(tx, { type: "IELP", record: rooted, eventType: "APPROVED", actorNik: req.user.nik, note: "Verified by e-chain" });
      } else {
        await appendCredentialHistory(tx, { type: "IELP", record: rooted, eventType: "CHECKER_ASSIGNED", actorNik: req.user.nik, checkerNik: requestedCheckerNik });
        await appendCredentialHistory(tx, { type: "IELP", record: rooted, eventType: "SUBMITTED_FOR_VERIFICATION", actorNik: req.user.nik, checkerNik: requestedCheckerNik });
      }
      return rooted;
    });
    const savedFiles = file
      ? files.map(f => ({
          filename: f.filename,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          url: `/uploads/ielp/${f.filename}`
        }))
      : downloadedFile ? [downloadedFile] : null;

    res.status(200).json({ 
      success: true, 
      ielp,
      files: savedFiles
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getIelpById = async (req, res) => {
  try {
    const { id } = req.params;
    const {institution, level, released, expired, rater, requestedCheckerNik} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingIelp = await prisma.ielp.findFirst({
      where: { id: parseInt(id), userNik: req.user.nik, deletedAt: null },
    })
    if (!existingIelp) return res.status(404).json({ message: "IELP record was not found." });
    if (existingIelp?.source === "ECHAIN") {
      return res.status(409).json({ message: "e-chain IELP records cannot be edited manually. Sync a new record instead." });
    }
    const revisionCheckerNik = requestedCheckerNik || existingIelp.requestedCheckerNik || existingIelp.verifiedByNik;
    if (!revisionCheckerNik || revisionCheckerNik === req.user.nik) {
      return res.status(400).json({ message: "Please select another checker to verify this IELP revision." });
    }
    const checker = await prisma.user.findFirst({
      where: { nik: revisionCheckerNik, deletedAt: null, userRoles: { some: { deletedAt: null, roles: { deletedAt: null, role: "CHECKER" } } } },
      select: { nik: true },
    });
    if (!checker) return res.status(400).json({ message: "Selected checker is not eligible." });

    const validity = normalizeIelpValidity({ level, released });
    const revisionData = {
      userNik: req.user.nik,
      isConfirmed: false,
      isCurrent: false,
      rootVersionId: existingIelp.rootVersionId || existingIelp.id,
      previousVersionId: existingIelp.id,
      version: (existingIelp.version || 1) + 1,
      userConfirmedAt: new Date(),
      source: "MANUAL",
      verificationStatus: "PENDING",
      verifiedByNik: null,
      verifiedAt: null,
      verificationNote: null,
      institution,
      ...validity,
      rater,
      requestedCheckerNik: revisionCheckerNik,
      file: file ? `/uploads/ielp/${file.filename}` : existingIelp.file,
    }
    const revision = await prisma.$transaction(async (tx) => {
      const created = await tx.ielp.create({ data: revisionData });
      await appendCredentialHistory(tx, { type: "IELP", record: created, eventType: "REVISION_STARTED", actorNik: req.user.nik, checkerNik: created.requestedCheckerNik, previous: existingIelp });
      await appendCredentialHistory(tx, { type: "IELP", record: created, eventType: "PERSONALLY_CONFIRMED", actorNik: req.user.nik });
      await appendCredentialHistory(tx, { type: "IELP", record: created, eventType: "REVISION_SUBMITTED", actorNik: req.user.nik, checkerNik: created.requestedCheckerNik, previous: existingIelp });
      return created;
    });

    res.status(201).json({ success: true, revision }); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteIelpById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
    const record = await prisma.ielp.findFirst({ where: { id: parseInt(id), userNik: req.user.nik, deletedAt: null } });
    if (!record) return res.status(404).json({ message: "IELP record was not found." });
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.ielp.update({ where: { id: record.id }, data: { deletedAt: now, isCurrent: false } });
      await appendCredentialHistory(tx, { type: "IELP", record: deleted, eventType: "DELETED", actorNik: req.user.nik, note: "Credential removed by its owner." });
    });
    res.status(201).json({ success: true,});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
};

export { getIelpUser, syncIelpUserFromEchain, receiveIelpUserVerifiedFromEchain, addIelpUser, getIelpById, deleteIelpById};
