const MIN_SECRET_LENGTH = 32;

const requireSecret = (name) => {
  const value = process.env[name]?.trim();
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be set and contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return value;
};

const isProduction = process.env.NODE_ENV === "production";

const securityConfig = Object.freeze({
  isProduction,
  jwtSecret: requireSecret("JWT_SECRET"),
  fileUrlSecret: requireSecret("FILE_URL_SECRET"),
  allowTestLoginBypass:
    !isProduction && process.env.ALLOW_TEST_LOGIN_BYPASS === "true",
  jwtAlgorithm: "HS256",
  jwtIssuer: process.env.JWT_ISSUER || "simponi-api",
  jwtAudience: process.env.JWT_AUDIENCE || "simponi-web",
});

export default securityConfig;
