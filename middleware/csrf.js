import crypto from "crypto";
import { parseCookies } from "./cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const timingSafeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const enforceCsrf = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies.csrf_token;
  const headerToken = req.get("X-CSRF-Token");

  if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token.",
    });
  }

  next();
};

export { enforceCsrf };
