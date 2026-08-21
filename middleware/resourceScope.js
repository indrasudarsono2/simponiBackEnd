import prisma from "../lib/prisma.js";
import { ROLES } from "./authorize.js";

const hasRole = (req, role) => (req.user?.roleNames || []).some((item) => String(item).trim().toUpperCase() === role);
const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const unitWhere = (req) => hasRole(req, ROLES.BRANCH_ADMIN)
  ? { branchUnit: { is: { branchId: req.user.branchId } } }
  : { branchUnitId: req.user.branchUnitId };

const scopedLookups = [
  { pattern: /^\/licenseUser\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.license.findFirst({ where: { id, userNik: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/logbookUser\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.logBookUser.findFirst({ where: { id, userNik: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/ielpUser\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.ielp.findFirst({ where: { id, userNik: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/medexUser\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.medex.findFirst({ where: { id, userNik: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/competenceUser\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.competence.findFirst({ where: { id, userId: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/applicationDocument\/(?<id>\d+)$/, ownerOnly: true, lookup: (req, id) => prisma.applicationDoc.findFirst({ where: { id, userNik: req.user.nik, deletedAt: null }, select: { id: true } }) },
  { pattern: /^\/events\/(?<id>\d+)$/, lookup: (req, id) => prisma.event.findFirst({ where: { id, deletedAt: null, sector: { is: unitWhere(req) } }, select: { id: true } }) },
  { pattern: /^\/groups\/(?<id>\d+)$/, lookup: (req, id) => prisma.group.findFirst({ where: { id, deletedAt: null, event: { is: { sector: { is: unitWhere(req) } } } }, select: { id: true } }) },
  { pattern: /^\/eventQuestions\/(?<id>\d+)$/, lookup: (req, id) => prisma.eventQuestion.findFirst({ where: { id, deletedAt: null, sector: { is: unitWhere(req) } }, select: { id: true } }) },
  { pattern: /^\/essays\/(?<id>\d+)$/, lookup: (req, id) => prisma.essay.findFirst({ where: { id, deletedAt: null, ...unitWhere(req) }, select: { id: true } }) },
  { pattern: /^\/multipleChoices\/(?<id>\d+)$/, lookup: (req, id) => prisma.multipleChoice.findFirst({ where: { id, deletedAt: null, ...unitWhere(req) }, select: { id: true } }) },
];

export const enforceResourceScope = async (req, res, next) => {
  if (req.method === "GET") return next();
  const match = scopedLookups.map((item) => ({ item, match: req.path.match(item.pattern) })).find(({ match }) => match);
  if (!match) return next();
  if (hasRole(req, ROLES.GENERAL_ADMIN) && !match.item.ownerOnly) return next();
  const id = parseId(match.match.groups?.id);
  if (!id) return res.status(400).json({ message: "Invalid resource ID." });
  const resource = await match.item.lookup(req, id);
  if (!resource) return res.status(404).json({ message: "Resource not found in your permitted scope." });
  next();
};
