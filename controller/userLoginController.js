import prisma from "../lib/prisma.js";

const auditContext = (req) => ({
  ipAddress: String(req.ip || req.socket?.remoteAddress || "").slice(0, 100) || null,
  userAgent: String(req.get?.("user-agent") || "").slice(0, 500) || null,
});

const getFailedUserLogins = async (_req, res) => {
  try {
    const loginStatuses = await prisma.userLoginSecurity.findMany({
      where: {
        failedLoginCount: { gt: 0 },
        user: { deletedAt: null },
      },
      select: {
        userNik: true,
        failedLoginCount: true,
        firstFailedAt: true,
        lastFailedAt: true,
        lockedUntil: true,
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
    const userNik = String(req.params.nik || "").trim();
    const existing = await prisma.userLoginSecurity.findUnique({
      where: { userNik },
      select: { failedLoginCount: true },
    });
    if (!existing || existing.failedLoginCount === 0) {
      return res.status(404).json({ success: false, message: "No failed login status was found for this user." });
    }

    await prisma.$transaction([
      prisma.userLoginSecurity.update({
        where: { userNik },
        data: {
          failedLoginCount: 0,
          firstFailedAt: null,
          lastFailedAt: null,
          lockedUntil: null,
        },
      }),
      prisma.authenticationAudit.create({
        data: {
          userNik,
          performedByNik: req.user.nik,
          eventType: "ACCOUNT_COOLDOWN_CLEARED",
          success: true,
          reason: "MANUAL_ADMIN_CLEAR",
          ...auditContext(req),
        },
      }),
    ]);

    return res.json({ success: true, message: "The login failure status has been cleared." });
  } catch (error) {
    console.error("Unable to clear failed login status", error);
    return res.status(500).json({ success: false, message: "Unable to clear the login failure status." });
  }
};

export { getFailedUserLogins, clearFailedUserLogin };
