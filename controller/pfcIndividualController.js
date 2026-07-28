import prisma from "../lib/prisma.js";
import { postMember as buildMemberStatistic } from "./checkerStatisticController.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const parseJakartaDate = (value, endOfDay = false) => {
  if (!DATE_PATTERN.test(String(value || ""))) return null;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${value}T${time}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getOptions = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { branch: "asc" },
      select: { id: true, branch: true }
    });

    if (!req.query.branchId) return res.json({ branches, users: [] });
    const branchId = Number(req.query.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Invalid branch selection." });
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        branchId,
        professionInBranch: {
          is: {
            deletedAt: null,
            profession: { is: { deletedAt: null } }
          }
        }
      },
      orderBy: [{ name: "asc" }, { nik: "asc" }],
      select: {
        nik: true,
        name: true,
        licenseUserId: true,
        professionInBranch: {
          select: { profession: { select: { profession: true } } }
        }
      }
    });

    const nonDoctorUsers = users.filter(
      (user) => String(user.professionInBranch?.profession?.profession || "").trim().toUpperCase() !== "DOCTOR"
    );
    res.json({ branches, users: nonDoctorUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getIndividualStatistic = async (req, res) => {
  try {
    const branchId = Number(req.body?.branchId);
    const userNik = String(req.body?.userNik || "").trim();
    const startDateValue = req.body?.startDate;
    const endDateValue = req.body?.endDate;
    if (!Number.isInteger(branchId) || branchId <= 0 || !userNik) {
      return res.status(400).json({ message: "Branch and user are required." });
    }

    let eventCreatedAt;
    if (startDateValue || endDateValue) {
      const startDate = parseJakartaDate(startDateValue);
      const endDate = parseJakartaDate(endDateValue, true);
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Both dates are required and must use YYYY-MM-DD format." });
      }
      if (startDate > endDate) {
        return res.status(400).json({ message: "Start date cannot be later than end date." });
      }
      eventCreatedAt = { gte: startDate, lte: endDate };
    }

    const user = await prisma.user.findFirst({
      where: { nik: userNik, branchId, deletedAt: null },
      select: {
        eventUsers: {
          where: {
            deletedAt: null,
            event: {
              is: {
                deletedAt: null,
                ...(eventCreatedAt ? { createdAt: eventCreatedAt } : {})
              }
            }
          },
          select: { id: true }
        }
      }
    });
    if (!user) return res.status(404).json({ message: "User was not found in the selected branch." });

    req.body.eventUserId = user.eventUsers.map((item) => item.id);
    return buildMemberStatistic(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getOptions, getIndividualStatistic };
