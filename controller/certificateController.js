import prisma from "../lib/prisma.js";

export const verifyCertificate = async (req, res) => {
  const publicId = String(req.params.publicId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId)) {
    return res.status(404).json({ message: "Certificate not found." });
  }
  try {
    const certificate = await prisma.certificate.findUnique({
      where: { publicId },
      select: {
        number: true,
        status: true,
        snapshot: true,
        issuedAt: true,
        revokedAt: true,
        finalScore: {
          select: {
            deletedAt: true,
            isInvalidated: true,
            status: { select: { status: true } },
          },
        },
        userRating: { select: { deletedAt: true } },
      },
    });
    if (!certificate) return res.status(404).json({ message: "Certificate not found." });
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    const valid = certificate.status === "VALID" &&
      !certificate.finalScore.deletedAt &&
      !certificate.finalScore.isInvalidated &&
      certificate.finalScore.status?.status === "SUCCESS" &&
      !certificate.userRating.deletedAt;
    res.set("Cache-Control", "no-store");
    if (!valid) {
      return res.json({ status: "REVOKED", certificateNumber: certificate.number, revokedAt: certificate.revokedAt });
    }
    const { name, rating, eventName, startDate, finishDate, branch, branchUnit, theory, practical } = certificate.snapshot;
    return res.json({
      status: "VALID",
      certificateNumber: certificate.number,
      issuedAt: certificate.issuedAt,
      name, rating, eventName, startDate, finishDate, branch, branchUnit,
      theory, practical,
    });
  } catch {
    return res.status(500).json({ message: "Certificate verification is temporarily unavailable." });
  }
};
