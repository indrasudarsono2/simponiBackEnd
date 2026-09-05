import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import securityConfig from "../config/security.js";
import { parseCookies } from "./cookies.js";

const authenticateToken = async (req, res, next) => {
  try {
    // Prefer the HttpOnly session cookie. Authorization remains supported for
    // trusted integrations during the migration period.
    const authHeader = req.headers["authorization"];
    const bearerToken = authHeader && authHeader.split(" ")[1];
    const token = parseCookies(req.headers.cookie).auth_token || bearerToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, securityConfig.jwtSecret, {
      algorithms: [securityConfig.jwtAlgorithm],
      issuer: securityConfig.jwtIssuer,
      audience: securityConfig.jwtAudience,
    });

    const currentUser = await prisma.user.findFirst({
      where: { nik: decoded.nik, deletedAt: null },
      select: {
        nik: true, name: true, email: true, branchId: true, branchUnitId: true,
        tokenVersion: true,
        authenticationType: true,
        sectorId: true, professionInBranchId: true,
        professionInBranch: { select: { professionId: true } },
        userRoles: {
          where: { deletedAt: null },
          select: {
            roles: {
              select: {
                role: true,
                deletedAt: true,
                rolesMenu: {
                  where: { deletedAt: null, menu: { deletedAt: null } },
                  select: { menu: { select: { menu: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!currentUser) return res.status(401).json({ success: false, message: "Account is no longer active." });
    // Tokens issued before session versioning was introduced are version 0.
    // Once a password change increments the database value, those legacy
    // tokens and every older version are rejected.
    const tokenVersion = Number.isInteger(decoded.tokenVersion) ? decoded.tokenVersion : 0;
    if (tokenVersion !== currentUser.tokenVersion) {
      return res.status(401).json({ success: false, message: "Session is no longer valid. Please login again." });
    }

    const activeRoles = currentUser.userRoles.filter((item) => !item.roles?.deletedAt);
    const menuNames = [...new Set(activeRoles.flatMap((item) =>
      (item.roles?.rolesMenu || []).map((roleMenu) => roleMenu.menu?.menu).filter(Boolean),
    ))];

    // Attach user data to request
    req.user = {
      nik: currentUser.nik,
      name: currentUser.name,
      email: currentUser.email,
      roles: activeRoles,
      roleNames: activeRoles.map((item) => item.roles?.role).filter(Boolean),
      menuNames,
      branchId: currentUser.branchId,
      branchUnitId: currentUser.branchUnitId,
      sectorId: currentUser.sectorId,
      professionInBranchId: currentUser.professionInBranchId,
      professionId: currentUser.professionInBranch?.professionId ?? null,
      authenticationType: currentUser.authenticationType,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({
        success: false,
        message: "Invalid token.",
      });
    }

    console.error("Auth middleware error:", error);

    const isProduction = process.env.NODE_ENV === "production";
    return res.status(500).json({
      success: false,
      message: "Authentication error.",
      ...( !isProduction && { error: error.message }),
    });
  }
};

export { authenticateToken };
