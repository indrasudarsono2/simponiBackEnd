import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

dayjs.extend(utc);

const ECHAIN_LICENSE_FIELDS = [
  "note",
  "licenseExpiredDate",
  "fileName",
  "fileUrl",
  "fileUrlExpiresAt",
  "fileMimeType",
  "fileSizeBytes",
];

const ECHAIN_LICENSE_MOCK_DATA = {
  note: "License 2025 SMT 1",
  licenseExpiredDate: "2025-12-31",
  fileName: "indra-license-2025-smt-1.pdf",
  fileUrl: null,
  fileUrlExpiresAt: null,
  fileMimeType: "application/pdf",
  fileSizeBytes: 245000,
};

const LICENSE_UPLOAD_DIR = path.join(process.cwd(), "uploads", "license");
const MAX_ECHAIN_LICENSE_FILE_BYTES = Number(process.env.ECHAIN_LICENSE_MAX_FILE_BYTES || 2 * 1024 * 1024);
const ALLOWED_ECHAIN_LICENSE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ECHAIN_LICENSE_EXTENSIONS = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

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

const pickLicenseSyncData = (data = {}) => ECHAIN_LICENSE_FIELDS.reduce((result, field) => {
  if (Object.prototype.hasOwnProperty.call(data, field)) {
    result[field] = data[field];
  }
  return result;
}, {});

const validateLicenseSyncData = (data = {}) => {
  const errors = [];

  if (typeof data.note !== "string" || data.note.trim().length < 2) {
    errors.push("note is required and must be at least 2 characters.");
  }

  if (typeof data.licenseExpiredDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.licenseExpiredDate)) {
    errors.push("licenseExpiredDate must use YYYY-MM-DD format.");
  }

  if (data.fileName != null && typeof data.fileName !== "string") {
    errors.push("fileName must be a string or null.");
  }

  if (data.fileUrl != null) {
    if (typeof data.fileUrl !== "string") {
      errors.push("fileUrl must be a string or null.");
    } else {
      try {
        const url = new URL(data.fileUrl);
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.push("fileUrl must use HTTP or HTTPS.");
        }
      } catch {
        errors.push("fileUrl must be a valid URL.");
      }
    }
  }

  if (data.fileMimeType != null && typeof data.fileMimeType !== "string") {
    errors.push("fileMimeType must be a string or null.");
  }

  if (data.fileSizeBytes != null && (!Number.isInteger(Number(data.fileSizeBytes)) || Number(data.fileSizeBytes) < 0)) {
    errors.push("fileSizeBytes must be a positive integer or null.");
  }

  return errors;
};

const getExtensionForLicenseFile = (fileName, mimeType) => {
  const originalExtension = path.extname(fileName || "").toLowerCase();
  if ([".pdf", ".doc", ".docx"].includes(originalExtension)) return originalExtension;
  return ECHAIN_LICENSE_EXTENSIONS.get(mimeType) || ".pdf";
};

const downloadEchainLicenseFile = async ({ fileUrl, fileName, fileMimeType }) => {
  if (!fileUrl) return null;

  const response = await fetch(fileUrl, {
    method: "GET",
    headers: buildEchainHeaders(),
  });

  if (!response.ok) {
    throw new Error(`e-chain file download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || fileMimeType || "";
  if (contentType && !ALLOWED_ECHAIN_LICENSE_MIME_TYPES.has(contentType)) {
    throw new Error(`Unsupported e-chain license file type: ${contentType}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ECHAIN_LICENSE_FILE_BYTES) {
    throw new Error("e-chain license file exceeds maximum allowed size.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ECHAIN_LICENSE_FILE_BYTES) {
    throw new Error("e-chain license file exceeds maximum allowed size.");
  }

  fs.mkdirSync(LICENSE_UPLOAD_DIR, { recursive: true });

  const extension = getExtensionForLicenseFile(fileName, contentType);
  const filename = `license-echain-${Date.now()}-${randomUUID()}${extension}`;
  const destination = path.join(LICENSE_UPLOAD_DIR, filename);
  fs.writeFileSync(destination, buffer);

  return {
    filename,
    originalname: fileName || filename,
    mimetype: contentType || fileMimeType || "application/octet-stream",
    size: buffer.length,
    url: `/uploads/license/${filename}`,
  };
};

const getLicenseUser = async (req, res) => {
  try {
    const license = await prisma.license.findMany({
      where: {
        deletedAt: null,
        userNik: req.user.nik
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    res.json(license);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const syncLicenseFromEchain = async (req, res) => {
  if (process.env.ECHAIN_MOCK_MODE === "true") {
    return res.json({
      success: true,
      message: "License data found from e-chain mock mode",
      data: ECHAIN_LICENSE_MOCK_DATA,
    });
  }

  const baseUrl = process.env.ECHAIN_BASE_URL;
  const licensePath = process.env.ECHAIN_LICENSE_SYNC_PATH || "/api/integrations/simponi/license";

  if (!baseUrl) {
    return res.status(503).json({
      success: false,
      message: "e-chain integration is not configured.",
      error: {
        code: "ECHAIN_NOT_CONFIGURED",
        details: "Set ECHAIN_BASE_URL before using license sync.",
      },
    });
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.ECHAIN_TIMEOUT_MS || 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(licensePath, baseUrl);
    const payload = {
      nik: req.user.nik,
      requestedFields: ECHAIN_LICENSE_FIELDS,
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
        message: responseBody?.message || "Failed to sync license data from e-chain.",
        error: responseBody?.error || {
          code: "ECHAIN_HTTP_ERROR",
          details: `e-chain responded with HTTP ${response.status}.`,
        },
      });
    }

    if (!responseBody?.success || typeof responseBody.data !== "object" || responseBody.data == null) {
      return res.status(502).json({
        success: false,
        message: "Invalid license sync response from e-chain.",
        error: {
          code: "ECHAIN_INVALID_RESPONSE",
          details: "Response must follow the agreed license sync ICD envelope.",
        },
      });
    }

    const data = pickLicenseSyncData(responseBody.data);
    const validationErrors = validateLicenseSyncData(data);

    if (validationErrors.length) {
      return res.status(502).json({
        success: false,
        message: "Invalid license data from e-chain.",
        error: {
          code: "ECHAIN_LICENSE_VALIDATION_FAILED",
          details: validationErrors,
        },
      });
    }

    return res.json({
      success: true,
      message: responseBody.message || "License data found",
      data,
    });
  } catch (error) {
    const isTimeout = error.name === "AbortError";

    return res.status(isTimeout ? 504 : 502).json({
      success: false,
      message: isTimeout ? "e-chain license sync timed out." : "Failed to sync license data from e-chain.",
      error: {
        code: isTimeout ? "ECHAIN_TIMEOUT" : "ECHAIN_REQUEST_FAILED",
        details: error.message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const addLicenseUser = async (req, res) => {
  try {
    const {note, licenseExpiredDate, echainFileUrl, echainFileName, echainFileMimeType} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
    const downloadedFile = !file && echainFileUrl
      ? await downloadEchainLicenseFile({
          fileUrl: echainFileUrl,
          fileName: echainFileName,
          fileMimeType: echainFileMimeType,
        })
      : null;
    
    const license = await prisma.license.create({
      data: {
        userNik: req.user.nik,
        note,
        expiredDate: dayjs.utc(licenseExpiredDate).add(1, 'day').subtract(1, 'second').toDate(),
        file: file ? `/uploads/license/${file.filename}` : downloadedFile?.url || null,
      }
    })
    const savedFiles = file
      ? files.map(f => ({
          filename: f.filename,
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          url: `/uploads/license/${f.filename}`
        }))
      : downloadedFile ? [downloadedFile] : null;

    res.status(200).json({ 
      success: true, 
      license,
      files: savedFiles
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLicenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const {note, licenseExpiredDate} = req.body
    const files = req.files
    const file = files && files.length > 0 ? files[0] : null
   
    const existingLicense = await prisma.license.findUnique({
      where: {id: parseInt(id)},
      select: {file: true}
    })

    // Delete old file if a new file is being uploaded and old file exists
    if (file && existingLicense && existingLicense.file) {
      const oldFilePath = path.join(process.cwd(), existingLicense.file);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    const updateData = {
      userNik: req.user.nik,
      note: note,
      expiredDate: dayjs.utc(licenseExpiredDate).add(1, 'day').subtract(1, 'second').toDate(),
    }

    if (file) {
      updateData.file = `/uploads/license/${file.filename}`;
    }

    await prisma.license.update({
      where: {
        id: parseInt(id)
      },
      data: updateData
    });
    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLicenseById = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;
  
    await prisma.license.update({
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

export { getLicenseUser, syncLicenseFromEchain, addLicenseUser, getLicenseById, deleteLicenseById};
