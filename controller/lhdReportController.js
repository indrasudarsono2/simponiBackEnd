import prisma from "../lib/prisma.js";

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

const verifyDutyReportAccess = async (req, dutyReportId) => {
  const branchUnitId = req.user?.branchUnitId;
  if (!branchUnitId || !dutyReportId) return null;

  return prisma.dutyReport.findFirst({
    where: {
      id: dutyReportId,
      deletedAt: null,
      supervisorCwp: { is: { branchUnitId, deletedAt: null } },
    },
    select: { id: true },
  });
};

const parseOccurrenceTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const lhdReportInclude = {
  lhdBook: {
    select: { id: true, code: true, lhd: true },
  },
};

const getLhdBooks = async (_req, res) => {
  try {
    const rows = await prisma.lhdBook.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, lhd: true },
      orderBy: [{ code: "asc" }, { lhd: "asc" }],
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDutyReportLhdReports = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const rows = await prisma.lhdReport.findMany({
      where: { dutyReportId, deletedAt: null },
      include: lhdReportInclude,
      orderBy: [{ time: "desc" }, { createdAt: "desc" }],
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLhdReportRecap = async (req, res) => {
  try {
    const requestedBranchId = parsePositiveInt(req.query.branchId);
    const canUseBranchScope = (req.user?.menuNames || [])
      .map((menu) => String(menu || "").trim().toLowerCase())
      .includes("logbookgeneraladmin");
    const branchUnitId = req.user?.branchUnitId;
    const startDate = parseUtcDateBoundary(req.query.startDate);
    const endDate = parseUtcDateBoundary(req.query.endDate, true);

    if (requestedBranchId && !canUseBranchScope) {
      return res.status(403).json({ message: "Branch recap access is not allowed." });
    }

    if (!requestedBranchId && !branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!startDate || !endDate || startDate >= endDate) {
      return res.status(400).json({
        message: "Valid startDate and endDate are required.",
      });
    }

    const dutyReportFilter = requestedBranchId
      ? {
          deletedAt: null,
          supervisorCwp: {
            is: {
              branchUnit: { is: { branchId: requestedBranchId } },
            },
          },
        }
      : {
          deletedAt: null,
          supervisorCwp: { is: { branchUnitId, deletedAt: null } },
        };

    const rows = await prisma.lhdReport.findMany({
      where: {
        deletedAt: null,
        time: {
          gte: startDate,
          lt: endDate,
        },
        dutyReport: dutyReportFilter,
      },
      include: lhdReportInclude,
      orderBy: [{ time: "asc" }, { id: "asc" }],
    });

    res.json({ lhdReports: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const validatePayload = async (body) => {
  const lhdId = parsePositiveInt(body.lhdId);
  const time = parseOccurrenceTime(body.time);
  const message = String(body.message || "").trim();

  if (!lhdId || !time || !message) {
    return { error: "ICAO LHD code, occurrence time, and details are required." };
  }

  const lhdBook = await prisma.lhdBook.findFirst({
    where: { id: lhdId, deletedAt: null },
    select: { id: true },
  });

  if (!lhdBook) return { error: "The selected ICAO LHD code was not found." };
  return { data: { lhdId, time, message } };
};

const createLhdReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const payload = await validatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const row = await prisma.lhdReport.create({
      data: { dutyReportId, ...payload.data },
      include: lhdReportInclude,
    });

    res.status(201).json({ success: true, lhdReport: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateLhdReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const lhdReportId = parsePositiveInt(req.params.lhdReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport || !lhdReportId) {
      return res.status(404).json({ message: "LHD report not found." });
    }

    const existing = await prisma.lhdReport.findFirst({
      where: { id: lhdReportId, dutyReportId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "LHD report not found." });

    const payload = await validatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const row = await prisma.lhdReport.update({
      where: { id: lhdReportId },
      data: payload.data,
      include: lhdReportInclude,
    });

    res.json({ success: true, lhdReport: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLhdReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const lhdReportId = parsePositiveInt(req.params.lhdReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport || !lhdReportId) {
      return res.status(404).json({ message: "LHD report not found." });
    }

    const result = await prisma.lhdReport.updateMany({
      where: { id: lhdReportId, dutyReportId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ message: "LHD report not found." });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getLhdBooks,
  getLhdReportRecap,
  getDutyReportLhdReports,
  createLhdReport,
  updateLhdReport,
  deleteLhdReport,
};
