import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

const parseReportTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validatePayload = (body) => {
  const time = parseReportTime(body.time);
  const report = String(body.report || "").trim();

  if (!time || !report) {
    return { error: "Report time and report details are required." };
  }

  return { data: { time, report } };
};

const getDutyReportOtherReports = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const rows = await prisma.otherReport.findMany({
      where: { dutyReportId, deletedAt: null },
      orderBy: [{ time: "desc" }, { createdAt: "desc" }],
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createOtherReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const payload = validatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const row = await prisma.otherReport.create({
      data: { dutyReportId, ...payload.data },
    });

    res.status(201).json({ success: true, otherReport: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateOtherReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const otherReportId = parsePositiveInt(req.params.otherReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport || !otherReportId) {
      return res.status(404).json({ message: "Other report not found." });
    }

    const existing = await prisma.otherReport.findFirst({
      where: { id: otherReportId, dutyReportId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Other report not found." });

    const payload = validatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });

    const row = await prisma.otherReport.update({
      where: { id: otherReportId },
      data: payload.data,
    });

    res.json({ success: true, otherReport: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteOtherReport = async (req, res) => {
  try {
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const otherReportId = parsePositiveInt(req.params.otherReportId);
    const dutyReport = await verifyDutyReportAccess(req, dutyReportId);

    if (!dutyReport || !otherReportId) {
      return res.status(404).json({ message: "Other report not found." });
    }

    const result = await prisma.otherReport.updateMany({
      where: { id: otherReportId, dutyReportId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ message: "Other report not found." });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getDutyReportOtherReports,
  createOtherReport,
  updateOtherReport,
  deleteOtherReport,
};
