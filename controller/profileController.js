import prisma from "../lib/prisma.js";
import config from "../utils/config.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
dayjs.extend(utc)

const ECHAIN_PROFILE_FIELDS = [
  "name",
  "dateOfBirth",
  "placeOfBirth",
  "personalAddress",
  "nationality",
  "phoneNumber",
  "email",
];

const pickProfileSyncData = (data = {}) => ECHAIN_PROFILE_FIELDS.reduce((result, field) => {
  if (Object.prototype.hasOwnProperty.call(data, field)) {
    result[field] = data[field];
  }
  return result;
}, {});

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

const validateProfileSyncData = (data = {}) => {
  const errors = [];

  if (typeof data.name !== "string" || !data.name.trim()) errors.push("name is required.");
  if (typeof data.dateOfBirth !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) {
    errors.push("dateOfBirth must use YYYY-MM-DD format.");
  }
  if (typeof data.placeOfBirth !== "string" || !data.placeOfBirth.trim()) errors.push("placeOfBirth is required.");
  if (typeof data.personalAddress !== "string" || !data.personalAddress.trim()) errors.push("personalAddress is required.");
  if (typeof data.nationality !== "string" || !data.nationality.trim()) errors.push("nationality is required.");
  if (data.phoneNumber != null && typeof data.phoneNumber !== "string") errors.push("phoneNumber must be a string or null.");
  if (data.email != null && (typeof data.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
    errors.push("email must be a valid email or null.");
  }

  return errors;
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        // nik: "10011520",
        nik: req.user.nik
      },
      select: {
        nik: true,
        licenseUserId: true,
        professionInBranch: {
          select: {
            id: true,
            profession: true
          }
        },
        sector: {
          select: {
            id: true,
            sector: true
          }
        },
        branch: {
          select: {
            id: true,
            branch: true
          }
        },
        branchUnit: {
          select: {
            id: true,
            unit: true
          }
        },
        name: true,
        dateOfBirth: true,
        placeOfBirth: true,
        personalAddress: true,
        nationality: true,
        phoneNumber: true,
        gender: {
          select: {
            id: true,
            gender: true
          }
        },
        email: true,
        authenticationType: true
      }
    })

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const syncProfileFromEchain = async (req, res) => {
  const baseUrl = process.env.ECHAIN_BASE_URL;
  const profilePath = process.env.ECHAIN_PROFILE_SYNC_PATH || "/api/integrations/simponi/profile";

  if (!baseUrl) {
    return res.status(503).json({
      success: false,
      message: "e-chain integration is not configured.",
      error: {
        code: "ECHAIN_NOT_CONFIGURED",
        details: "Set ECHAIN_BASE_URL before using profile sync.",
      },
    });
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.ECHAIN_TIMEOUT_MS || 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(profilePath, baseUrl);
    const payload = {
      nik: req.user.nik,
      requestedFields: ECHAIN_PROFILE_FIELDS,
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
        message: responseBody?.message || "Failed to sync profile data from e-chain.",
        error: responseBody?.error || {
          code: "ECHAIN_HTTP_ERROR",
          details: `e-chain responded with HTTP ${response.status}.`,
        },
      });
    }

    if (!responseBody?.success || typeof responseBody.data !== "object" || responseBody.data == null) {
      return res.status(502).json({
        success: false,
        message: "Invalid profile sync response from e-chain.",
        error: {
          code: "ECHAIN_INVALID_RESPONSE",
          details: "Response must follow the agreed profile sync ICD envelope.",
        },
      });
    }

    const data = pickProfileSyncData(responseBody.data);
    const validationErrors = validateProfileSyncData(data);

    if (validationErrors.length) {
      return res.status(502).json({
        success: false,
        message: "Invalid profile data from e-chain.",
        error: {
          code: "ECHAIN_PROFILE_VALIDATION_FAILED",
          details: validationErrors,
        },
      });
    }

    return res.json({
      success: true,
      message: responseBody.message || "Profile data found",
      data,
    });
  } catch (error) {
    const isTimeout = error.name === "AbortError";

    return res.status(isTimeout ? 504 : 502).json({
      success: false,
      message: isTimeout ? "e-chain profile sync timed out." : "Failed to sync profile data from e-chain.",
      error: {
        code: isTimeout ? "ECHAIN_TIMEOUT" : "ECHAIN_REQUEST_FAILED",
        details: error.message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
};

const editProfile = async (req, res) => {
  try {
    const {name, licenseUserId, genderId, dateOfBirth, placeOfBirth, personalAddress, nationality, phoneNumber, email } = req.body
    
    await prisma.user.update({
      where: {
        nik: req.user.nik
      },
      data: {
        name,
        licenseUserId,
        genderId: parseInt(genderId),
        dateOfBirth: dayjs.utc(dateOfBirth).toDate(),
        placeOfBirth,
        personalAddress,
        nationality,
        phoneNumber,
        email
      }
    })
    res.status(201).json({ success: true,}); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required." });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password confirmation does not match." });
    }
    if (newPassword.length < 8 ||
        !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) ||
        !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({
        message: "New password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      });
    }

    const user = await prisma.user.findFirst({
      where: { nik: req.user.nik, deletedAt: null },
      select: { nik: true, password: true, authenticationType: true },
    });
    if (!user) return res.status(404).json({ message: "User was not found." });
    if (user.authenticationType === "AIRNAV_SSO") {
      return res.status(403).json({ message: "Password changes are available only for Non-AirNav accounts." });
    }
    if (!user.password || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: "New password must be different from the current password." });
    }

    const password = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { nik: user.nik },
        data: {
          password,
          authenticationType: "LOCAL",
          tokenVersion: { increment: 1 },
        },
      }),
      prisma.authenticationAudit.create({
        data: {
          userNik: user.nik,
          performedByNik: user.nik,
          eventType: "PASSWORD_CHANGED",
          success: true,
          reason: "SELF_SERVICE",
          ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100) || null,
          userAgent: String(req.get?.("user-agent") || "").slice(0, 500) || null,
        },
      }),
    ]);

    res.clearCookie("auth_token", { path: "/" });
    res.clearCookie("csrf_token", { path: "/" });
    return res.json({ success: true, message: "Password changed. Please sign in again." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export { getProfile, syncProfileFromEchain, editProfile, changePassword };
