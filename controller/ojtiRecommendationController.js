import prisma from "../lib/prisma.js";

export const listEligibleOjti = async (req, res) => {
  try {
    const eventId = Number(req.query.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0 || !req.user.branchUnitId) {
      return res.status(400).json({ message: "Select a PENERBITAN event with a branch unit first." });
    }
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, remarkDoc: { remark: "PENERBITAN" }, eventUsers: { some: { userNik: req.user.nik, deletedAt: null } } },
      select: { sector: { select: { branchUnitId: true } } },
    });
    if (!event || event.sector?.branchUnitId !== req.user.branchUnitId) {
      return res.status(403).json({ message: "This PENERBITAN event is outside your branch unit." });
    }
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        nik: { not: req.user.nik },
        branchUnitId: req.user.branchUnitId,
        licenseUserId: { not: null },
        userRoles: { some: { deletedAt: null, roles: { role: "OPERATIONAL", deletedAt: null } } },
      },
      select: { nik: true, name: true, licenseUserId: true },
      orderBy: { name: "asc" },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const listInbox = async (req, res) => {
  try {
    if (!req.user.licenseUserId) {
      return res.status(400).json({ message: "Your license number is required to receive OJTI requests." });
    }
    const letters = await prisma.proposalLetter.findMany({
      where: {
        supervisorNik: req.user.nik,
        applicationDoc: {
          deletedAt: null,
          ojtLicenseId: req.user.licenseUserId,
          user: { branchUnitId: req.user.branchUnitId },
          eventUser: { event: { remarkDoc: { remark: "PENERBITAN" }, sector: { branchUnitId: req.user.branchUnitId } } },
        },
      },
      select: {
        id: true, status: true, createdAt: true,
        appRating: { select: { rating: { select: { rating: true } }, controlHour: true } },
        applicationDoc: { select: { id: true, number: true, user: { select: { nik: true, name: true } }, eventUser: { select: { event: { select: { event: true } } } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(letters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
