import prisma from '../lib/prisma.js';
import { examinationActivity } from '../services/examinationActivity.js';
const policies = {
  general: ['GENERAL ADMIN','dashboardGeneralAdmin'],
  branch: ['BRANCH ADMIN','dashboardBranchAdmin'],
  unit: ['BRANCH UNIT ADMIN','dashboardBranchUnitAdmin'],
};
const deny = message => Object.assign(new Error(message), { status: 403 });
export async function readAdminExaminationActivity(client, user, query) {
  const scope = query.scope;
  const policy = typeof scope === 'string' && Object.hasOwn(policies, scope) ? policies[scope] : null;
  const roles = (user.roleNames || []).map(v => String(v).trim().toUpperCase());
  const menus = (user.menuNames || []).map(v => String(v).toLowerCase());
  if (!policy || !roles.includes(policy[0]) || !menus.includes(policy[1].toLowerCase())) throw deny('This dashboard scope is not authorized.');
  const parseId = value => {
    if (value == null || value === '' || value === 'all') return null;
    if (!['string','number'].includes(typeof value)) throw Object.assign(new Error('Invalid filter ID.'), { status: 400 });
    const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('Invalid filter ID.'), { status: 400 }); return id;
  };
  const branchId = parseId(query.branchId), unitId = parseId(query.branchUnitId);
  if (query.page != null && !['string','number'].includes(typeof query.page)) throw Object.assign(new Error('Invalid page.'), { status: 400 });
  const page = query.page == null ? 0 : Number(query.page);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw Object.assign(new Error('Invalid page.'), { status: 400 });
  const where = { deletedAt: null, branch: { deletedAt: null } };
  if (scope === 'branch') {
    if (!Number.isSafeInteger(Number(user.branchId)) || Number(user.branchId) <= 0) throw deny('Your branch is not configured.');
    where.branchId = Number(user.branchId);
    if (branchId && branchId !== where.branchId) throw deny('Another branch is not accessible.');
  }
  if (scope === 'unit') {
    if (!Number.isSafeInteger(Number(user.branchUnitId)) || Number(user.branchUnitId) <= 0) throw deny('Your branch unit is not configured.');
    where.id = Number(user.branchUnitId);
    if (unitId && unitId !== where.id) throw deny('Another branch unit is not accessible.');
  }
  const units = await client.branchUnit.findMany({ where, select: { id: true, unit: true, branchId: true, branch: { select: { id: true, branch: true } } }, orderBy: [{ branchId: 'asc' }, { id: 'asc' }] });
  if (branchId && !units.some(u => u.branchId === branchId)) throw deny('Branch is outside your scope or unavailable.');
  const filtered = units.filter(u => !branchId || u.branchId === branchId);
  if (unitId && !filtered.some(u => u.id === unitId)) throw deny('Branch unit is outside your scope or selected branch.');
  const activity = await examinationActivity(client, { unitIds: filtered.filter(u => !unitId || u.id === unitId).map(u => u.id), skip: page * 100, snapshot: query.snapshot === 'true' });
  return { ...activity, page, scope,
    branches: [...new Map(units.map(u => [u.branchId, { id: u.branchId, name: u.branch?.branch || '-' }])).values()],
    branchUnits: filtered.map(u => ({ id: u.id, name: u.unit, branchId: u.branchId })) };
}
export async function getAdminExaminationActivity(req, res) {
  try { res.json(await readAdminExaminationActivity(prisma, req.user, req.query)); }
  catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to load examination activity.' }); }
}
