import { isCheckerAdmin } from '../utils/checkerAdminScope.js';

// A selected UI role can narrow authority, never grant authority.
export function essayViewUser(req) {
  const scope = req.method === 'POST' ? req.body?.scope : req.query?.scope;
  if (scope != null && !['checker', 'admin'].includes(scope)) throw Object.assign(new Error('Invalid essay view scope.'), { status: 400 });
  if (scope === 'admin') {
    if (!isCheckerAdmin(req.user)) throw Object.assign(new Error('Checker Admin authority is required.'), { status: 403 });
    return req.user;
  }
  const roles = req.user?.roleNames || [];
  const hasChecker = roles.some(role => String(role).trim().toUpperCase() === 'CHECKER');
  if (scope === 'checker' || hasChecker) return { ...req.user, roleNames: roles.filter(role => String(role).trim().toUpperCase() !== 'CHECKER ADMIN') };
  return req.user;
}
