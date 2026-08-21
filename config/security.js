const MIN_SECRET_LENGTH = 32;

const positiveInteger = (name, fallback) => {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

const requireSecret = (name) => {
  const value = process.env[name]?.trim();
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set and contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return value;
};

const isProduction = process.env.NODE_ENV === "production";
const serverHost = process.env.HOST?.trim() || "127.0.0.1";
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
export const canEnableTestLoginBypass = ({ production, host }) =>
  !production && loopbackHosts.has(String(host || "").toLowerCase());
const testLoginBypassRequested = process.env.ALLOW_TEST_LOGIN_BYPASS === "true";

if (testLoginBypassRequested && !canEnableTestLoginBypass({ production: isProduction, host: serverHost })) {
  throw new Error(
    "ALLOW_TEST_LOGIN_BYPASS may only be enabled for a non-production server bound to localhost.",
  );
}

const allowTestLoginBypass =
  canEnableTestLoginBypass({ production: isProduction, host: serverHost }) && testLoginBypassRequested;

if (allowTestLoginBypass) {
  console.warn(
    "\n⚠️  WARNING: Test login bypass is ENABLED. Any valid NIK can log in without a password.\n" +
      "   This must NEVER be enabled in production. Set ALLOW_TEST_LOGIN_BYPASS=false or unset it before deploy.\n",
  );
}

const securityConfig = Object.freeze({
  isProduction,
  serverHost,
  jwtSecret: requireSecret("JWT_SECRET"),
  fileUrlSecret: requireSecret("FILE_URL_SECRET"),
  allowTestLoginBypass,
  jwtAlgorithm: "HS256",
  jwtIssuer: process.env.JWT_ISSUER || "simponi-api",
  jwtAudience: process.env.JWT_AUDIENCE || "simponi-web",
  loginProtection: Object.freeze({
    failureWindowMs: positiveInteger("LOGIN_FAILURE_WINDOW_MINUTES", 30) * 60 * 1000,
    cooldownThreshold: positiveInteger("LOGIN_COOLDOWN_THRESHOLD", 5),
    firstCooldownMs: positiveInteger("LOGIN_FIRST_COOLDOWN_MINUTES", 5) * 60 * 1000,
    secondCooldownMs: positiveInteger("LOGIN_SECOND_COOLDOWN_MINUTES", 15) * 60 * 1000,
    maximumCooldownMs: positiveInteger("LOGIN_MAXIMUM_COOLDOWN_MINUTES", 30) * 60 * 1000,
  }),
});

export default securityConfig;
