import { createHmac, timingSafeEqual } from "crypto";
import securityConfig from "../config/security.js";

const sign = (value) => createHmac("sha256", securityConfig.jwtSecret).update(value).digest("base64url");

export const createCredentialSyncReceipt = ({ type, nik, data }) => {
  const payload = Buffer.from(JSON.stringify({ type, nik, data, expiresAt: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

export const verifyCredentialSyncReceipt = ({ receipt, type, nik, data }) => {
  if (typeof receipt !== "string") return false;
  const [payload, signature] = receipt.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded.type === type && decoded.nik === nik && decoded.expiresAt >= Date.now() && JSON.stringify(decoded.data) === JSON.stringify(data);
  } catch {
    return false;
  }
};
