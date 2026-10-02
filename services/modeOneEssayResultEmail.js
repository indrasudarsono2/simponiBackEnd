import nodemailer from "nodemailer";
import prisma from "../lib/prisma.js";

let transporter;
function mailTransport() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_FROM) return null;
  if (!transporter) transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE || "").toLowerCase() === "true",
    auth: process.env.MAIL_USER && process.env.MAIL_PASSWORD
      ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD }
      : undefined,
  });
  return transporter;
}

export async function sendPendingModeOneEssayResults() {
  const mail = mailTransport();
  if (!mail) return;
  const staleClaim = new Date(Date.now() - 5 * 60_000);
  const pending = await prisma.finalScore.findMany({
    where: {
      essayResultEmailQueuedAt: { not: null },
      essayResultEmailSentAt: null,
      deletedAt: null,
      isInvalidated: false,
      theorySessionParticipant: null,
      OR: [{ essayResultEmailClaimedAt: null }, { essayResultEmailClaimedAt: { lt: staleClaim } }],
    },
    select: {
      id: true,
      essayScore: true,
      event: { select: { event: true } },
      appRating: { select: { rating: { select: { rating: true } } } },
      groupMember: { select: { userMember: { select: { name: true, email: true } } } },
    },
    take: 25,
    orderBy: { essayResultEmailQueuedAt: "asc" },
  });
  for (const score of pending) {
    const email = score.groupMember?.userMember?.email;
    if (!email) continue;
    const claim = await prisma.finalScore.updateMany({
      where: {
        id: score.id,
        essayResultEmailSentAt: null,
        OR: [{ essayResultEmailClaimedAt: null }, { essayResultEmailClaimedAt: { lt: staleClaim } }],
      },
      data: { essayResultEmailClaimedAt: new Date() },
    });
    if (claim.count !== 1) continue;
    const rating = score.appRating?.rating?.rating || "your rating";
    try {
      await mail.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: `PERFORMA Essay result — ${rating}`,
        text: `Hello ${score.groupMember?.userMember?.name || "participant"},\n\nYour Essay answers for ${rating} in ${score.event?.event || "your event"} have been scored.\n\nEssay score: ${Number(score.essayScore || 0).toFixed(2)} points toward the total theory score.\n\nPlease sign in to PERFORMA and continue the Multiple Choice examination for ${rating}.\n\nYour final theory result will be available after you submit Multiple Choice.`,
      });
      await prisma.finalScore.update({ where: { id: score.id }, data: { essayResultEmailSentAt: new Date() } });
    } catch (error) {
      console.error("Mode 1 Essay result email failed", { finalScoreId: score.id, error });
      await prisma.finalScore.updateMany({ where: { id: score.id, essayResultEmailSentAt: null }, data: { essayResultEmailClaimedAt: null } });
    }
  }
}
