import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import securityConfig from "../config/security.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { calculateFailureState } from "../security/loginProtection.js";

const SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2b$10$uqb90WacIdn1VabpSdgEdOd4w8rpplKyNk8.6iH65DP4v75VhSXfy";
const INVALID_LOGIN_MESSAGE = "Invalid credentials or temporarily unavailable";
const AIRNAV_STATE_COOKIE = "airnav_sso_state";
const AIRNAV_VERIFIER_COOKIE = "airnav_sso_verifier";
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RESPONSE = "If an eligible account was found, password reset instructions have been sent.";

const isStrongPassword = (password) =>
  typeof password === "string" && password.length >= 8 &&
  /[a-z]/.test(password) && /[A-Z]/.test(password) &&
  /\d/.test(password) && /[^A-Za-z0-9]/.test(password);

const createMailTransporter = () => {
  if (!process.env.MAIL_HOST || !process.env.MAIL_FROM) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || "").toLowerCase() === "true",
    auth: process.env.MAIL_USER && process.env.MAIL_PASSWORD
      ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
      : undefined,
  });
};

const cooldownResponse = (res, lockedUntil, now = new Date()) => {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 1000),
  );
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(423).json({
    success: false,
    code: "ACCOUNT_COOLDOWN",
    message: `Too many failed login attempts. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`,
    retryAfterSeconds,
    lockedUntil,
  });
};

const requestAuditContext = (req) => ({
  ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100) || null,
  userAgent: String(req.get?.("user-agent") || "").slice(0, 500) || null,
});

const recordAnonymousFailure = async (req) => {
  try {
    await prisma.authenticationAudit.create({
      data: {
        eventType: "LOGIN_FAILED",
        success: false,
        reason: "INVALID_CREDENTIALS",
        ...requestAuditContext(req),
      },
    });
  } catch (error) {
    console.error("Unable to record authentication audit", error);
  }
};

const recordUserFailure = async (userNik, req, now) => prisma.$transaction(async (tx) => {
  const previous = await tx.userLoginSecurity.findUnique({ where: { userNik } });
  const failureState = calculateFailureState({
    previous,
    now,
    config: securityConfig.loginProtection,
  });

  await tx.userLoginSecurity.upsert({
    where: { userNik },
    create: { userNik, ...failureState },
    update: failureState,
  });
  await tx.authenticationAudit.create({
    data: {
      userNik,
      eventType: failureState.lockedUntil ? "ACCOUNT_COOLDOWN_STARTED" : "LOGIN_FAILED",
      success: false,
      reason: failureState.lockedUntil ? "FAILURE_THRESHOLD_REACHED" : "INVALID_CREDENTIALS",
      ...requestAuditContext(req),
    },
  });
  return failureState;
});

const recordSuccessfulLogin = async (userNik, req, now) => prisma.$transaction([
  prisma.userLoginSecurity.upsert({
    where: { userNik },
    create: { userNik, lastSuccessfulLoginAt: now },
    update: {
      failedLoginCount: 0,
      firstFailedAt: null,
      lastFailedAt: null,
      lockedUntil: null,
      lastSuccessfulLoginAt: now,
    },
  }),
  prisma.authenticationAudit.create({
    data: {
      userNik,
      eventType: "LOGIN_SUCCEEDED",
      success: true,
      reason: "VALID_CREDENTIALS",
      ...requestAuditContext(req),
    },
  }),
]);

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: securityConfig.isProduction,
  sameSite: "lax",
  maxAge: SESSION_MAX_AGE_MS,
  path: "/",
});

const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: securityConfig.isProduction,
  sameSite: "lax",
  maxAge: SESSION_MAX_AGE_MS,
  path: "/",
});

const clearSessionCookieOptions = (httpOnly) => ({
  httpOnly,
  secure: securityConfig.isProduction,
  sameSite: "lax",
  path: "/",
});

const airnavCookieOptions = () => ({
  httpOnly: true,
  secure: securityConfig.isProduction,
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
});

const clearAirnavCookieOptions = () => ({
  httpOnly: true,
  secure: securityConfig.isProduction,
  sameSite: "lax",
  path: "/",
});

const getAirnavConfig = () => {
  const baseUrl = process.env.AIRNAV_AUTH_BASE_URL?.replace(/\/+$/, "");
  const clientId = process.env.AIRNAV_CLIENT_ID?.trim();
  const redirectUri = process.env.AIRNAV_REDIRECT_URI?.trim();
  if (!baseUrl || !clientId || !redirectUri) return null;
  return { baseUrl, clientId, redirectUri, clientSecret: process.env.AIRNAV_CLIENT_SECRET || "" };
};

const safeEqual = (left, right) => {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const loginErrorRedirect = (res, message) => {
  const publicBaseUrl = process.env.PERFORMA_PUBLIC_BASE_URL || process.env.SIMPONI_PUBLIC_BASE_URL;
  if (!publicBaseUrl) return res.status(400).json({ success: false, message });
  const url = new URL("/login", publicBaseUrl);
  url.searchParams.set("auth_error", message);
  return res.redirect(url.toString());
};

const userLoginSelect = {
  nik: true,
  licenseUserId: true,
  name: true,
  email: true,
  password: true,
  authenticationType: true,
  tokenVersion: true,
  sectorId: true,
  branchId: true,
  branchUnitId: true,
  professionInBranchId: true,
  professionInBranch: { select: { professionId: true } },
  userRoles: {
    select: {
      roles: {
        select: {
          role: true,
          rolesMenu: {
            where: { deletedAt: null },
            select: { menu: { select: { menu: true } } },
          },
        },
      },
    },
  },
};

const getRequestCookie = (req, name) => {
  const cookieHeader = String(req.headers.cookie || "");
  const prefix = `${name}=`;
  const value = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  try {
    return value ? decodeURIComponent(value.slice(prefix.length)) : "";
  } catch {
    return "";
  }
};

const establishLocalSession = async (user, req, res, now = new Date()) => {
  const roleNames = (user.userRoles || []).map((ur) => ur.roles?.role).filter(Boolean);
  const token = jwt.sign({
    nik: user.nik,
    name: user.name,
    roles: user.userRoles,
    branchId: user.branchId,
    branchUnitId: user.branchUnitId,
    sectorId: user.sectorId,
    professionInBranchId: user.professionInBranchId,
    professionId: user.professionInBranch?.professionId || null,
    tokenVersion: user.tokenVersion,
    roleNames,
  }, securityConfig.jwtSecret, {
    expiresIn: "3h", algorithm: securityConfig.jwtAlgorithm, issuer: securityConfig.jwtIssuer,
    audience: securityConfig.jwtAudience, subject: user.nik,
  });
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  await recordSuccessfulLogin(user.nik, req, now);
  res.cookie("auth_token", token, sessionCookieOptions());
  res.cookie("csrf_token", csrfToken, csrfCookieOptions());
  return {
    csrfToken,
    user: {
      nik: user.nik,
      name: user.name,
      email: user.email,
      authenticationType: user.authenticationType,
      roles: user.userRoles,
    },
  };
};

const startAirnavLogin = (req, res) => {
  const config = getAirnavConfig();
  if (!config) return res.status(503).json({ success: false, message: "AirNav AUTH is not configured" });
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const authorizeUrl = new URL(`${config.baseUrl}/sso/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  res.cookie(AIRNAV_STATE_COOKIE, state, airnavCookieOptions());
  res.cookie(AIRNAV_VERIFIER_COOKIE, verifier, airnavCookieOptions());
  return res.redirect(authorizeUrl.toString());
};

const completeAirnavLogin = async (req, res) => {
  const config = getAirnavConfig();
  const clearCookies = () => {
    res.clearCookie(AIRNAV_STATE_COOKIE, clearAirnavCookieOptions());
    res.clearCookie(AIRNAV_VERIFIER_COOKIE, clearAirnavCookieOptions());
  };
  if (!config) return loginErrorRedirect(res, "AirNav AUTH is not configured");
  if (req.query.error) {
    clearCookies();
    return loginErrorRedirect(res, "AirNav authentication was cancelled or denied");
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const verifier = getRequestCookie(req, AIRNAV_VERIFIER_COOKIE);
  const expectedState = getRequestCookie(req, AIRNAV_STATE_COOKIE);
  if (!code || !safeEqual(state, expectedState) || !verifier) {
    clearCookies();
    return loginErrorRedirect(res, "Invalid or expired AirNav sign-in request");
  }
  try {
    const form = new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId,
      redirect_uri: config.redirectUri, code_verifier: verifier });
    if (config.clientSecret) form.set("client_secret", config.clientSecret);
    const tokenResponse = await fetch(`${config.baseUrl}/sso/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
      signal: AbortSignal.timeout(10000),
    });
    const tokenPayload = await tokenResponse.json().catch(() => null);
    const accessToken = tokenPayload?.data?.accessToken;
    if (!tokenResponse.ok || !accessToken) throw new Error("token exchange failed");
    const infoResponse = await fetch(`${config.baseUrl}/sso/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const infoPayload = await infoResponse.json().catch(() => null);
    const identity = infoPayload?.data || infoPayload;
    const nik = String(identity?.employee_no || "").trim();
    if (!infoResponse.ok || !nik) throw new Error("userinfo response did not include employee_no");
    const user = await prisma.user.findFirst({ where: { nik, deletedAt: null }, select: userLoginSelect });
    if (!user) {
      await recordAnonymousFailure(req);
      clearCookies();
      return loginErrorRedirect(res, "Your AirNav account is not registered in PERFORMA");
    }
    if (user.authenticationType === "LOCAL") {
      await recordAnonymousFailure(req);
      clearCookies();
      return loginErrorRedirect(res, "This account is configured for Non-AirNav Sign In");
    }
    const session = await establishLocalSession(user, req, res);
    clearCookies();
    const publicBaseUrl = process.env.PERFORMA_PUBLIC_BASE_URL || process.env.SIMPONI_PUBLIC_BASE_URL;
    if (!publicBaseUrl) return res.status(200).json({ success: true, ...session });
    return res.redirect(new URL("/auth/complete", publicBaseUrl).toString());
  } catch (error) {
    console.error("AirNav SSO login failed", error);
    clearCookies();
    return loginErrorRedirect(res, "Unable to authenticate with AirNav AUTH");
  }
};

const login = async (req, res) => {
  try {
    const { nik, password } = req.body;
    
    if (!nik || !password) {
      return res.status(400).json({
        success: false,
        message: "nik and password are required",
      });
    }

    
    const user = await prisma.user.findFirst({
      where: {
        nik: nik,
        deletedAt: null,
      },
      select: userLoginSelect
    });
    
    const suppliedPasswordIsValid = await bcrypt.compare(
      password,
      user?.password || DUMMY_PASSWORD_HASH,
    );

    if (!user) {
      await recordAnonymousFailure(req);
      return res.status(401).json({
        success: false,
        message: INVALID_LOGIN_MESSAGE,
      });
    }

    if (user.authenticationType === "AIRNAV_SSO") {
      await prisma.authenticationAudit.create({
        data: {
          userNik: user.nik,
          eventType: "LOGIN_FAILED",
          success: false,
          reason: "LOGIN_METHOD_NOT_ALLOWED",
          ...requestAuditContext(req),
        },
      });
      return res.status(403).json({
        success: false,
        message: "This account must sign in with AirNav SSO",
      });
    }

    const now = new Date();
    const securityState = await prisma.userLoginSecurity.findUnique({
      where: { userNik: user.nik },
    });
    if (!securityConfig.allowTestLoginBypass && securityState?.lockedUntil > now) {
      await prisma.authenticationAudit.create({
        data: {
          userNik: user.nik,
          eventType: "LOGIN_BLOCKED_BY_COOLDOWN",
          success: false,
          reason: "ACTIVE_COOLDOWN",
          ...requestAuditContext(req),
        },
      });
      return cooldownResponse(res, securityState.lockedUntil, now);
    }

    const isPasswordValid = securityConfig.allowTestLoginBypass || suppliedPasswordIsValid;
    if (!isPasswordValid) {
      const failureState = await recordUserFailure(user.nik, req, now);
      if (failureState.lockedUntil) {
        return cooldownResponse(res, failureState.lockedUntil, now);
      }
      return res.status(401).json({ success: false, message: INVALID_LOGIN_MESSAGE });
    }

    const session = await establishLocalSession(user, req, res, now);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      ...session,
    });
  } catch (error) {
    console.error("Login failed", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

const forgotPassword = async (req, res) => {
  const neutralResponse = () => res.json({ success: true, message: PASSWORD_RESET_RESPONSE });
  try {
    const identifier = String(req.body?.identifier || "").trim();
    if (!identifier) return neutralResponse();

    const user = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ nik: identifier }, { email: identifier }],
      },
      select: { nik: true, name: true, email: true, authenticationType: true },
    });
    if (!user || user.authenticationType !== "LOCAL" || !user.email) {
      await recordAnonymousFailure(req);
      return neutralResponse();
    }

    const transporter = createMailTransporter();
    const publicBaseUrl = process.env.PERFORMA_PUBLIC_BASE_URL || process.env.SIMPONI_PUBLIC_BASE_URL;
    if (!transporter || !publicBaseUrl) {
      console.error("Password reset email is not configured");
      return neutralResponse();
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
    const resetUrl = new URL("/reset-password", publicBaseUrl);
    resetUrl.searchParams.set("token", token);

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userNik: user.nik, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.create({
        data: {
          userNik: user.nik,
          tokenHash,
          expiresAt,
          requestedIp: requestAuditContext(req).ipAddress,
        },
      }),
    ]);

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: "PERFORMA password reset",
        text: `Hello ${user.name || user.nik},\n\nUse this link to reset your PERFORMA password. It expires in 15 minutes and can be used once:\n${resetUrl.toString()}\n\nIf you did not request this, ignore this email.`,
      });
      await prisma.authenticationAudit.create({
        data: {
          userNik: user.nik,
          eventType: "PASSWORD_RESET_REQUESTED",
          success: true,
          reason: "EMAIL_SENT",
          ...requestAuditContext(req),
        },
      });
    } catch (error) {
      await prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } });
      console.error("Unable to send password reset email", error);
    }
    return neutralResponse();
  } catch (error) {
    console.error("Forgot password failed", error);
    return neutralResponse();
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const { newPassword, confirmPassword } = req.body || {};
    if (!token || !newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Invalid reset request." });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        user: { select: { nik: true, password: true, authenticationType: true, deletedAt: true } },
      },
    });
    if (!resetToken?.user || resetToken.user.deletedAt || resetToken.user.authenticationType !== "LOCAL") {
      return res.status(400).json({ success: false, message: "This reset link is invalid or has expired." });
    }
    if (resetToken.user.password && await bcrypt.compare(newPassword, resetToken.user.password)) {
      return res.status(400).json({ success: false, message: "New password must be different from the current password." });
    }

    const password = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { nik: resetToken.user.nik },
        data: { password, tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userNik: resetToken.user.nik, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.authenticationAudit.create({
        data: {
          userNik: resetToken.user.nik,
          performedByNik: resetToken.user.nik,
          eventType: "PASSWORD_RESET_COMPLETED",
          success: true,
          reason: "SELF_SERVICE",
          ...requestAuditContext(req),
        },
      }),
    ]);
    res.clearCookie("auth_token", clearSessionCookieOptions(true));
    res.clearCookie("csrf_token", clearSessionCookieOptions(false));
    return res.json({ success: true, message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    console.error("Reset password failed", error);
    return res.status(500).json({ success: false, message: "Unable to reset password." });
  }
};

const session = (req, res) => res.json({
  success: true,
  user: {
    nik: req.user.nik,
    name: req.user.name,
    email: req.user.email,
    authenticationType: req.user.authenticationType,
    roles: req.user.roles,
  },
});

const logout = (_req, res) => {
  res.clearCookie("auth_token", clearSessionCookieOptions(true));
  res.clearCookie("csrf_token", clearSessionCookieOptions(false));
  res.clearCookie("auth_user", { path: "/" });
  res.clearCookie("auth_timestamp", { path: "/" });
  return res.json({ success: true, message: "Logout successful" });
};

export { completeAirnavLogin, forgotPassword, login, logout, resetPassword, session, startAirnavLogin };
