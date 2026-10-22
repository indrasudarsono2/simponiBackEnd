import jwt from 'jsonwebtoken';
import { ipKeyGenerator } from 'express-rate-limit';
import securityConfig from '../config/security.js';
import { parseCookies } from '../middleware/cookies.js';

// Shared WAF/NAT addresses must not combine every authenticated participant's
// normal API traffic into one counter. This is only a limiter key, never auth.
// The authentication middleware still checks the live user, version and roles.
export function apiRateLimitKey(req) {
  const bearer = String(req.headers.authorization || '').split(' ')[1];
  const token = parseCookies(req.headers.cookie).auth_token || bearer;
  if (token) {
    try {
      const claims = jwt.verify(token,securityConfig.jwtSecret,{
        algorithms:[securityConfig.jwtAlgorithm],issuer:securityConfig.jwtIssuer,audience:securityConfig.jwtAudience,
      });
      if (typeof claims.nik==='string' && /^[A-Za-z0-9]{8}$/.test(claims.nik)) return 'user:'+claims.nik;
    } catch { /* Forged/expired cookies must not bypass the anonymous IP limit. */ }
  }
  return 'ip:'+ipKeyGenerator(req.ip);
}
