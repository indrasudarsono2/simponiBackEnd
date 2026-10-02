import nodemailer from "nodemailer";
import prisma from "../lib/prisma.js";

let transporter;
const mailTransport = () => {
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
};

export const sendPendingTheoryResults = async () => {
  const mail = mailTransport();
  if (!mail) return;
  const staleClaim = new Date(Date.now() - 5 * 60_000);
  const pending = await prisma.theorySessionParticipant.findMany({
    where: {
      finalScoreId: { not: null },
      resultEmailSentAt: null,
      OR: [{ resultEmailClaimedAt: null }, { resultEmailClaimedAt: { lt: staleClaim } }],
      session: { status: "ENDED" },
      finalScore: { status: { status: { in: ["SUCCESS", "FAILED", "RECHECK", "WAITING PRACTICAL"] } } },
    },
    include: {
      eventUser: { include: { user: { select: { name: true, email: true } }, event: { select: { event: true, passingGrade: true } } } },
      appRating: { select: { rating: { select: { rating: true } } } },
      finalScore: { select: { finalScore: true } },
    },
    take: 25,
  });
  for (const participant of pending) {
    const email = participant.eventUser.user?.email;
    if (!email) continue;
    const claimed = await prisma.theorySessionParticipant.updateMany({
      where: { id: participant.id, resultEmailSentAt: null, OR: [{ resultEmailClaimedAt: null }, { resultEmailClaimedAt: { lt: staleClaim } }] },
      data: { resultEmailClaimedAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    const score = Number(participant.finalScore?.finalScore || 0);
    const passingGrade = Number(participant.eventUser.event.passingGrade || 0);
    try {
      await mail.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: `PERFORMA theory examination result — ${participant.eventUser.event.event}`,
        text: `Hello ${participant.eventUser.user?.name || participant.eventUser.userNik},\n\nYour theory examination for ${participant.appRating?.rating?.rating || "your rating"} in ${participant.eventUser.event.event} is complete.\n\nTheory score: ${score.toFixed(2)}\nPassing grade: ${passingGrade.toFixed(2)}\nResult: ${score >= passingGrade ? "PASS" : "BELOW PASSING GRADE"}\n\nSign in to PERFORMA for your detailed examination record.`,
      });
      await prisma.theorySessionParticipant.update({ where: { id: participant.id }, data: { resultEmailSentAt: new Date() } });
    } catch (error) {
      console.error("Theory result email failed", { participantId: participant.id, error });
      await prisma.theorySessionParticipant.update({ where: { id: participant.id }, data: { resultEmailClaimedAt: null } });
    }
  }
};
