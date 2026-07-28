import crypto from "crypto";
import path from "path";
import securityConfig from "../config/security.js";

const UPLOAD_PREFIX = "/uploads/";
const TTL_SECONDS = 5 * 60;

const getAllowedFrameAncestors = () => {
  const configuredOrigins = process.env.CORS_ORIGIN ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  const origins = configuredOrigins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return [...new Set(["'self'", ...origins])].join(" ");
};

const sign = (expires, relativePath) =>
  crypto.createHmac("sha256", securityConfig.fileUrlSecret)
    .update(`${expires}:${relativePath}`)
    .digest("base64url");

export const createSignedFileUrl = (storedPath) => {
  const relativePath = storedPath.slice(UPLOAD_PREFIX.length).replaceAll("\\", "/");
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return `/files/${expires}/${sign(expires, relativePath)}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
};

const mapFileUrls = (value) => {
  if (Array.isArray(value)) return value.map(mapFileUrls);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapFileUrls(item)]));
  }
  return typeof value === "string" && value.startsWith(UPLOAD_PREFIX)
    ? createSignedFileUrl(value)
    : value;
};

export const signFileUrlsInJson = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(mapFileUrls(body));
  next();
};

export const serveSignedFile = (uploadsDirectory) => (req, res) => {
  const expires = Number(req.params.expires);
  const rawPath = Array.isArray(req.params.filePath)
    ? req.params.filePath.join("/")
    : String(req.params.filePath || "");
  let relativePath;
  try {
    relativePath = rawPath.split("/").map(decodeURIComponent).join("/");
  } catch {
    return res.status(400).json({ message: "Invalid file path." });
  }

  const expected = sign(expires, relativePath);
  const supplied = String(req.params.signature || "");
  const validSignature = supplied.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000) || !validSignature) {
    return res.status(403).json({ message: "File link is invalid or expired." });
  }

  const root = path.resolve(uploadsDirectory);
  const absolutePath = path.resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    return res.status(400).json({ message: "Invalid file path." });
  }

  // Helmet sets SAMEORIGIN globally, but the frontend and API use different
  // ports. Signed files may be framed only by explicitly configured origins.
  res.removeHeader("X-Frame-Options");
  res.set({
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": `default-src 'none'; frame-ancestors ${getAllowedFrameAncestors()}; sandbox`,
    "X-Content-Type-Options": "nosniff",
  });
  return res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).json({ message: "File not found." });
  });
};
