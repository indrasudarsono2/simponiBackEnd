import prisma from "../lib/prisma.js";
import { triggerImmediateOnGoingIssueEscalation } from "../workers/escalationWorker.js";

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseUtcDateBoundary = (value, endOfDay = false) => {
  const rawValue = String(value || "").trim();
  const dateTimeMatch = rawValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (dateTimeMatch) {
    const year = Number(dateTimeMatch[1]);
    const month = Number(dateTimeMatch[2]);
    const day = Number(dateTimeMatch[3]);
    const hours = Number(dateTimeMatch[4]);
    const minutes = Number(dateTimeMatch[5]);
    const seconds = Number(dateTimeMatch[6] || 0);
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      date.getUTCHours() !== hours ||
      date.getUTCMinutes() !== minutes ||
      date.getUTCSeconds() !== seconds
    ) {
      return null;
    }

    if (endOfDay) date.setUTCMinutes(date.getUTCMinutes() + 1);

    return date;
  }

  const match = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);

  return date;
};

const getUserBranchId = async (req) => {
  if (req.user?.branchId) return req.user.branchId;

  if (!req.user?.nik) return null;

  const user = await prisma.user.findUnique({
    where: { nik: req.user.nik },
    select: {
      branchId: true,
      branchUnit: { select: { branchId: true } },
    },
  });

  return user?.branchId || user?.branchUnit?.branchId || null;
};

const verifyDutyReportAccess = async (req, dutyReportId) => {
  const branchUnitId = req.user?.branchUnitId;
  if (!branchUnitId || !dutyReportId) return null;

  return prisma.dutyReport.findFirst({
    where: {
      id: dutyReportId,
      deletedAt: null,
      supervisorCwp: { is: { branchUnitId } },
    },
    select: { id: true },
  });
};

const issueInclude = {
  equipment: true,
  reporterUser: { select: { nik: true, name: true } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  },
  dutyReportLinks: {
    where: { deletedAt: null },
    select: {
      id: true,
      dutyReportId: true,
      attachedAt: true,
    },
  },
  escalations: {
    where: { deletedAt: null },
    orderBy: { dueAt: "asc" },
    include: {
      escalationLevel: true,
      emails: {
        select: {
          id: true,
          recipientNik: true,
          status: true,
          attempts: true,
          sentAt: true,
          lastError: true,
        },
      },
    },
  },
};

const addMinutes = (value, minutes) =>
  new Date(value.getTime() + Number(minutes) * 60 * 1000);

const getNextCronExecution = (dueAt) => {
  const interval = 15 * 60 * 1000;
  return new Date(Math.ceil(dueAt.getTime() / interval) * interval);
};

const buildEscalationSchedule = (issue, levels) => {
  if (!issue.start) return [];

  return levels.map((level) => {
    const dueAt = addMinutes(issue.start, level.time);
    const escalation = issue.escalations.find(
      (item) => item.escalationLevelId === level.id,
    );

    let status = escalation?.status || (dueAt <= new Date() ? "DUE" : "WAITING");
    if ((issue.isClosed || !issue.escalationEnabled) && !escalation) {
      status = "CANCELLED";
    }

    return {
      escalationLevelId: level.id,
      level: level.level,
      time: level.time,
      dueAt,
      estimatedExecutionAt: getNextCronExecution(dueAt),
      status,
      triggeredAt: escalation?.triggeredAt || null,
      emails: escalation?.emails || [],
      actors: level.escalationActors.map((item) => ({
        nik: item.escalationActor?.nik || item.actor,
        name: item.escalationActor?.name || item.actor,
        emailConfigured: Boolean(item.escalationActor?.email),
      })),
    };
  });
};

const getOnGoingIssues = async (req, res) => {
  try {
    const branchId = await getUserBranchId(req);
    if (!branchId) {
      return res.status(401).json({ message: "Branch data is missing." });
    }

    const [issues, equipments, escalationLevels] = await Promise.all([
      prisma.onGoingIssue.findMany({
        where: { branchId, deletedAt: null },
        include: issueInclude,
        orderBy: [{ isClosed: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.equipment.findMany({
        where: { deletedAt: null },
        select: { id: true, equipment: true },
        orderBy: { equipment: "asc" },
      }),
      prisma.escalationLevel.findMany({
        where: { branchId, deletedAt: null },
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
      }),
    ]);

    res.json({
      issues: issues.map((issue) => ({
        ...issue,
        escalationSchedule: buildEscalationSchedule(issue, escalationLevels),
      })),
      equipments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOnGoingIssueRecap = async (req, res) => {
  try {
    const requestedBranchId = parsePositiveInt(req.query.branchId);
    const canUseBranchScope = (req.user?.menuNames || [])
      .map((menu) => String(menu || "").trim().toLowerCase())
      .includes("logbookgeneraladmin");
    const branchId = requestedBranchId || await getUserBranchId(req);
    const branchUnitId = req.user?.branchUnitId;
    const startDate = parseUtcDateBoundary(req.query.startDate);
    const endDate = parseUtcDateBoundary(req.query.endDate, true);

    if (requestedBranchId && !canUseBranchScope) {
      return res.status(403).json({ message: "Branch recap access is not allowed." });
    }

    if (!branchId || (!requestedBranchId && !branchUnitId)) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!startDate || !endDate || startDate >= endDate) {
      return res.status(400).json({
        message: "Valid startDate and endDate are required.",
      });
    }

    const branchUnitIssueFilter = requestedBranchId
      ? {}
      : {
          OR: [
            {
              dutyReportLinks: {
                some: {
                  deletedAt: null,
                  dutyReport: {
                    deletedAt: null,
                    supervisorCwp: { is: { branchUnitId, deletedAt: null } },
                  },
                },
              },
            },
            {
              reporterUser: {
                is: {
                  branchUnitId,
                  deletedAt: null,
                },
              },
            },
          ],
        };

    const dutyReportLinkFilter = requestedBranchId
      ? {
          deletedAt: null,
          dutyReport: {
            deletedAt: null,
            supervisorCwp: {
              is: {
                branchUnit: { is: { branchId } },
              },
            },
          },
        }
      : {
          deletedAt: null,
          dutyReport: {
            deletedAt: null,
            supervisorCwp: { is: { branchUnitId, deletedAt: null } },
          },
        };

    const issues = await prisma.onGoingIssue.findMany({
      where: {
        branchId,
        deletedAt: null,
        start: {
          gte: startDate,
          lt: endDate,
        },
        ...branchUnitIssueFilter,
      },
      include: {
        equipment: { select: { id: true, equipment: true } },
        reporterUser: { select: { nik: true, name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            message: true,
            createdAt: true,
          },
        },
        dutyReportLinks: {
          where: dutyReportLinkFilter,
          orderBy: { attachedAt: "asc" },
          select: {
            id: true,
            attachedAt: true,
            dutyReport: {
              select: {
                id: true,
                shiftDate: true,
                spv: { select: { nik: true, name: true } },
                supervisorCwp: {
                  select: {
                    supervisor: true,
                    cwpSupervisors: {
                      select: {
                        cwp: { select: { cwp: true } },
                      },
                    },
                  },
                },
                shiftName: { select: { id: true, shift: true } },
              },
            },
          },
        },
      },
      orderBy: [{ start: "asc" }, { id: "asc" }],
    });

    res.json({ issues });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createOnGoingIssue = async (req, res) => {
  try {
    const branchId = await getUserBranchId(req);
    const reporter = req.user?.nik;
    const dutyReportId = parsePositiveInt(req.body.dutyReportId);
    const equipmentId = parsePositiveInt(req.body.equipmentId);
    const other = String(req.body.other || "").trim();
    const initialMessage = String(req.body.message || "").trim();

    if (!branchId || !reporter) {
      return res.status(401).json({ message: "User branch data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Duty report is required." });
    }

    if (!equipmentId && !other) {
      return res.status(400).json({
        message: "Select equipment or describe the ongoing issue.",
      });
    }

    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);
    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    if (equipmentId) {
      const equipment = await prisma.equipment.findFirst({
        where: { id: equipmentId, deletedAt: null },
        select: { id: true },
      });
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found." });
      }
    }

    const issue = await prisma.$transaction(async (tx) => {
      const createdIssue = await tx.onGoingIssue.create({
        data: {
          branchId,
          reporter,
          equipmentId,
          other: other || null,
          start: new Date(),
          messages: initialMessage
            ? { create: { message: initialMessage } }
            : undefined,
        },
      });

      await tx.dutyReportOnGoingIssue.create({
        data: {
          dutyReportId,
          onGoingIssueId: createdIssue.id,
        },
      });

      return tx.onGoingIssue.findUnique({
        where: { id: createdIssue.id },
        include: issueInclude,
      });
    });

    triggerImmediateOnGoingIssueEscalation(issue.id)
      .then((result) => {
        console.log(
          `Immediate ongoing issue escalation completed: ${JSON.stringify({
            onGoingIssueId: issue.id,
            ...result,
          })}`,
        );
      })
      .catch((error) => {
        console.error("Immediate ongoing issue escalation failed:", error);
      });

    res.status(201).json({ success: true, issue });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const attachOnGoingIssue = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const onGoingIssueId = parsePositiveInt(req.body.onGoingIssueId);
    const branchId = await getUserBranchId(req);

    if (!dutyReportId || !onGoingIssueId) {
      return res.status(400).json({ message: "Duty report and issue are required." });
    }

    const [dutyReport, issue] = await Promise.all([
      verifyDutyReportAccess(req, dutyReportId),
      prisma.onGoingIssue.findFirst({
        where: { id: onGoingIssueId, branchId, deletedAt: null, isClosed: false },
        select: { id: true },
      }),
    ]);

    if (!dutyReport || !issue) {
      return res.status(404).json({ message: "Duty report or active issue not found." });
    }

    const existingLink = await prisma.dutyReportOnGoingIssue.findUnique({
      where: { dutyReportId_onGoingIssueId: { dutyReportId, onGoingIssueId } },
    });

    const link = existingLink
      ? await prisma.dutyReportOnGoingIssue.update({
          where: { id: existingLink.id },
          data: { deletedAt: null, attachedAt: new Date() },
        })
      : await prisma.dutyReportOnGoingIssue.create({
          data: { dutyReportId, onGoingIssueId },
        });

    res.json({ success: true, link });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const detachOnGoingIssue = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const onGoingIssueId = parsePositiveInt(req.params.onGoingIssueId);

    if (!dutyReportId || !onGoingIssueId) {
      return res.status(400).json({ message: "Duty report and issue are required." });
    }

    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);
    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    await prisma.dutyReportOnGoingIssue.updateMany({
      where: { dutyReportId, onGoingIssueId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addOnGoingIssueMessage = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    const branchId = await getUserBranchId(req);
    const message = String(req.body.message || "").trim();

    if (!id || !message) {
      return res.status(400).json({ message: "A message is required." });
    }

    const issue = await prisma.onGoingIssue.findFirst({
      where: { id, branchId, deletedAt: null, isClosed: false },
      select: { id: true },
    });
    if (!issue) {
      return res.status(404).json({ message: "Active issue not found." });
    }

    const createdMessage = await prisma.message.create({
      data: { onGoingIssueId: id, message },
    });

    res.status(201).json({ success: true, message: createdMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const closeOnGoingIssue = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    const branchId = await getUserBranchId(req);

    if (!id) {
      return res.status(400).json({ message: "Issue is required." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const closed = await tx.onGoingIssue.updateMany({
        where: { id, branchId, deletedAt: null, isClosed: false },
        data: { isClosed: true, finish: new Date() },
      });

      if (closed.count) {
        await tx.escalationEmail.updateMany({
          where: {
            escalation: { is: { onGoingIssueId: id } },
            status: { in: ["PENDING", "RETRY"] },
          },
          data: { status: "CANCELLED" },
        });
        await tx.escalation.updateMany({
          where: { onGoingIssueId: id, status: "QUEUED" },
          data: { status: "CANCELLED" },
        });
      }

      return closed;
    });

    if (!result.count) {
      return res.status(404).json({ message: "Active issue not found." });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cancelOnGoingIssueEscalation = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    const branchId = await getUserBranchId(req);

    if (!id) {
      return res.status(400).json({ message: "Issue is required." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.onGoingIssue.updateMany({
        where: {
          id,
          branchId,
          deletedAt: null,
          escalationEnabled: true,
        },
        data: {
          escalationEnabled: false,
          escalationCancelledAt: new Date(),
        },
      });

      if (cancelled.count) {
        await tx.escalationEmail.updateMany({
          where: {
            escalation: { is: { onGoingIssueId: id } },
            status: { in: ["PENDING", "RETRY", "PROCESSING"] },
          },
          data: { status: "CANCELLED", lockedAt: null },
        });
        await tx.escalation.updateMany({
          where: { onGoingIssueId: id, status: "QUEUED" },
          data: { status: "CANCELLED" },
        });
      }

      return cancelled;
    });

    if (!result.count) {
      return res.status(404).json({
        message: "Active escalation was not found for this issue.",
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const cancelOnGoingIssueEscalationLevel = async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    const escalationLevelId = parsePositiveInt(req.params.levelId);
    const branchId = await getUserBranchId(req);

    if (!id || !escalationLevelId) {
      return res.status(400).json({
        message: "Issue and escalation level are required.",
      });
    }

    const [issue, level, existingEscalation] = await Promise.all([
      prisma.onGoingIssue.findFirst({
        where: {
          id,
          branchId,
          deletedAt: null,
          escalationEnabled: true,
        },
        select: { id: true, start: true, branchId: true },
      }),
      prisma.escalationLevel.findFirst({
        where: { id: escalationLevelId, branchId, deletedAt: null },
        select: { id: true, time: true },
      }),
      prisma.escalation.findUnique({
        where: {
          onGoingIssueId_escalationLevelId: {
            onGoingIssueId: id,
            escalationLevelId,
          },
        },
        select: { id: true, status: true },
      }),
    ]);

    if (!issue || !level) {
      return res.status(404).json({
        message: "Active issue or escalation level was not found.",
      });
    }

    if (existingEscalation?.status === "SENT") {
      return res.status(409).json({
        message: "This escalation level has already been sent and cannot be cancelled.",
      });
    }

    const dueAt = issue.start && level.time !== null
      ? addMinutes(issue.start, level.time)
      : null;

    await prisma.$transaction(async (tx) => {
      const escalation = existingEscalation
        ? await tx.escalation.update({
            where: { id: existingEscalation.id },
            data: { status: "CANCELLED" },
          })
        : await tx.escalation.create({
            data: {
              onGoingIssueId: issue.id,
              escalationLevelId: level.id,
              branchId: issue.branchId,
              dueAt,
              status: "CANCELLED",
            },
          });

      await tx.escalationEmail.updateMany({
        where: {
          escalationId: escalation.id,
          status: { in: ["PENDING", "RETRY", "PROCESSING"] },
        },
        data: { status: "CANCELLED", lockedAt: null },
      });
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getOnGoingIssues,
  getOnGoingIssueRecap,
  createOnGoingIssue,
  attachOnGoingIssue,
  detachOnGoingIssue,
  addOnGoingIssueMessage,
  closeOnGoingIssue,
  cancelOnGoingIssueEscalation,
  cancelOnGoingIssueEscalationLevel,
};
