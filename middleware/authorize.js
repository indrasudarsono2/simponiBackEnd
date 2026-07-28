const normalizeRole = (role) => String(role || "").trim().toUpperCase();
const normalizeMenu = (menu) => String(menu || "").trim().toLowerCase();

export const ROLES = Object.freeze({
  GENERAL_ADMIN: "GENERAL ADMIN",
  BRANCH_ADMIN: "BRANCH ADMIN",
  BRANCH_UNIT_ADMIN: "BRANCH UNIT ADMIN",
  CHECKER_ADMIN: "CHECKER ADMIN",
  GENERAL_CHECKER: "GENERAL CHECKER",
  CHECKER: "CHECKER",
  OPERATIONAL: "OPERATIONAL",
  SUPERVISOR: "SUPERVISOR",
  DOCTOR: "DOCTOR",
});

export const requireRole = (...allowedRoles) => {
  const allowed = new Set(allowedRoles.map(normalizeRole));
  return (req, res, next) => {
    const roles = (req.user?.roleNames || []).map(normalizeRole);
    if (!roles.some((role) => allowed.has(role))) {
      return res.status(403).json({ success: false, message: "Insufficient permission." });
    }
    next();
  };
};

export const requireMenu = (...allowedMenus) => {
  const allowed = new Set(allowedMenus.map(normalizeMenu));
  return (req, res, next) => {
    const menus = (req.user?.menuNames || []).map(normalizeMenu);
    if (!menus.some((menu) => allowed.has(menu))) {
      return res.status(403).json({ success: false, message: "This role does not have access to the required menu." });
    }
    next();
  };
};

export const requireSelfOrRole = (paramName, ...allowedRoles) => {
  const roleCheck = requireRole(...allowedRoles);
  return (req, res, next) => {
    if (String(req.params[paramName]) === String(req.user?.nik)) return next();
    return roleCheck(req, res, next);
  };
};

// Reject tenant identifiers supplied by a lower-scope user when they differ
// from the identity loaded by the authentication middleware.
export const enforceTenantBody = (req, res, next) => {
  const roles = new Set((req.user?.roleNames || []).map(normalizeRole));
  if (roles.has(ROLES.GENERAL_ADMIN)) return next();

  const checks = roles.has(ROLES.BRANCH_ADMIN)
    ? [["branchId", req.user.branchId]]
    : [
        ["branchId", req.user.branchId],
        ["branchUnitId", req.user.branchUnitId],
        ["sectorId", req.user.sectorId],
      ];

  for (const [field, expected] of checks) {
    if (req.body?.[field] != null && String(req.body[field]) !== String(expected)) {
      return res.status(403).json({ success: false, message: `Cannot operate outside your ${field} scope.` });
    }
  }
  next();
};
