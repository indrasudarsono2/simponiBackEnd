import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import securityConfig from "../config/security.js";
import crypto from "crypto";
import { calculateFailureState } from "../security/loginProtection.js";

const SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2b$10$uqb90WacIdn1VabpSdgEdOd4w8rpplKyNk8.6iH65DP4v75VhSXfy";
const INVALID_LOGIN_MESSAGE = "Invalid credentials or temporarily unavailable";

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
      select: {
        nik: true,
        licenseUserId: true,
        name: true,
        password: true,
        sectorId: true,
        branchId: true,
        branchUnitId: true,
        professionInBranchId: true,
        professionInBranch: {
          select: {
            professionId: true
          }
        },
        userRoles: {
          select: {
            roles: {
              select: {
                role: true,
                rolesMenu: {
                  where: {
                    deletedAt: null
                  },
                  select: {
                    menu: {
                      select: {
                        menu: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
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

    const roleNames = (user.userRoles || [])
      .map((ur) => ur.roles?.role)
      .filter(Boolean);


    const payload = {
      nik: user.nik,
      name: user.name,
      // email: user.email,
      roles: user.userRoles,
      branchId: user.branchId,
      branchUnitId: user.branchUnitId,
      sectorId: user.sectorId,
      professionInBranchId: user.professionInBranchId,
      professionId: user.professionInBranch ? user.professionInBranch.professionId : null,
      roleNames: roleNames
    };
   
    const token = jwt.sign(
      payload,
      securityConfig.jwtSecret,
      {
        expiresIn: "3h",
        algorithm: securityConfig.jwtAlgorithm,
        issuer: securityConfig.jwtIssuer,
        audience: securityConfig.jwtAudience,
        subject: user.nik,
      }
    );
  
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    await recordSuccessfulLogin(user.nik, req, now);
    res.cookie("auth_token", token, sessionCookieOptions());
    res.cookie("csrf_token", csrfToken, csrfCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful",
      csrfToken,
      user: {
        nik: user.nik,
        name: user.name,
        email: user.email,
        roles: user.userRoles,
      },
    });
  } catch (error) {
    console.error("Login failed", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
    });
  }
};

const session = (req, res) => res.json({
  success: true,
  user: {
    nik: req.user.nik,
    name: req.user.name,
    email: req.user.email,
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

export { login, logout, session };
