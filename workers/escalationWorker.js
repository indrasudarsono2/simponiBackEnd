import "dotenv/config";
import nodemailer from "nodemailer";
import { pathToFileURL } from "url";
import prisma from "../lib/prisma.js";

const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [15, 30, 60, 180, 360];

const addMinutes = (value, minutes) =>
  new Date(value.getTime() + Number(minutes) * 60 * 1000);

const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(value)
    : "-";

const getIssueStatus = (issue) =>
  issue.isClosed ? "Closed" : "Open / On Going";

const getIssueMessages = (issue) => {
  if (!issue.messages?.length) {
    return ["No related messages have been recorded."];
  }

  return issue.messages.map((message, index) => [
    `${index + 1}. ${formatDateTime(message.createdAt)}`,
    `   ${message.message || "-"}`,
  ].join("\n"));
};

const getIssueTitle = (issue) =>
  issue.equipment?.equipment || issue.other || `Ongoing Issue #${issue.id}`;

const buildEmail = ({ issue, level, dueAt }) => {
  const title = getIssueTitle(issue);
  const subject = `[Escalation Level ${level.level}] ${title}`;
  const body = [
    `Ongoing Issue Escalation - Level ${level.level}`,
    "",
    "An ongoing issue has reached the configured escalation threshold.",
    "",
    "ONGOING ISSUE DETAIL",
    `Issue ID: ${issue.id}`,
    `Issue: ${title}`,
    `Equipment: ${issue.equipment?.equipment || "-"}`,
    `Other / Remark: ${issue.other || "-"}`,
    `Status: ${getIssueStatus(issue)}`,
    `Branch: ${issue.branch?.branch || issue.branchId || "-"}`,
    `Reporter: ${issue.reporterUser?.name || issue.reporter || "-"}`,
    `Reporter NIK: ${issue.reporterUser?.nik || issue.reporter || "-"}`,
    `Started: ${formatDateTime(issue.start)}`,
    `Finished: ${formatDateTime(issue.finish)}`,
    `Created: ${formatDateTime(issue.createdAt)}`,
    `Last Updated: ${formatDateTime(issue.updatedAt)}`,
    "",
    "ESCALATION DETAIL",
    `Escalation Level: ${level.level}`,
    `Threshold: ${level.time} minutes from issue start`,
    `Due: ${formatDateTime(dueAt)}`,
    `Escalation Enabled: ${issue.escalationEnabled ? "Yes" : "No"}`,
    `Escalation Cancelled At: ${formatDateTime(issue.escalationCancelledAt)}`,
    "",
    "RELATED MESSAGES",
    ...getIssueMessages(issue),
    "",
    "Please review and follow up through the operational duty-report system.",
  ].join("\n");

  return { subject, body };
};

async function queueDueEscalations(now = new Date(), onGoingIssueId = null) {
  const issues = await prisma.onGoingIssue.findMany({
    where: {
      ...(onGoingIssueId ? { id: onGoingIssueId } : {}),
      isClosed: false,
      escalationEnabled: true,
      deletedAt: null,
      start: { not: null },
    },
    include: {
      branch: true,
      equipment: true,
      reporterUser: { select: { nik: true, name: true } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, message: true, createdAt: true },
      },
    },
  });

  let queued = 0;

  for (const issue of issues) {
    const levels = await prisma.escalationLevel.findMany({
      where: {
        branchId: issue.branchId,
        deletedAt: null,
        time: { not: null },
      },
      orderBy: { level: "asc" },
      include: {
        escalationActors: {
          where: { deletedAt: null },
          include: {
            escalationActor: {
              select: { nik: true, name: true, email: true },
            },
          },
        },
      },
    });

    for (const level of levels) {
      const dueAt = addMinutes(issue.start, level.time);
      if (dueAt > now) continue;

      const recipients = level.escalationActors
        .map((actor) => actor.escalationActor)
        .filter((actor) => actor?.email)
        .filter(
          (actor, index, actors) =>
            actors.findIndex((item) => item.email === actor.email) === index,
        );
      const email = buildEmail({ issue, level, dueAt });

      try {
        await prisma.escalation.create({
          data: {
            onGoingIssueId: issue.id,
            escalationLevelId: level.id,
            messageId: issue.messages[issue.messages.length - 1]?.id || null,
            branchId: issue.branchId,
            dueAt,
            triggeredAt: now,
            status: recipients.length ? "QUEUED" : "NO_RECIPIENTS",
            emails: recipients.length
              ? {
                  create: recipients.map((recipient) => ({
                    recipientNik: recipient.nik,
                    recipientEmail: recipient.email,
                    subject: email.subject,
                    body: email.body,
                    status: "PENDING",
                    nextAttemptAt: now,
                  })),
                }
              : undefined,
          },
        });
        queued += 1;
      } catch (error) {
        if (error?.code !== "P2002") throw error;
      }
    }
  }

  return queued;
}

function createTransporter() {
  const port = Number(process.env.MAIL_PORT || 587);
  if (!process.env.MAIL_HOST || !process.env.MAIL_FROM) return null;

  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port,
    secure:
      String(process.env.MAIL_SECURE || "").toLowerCase() === "true"
      || port === 465,
    auth:
      process.env.MAIL_USER && process.env.MAIL_PASSWORD
        ? {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
          }
        : undefined,
  });
}

async function refreshEscalationStatus(escalationId) {
  const emails = await prisma.escalationEmail.findMany({
    where: { escalationId },
    select: { status: true },
  });
  if (!emails.length) return;

  const status = emails.every((email) => email.status === "SENT")
    ? "SENT"
    : emails.some((email) => email.status === "FAILED")
      ? "FAILED"
      : "QUEUED";

  await prisma.escalation.update({
    where: { id: escalationId },
    data: { status },
  });
}

async function sendPendingEmails(now = new Date(), onGoingIssueId = null) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn("SMTP is not configured; escalation emails remain queued.");
    return { sent: 0, failed: 0, skipped: true };
  }

  const staleLock = new Date(now.getTime() - 30 * 60 * 1000);
  const emails = await prisma.escalationEmail.findMany({
    where: {
      ...(onGoingIssueId
        ? { escalation: { is: { onGoingIssueId } } }
        : {}),
      attempts: { lt: MAX_EMAIL_ATTEMPTS },
      OR: [
        {
          status: { in: ["PENDING", "RETRY"] },
          nextAttemptAt: { lte: now },
        },
        {
          status: "PROCESSING",
          lockedAt: { lt: staleLock },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    const claimed = await prisma.escalationEmail.updateMany({
      where: {
        id: email.id,
        OR: [
          { status: { in: ["PENDING", "RETRY"] } },
          { status: "PROCESSING", lockedAt: { lt: staleLock } },
        ],
      },
      data: { status: "PROCESSING", lockedAt: now },
    });
    if (!claimed.count) continue;

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email.recipientEmail,
        subject: email.subject,
        text: email.body,
      });
      await prisma.escalationEmail.update({
        where: { id: email.id },
        data: {
          status: "SENT",
          attempts: { increment: 1 },
          sentAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const attempts = email.attempts + 1;
      const exhausted = attempts >= MAX_EMAIL_ATTEMPTS;
      const retryMinutes =
        RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
      await prisma.escalationEmail.update({
        where: { id: email.id },
        data: {
          status: exhausted ? "FAILED" : "RETRY",
          attempts,
          nextAttemptAt: addMinutes(now, retryMinutes),
          lockedAt: null,
          lastError: String(error?.message || error).slice(0, 5000),
        },
      });
      failed += 1;
    }

    await refreshEscalationStatus(email.escalationId);
  }

  return { sent, failed, skipped: false };
}

export async function sendEscalationTestEmail(recipientEmail) {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured. MAIL_HOST and MAIL_FROM are required.");
  }

  const issue = await prisma.onGoingIssue.findFirst({
    where: {
      deletedAt: null,
      start: { not: null },
    },
    orderBy: { createdAt: "desc" },
    include: {
      branch: true,
      equipment: true,
      reporterUser: { select: { nik: true, name: true } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, message: true, createdAt: true },
      },
    },
  });

  if (!issue) {
    throw new Error("No ongoing issue sample data was found.");
  }

  const level = await prisma.escalationLevel.findFirst({
    where: {
      branchId: issue.branchId,
      deletedAt: null,
      time: { not: null },
    },
    orderBy: { level: "asc" },
  });

  if (!level) {
    throw new Error("No escalation level sample data was found for the issue branch.");
  }

  const dueAt = addMinutes(issue.start, level.time);
  const email = buildEmail({ issue, level, dueAt });
  const subject = `[TEST] ${email.subject}`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: recipientEmail,
    subject,
    text: email.body,
  });

  return {
    recipientEmail,
    subject,
    issueId: issue.id,
    escalationLevelId: level.id,
  };
}

export async function runEscalationWorker() {
  const startedAt = new Date();
  const queued = await queueDueEscalations(startedAt);
  const delivery = await sendPendingEmails(new Date());
  return { queued, ...delivery };
}

export async function triggerImmediateOnGoingIssueEscalation(onGoingIssueId) {
  const startedAt = new Date();
  const queued = await queueDueEscalations(startedAt, onGoingIssueId);
  const delivery = await sendPendingEmails(new Date(), onGoingIssueId);
  return { queued, ...delivery };
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const testRecipient = process.argv[2] === "--test-email"
      ? process.argv[3]
      : null;

    const result = testRecipient
      ? await sendEscalationTestEmail(testRecipient)
      : await runEscalationWorker();

    console.log(`Escalation worker completed: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error("Escalation worker failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
