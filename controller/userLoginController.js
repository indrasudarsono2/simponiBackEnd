import prisma from "../lib/prisma.js";

const auditContext = (req) => ({
  ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100) || null,
  userAgent: String(req.get?.("user-agent") || "").slice(0, 500) || null,
});

const getFailedUserLogins = async (_req, res) => {
  try {
    const loginStatuses = await prisma.userLoginSecurity.findMany({
      where: {
        OR: [{ failedLoginCount: { gt: 0 } }, { blockedAt: { not: null } }],
        user: { deletedAt: null },
      },
      select: {
        userNik: true,
        failedLoginCount: true,
        firstFailedAt: true,
        lastFailedAt: true,
        lockedUntil: true,
        blockedAt: true,
        updatedAt: true,
        user: {
          select: {
            name: true,
            licenseUserId: true,
            branch: { select: { id: true, branch: true } },
          },
        },
      },
      orderBy: [{ lockedUntil: "desc" }, { lastFailedAt: "desc" }],
    });

    const now = Date.now();
    const data = loginStatuses.map((item) => ({
      ...item,
      isAdminLocked: Boolean(item.blockedAt),
      isCooldownActive: Boolean(item.lockedUntil && item.lockedUntil.getTime() > now),
      retryAfterSeconds: item.lockedUntil
        ? Math.max(0, Math.ceil((item.lockedUntil.getTime() - now) / 1000))
        : 0,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error("Unable to load failed login statuses", error);
    return res.status(500).json({ success: false, message: "Unable to load user login statuses." });
  }
};

const clearFailedUserLogin = async (req, res) => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 100) return res.status(400).json({ success: false, message: 'Provide an unlock reason between 5 and 100 characters.' });
    const userNik = String(req.params.nik || "").trim();
    const existing = await prisma.userLoginSecurity.findUnique({
      where: { userNik },
      select: { failedLoginCount: true },
    });
    if (!existing || existing.failedLoginCount === 0) {
      return res.status(404).json({ success: false, message: "No failed login status was found for this user." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT nik FROM User WHERE nik = ${userNik} FOR UPDATE`;
      await tx.userLoginSecurity.update({
        where: { userNik },
        data: {
          failedLoginCount: 0,
          firstFailedAt: null,
          lastFailedAt: null,
          lockedUntil: null,
          blockedAt: null,
        },
      });
      await tx.authenticationAudit.create({
        data: {
          userNik,
          performedByNik: req.user.nik,
          eventType: "ACCOUNT_LOGIN_UNLOCKED",
          success: true,
          reason,
          ...auditContext(req),
        },
      });
    });

    return res.json({ success: true, message: "The login failure status has been cleared." });
  } catch (error) {
    console.error("Unable to clear failed login status", error);
    return res.status(500).json({ success: false, message: "Unable to clear the login failure status." });
  }
};

export { getFailedUserLogins, clearFailedUserLogin };
