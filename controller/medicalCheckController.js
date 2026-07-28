import prisma from "../lib/prisma.js";

const selectMedicalCheck = {
  id: true,
  doctor: true,
  employee: true,
  bloodPressure: true,
  unNormalCondition: true,
  isFit: true,
  createdAt: true,
  updatedAt: true,
  doctorUser: {
    select: {
      nik: true,
      name: true,
    },
  },
  employeeUser: {
    select: {
      nik: true,
      name: true,
      branchId: true,
      branch: {
        select: {
          id: true,
          branch: true,
        },
      },
      branchUnit: {
        select: {
          id: true,
          unit: true,
        },
      },
      professionInBranch: {
        select: {
          id: true,
          profession: {
            select: {
              id: true,
              profession: true,
            },
          },
        },
      },
    },
  },
};

const normalizePressure = (systolic, diastolic) => {
  const cleanSystolic = String(systolic || "").trim();
  const cleanDiastolic = String(diastolic || "").trim();

  if (!cleanSystolic || !cleanDiastolic) {
    return null;
  }

  if (!/^\d{2,3}$/.test(cleanSystolic) || !/^\d{2,3}$/.test(cleanDiastolic)) {
    return null;
  }

  return `${cleanSystolic}/${cleanDiastolic}`;
};

const getMyMedicalChecks = async (req, res) => {
  try {
    const medicalChecks = await prisma.medicalCheck.findMany({
      where: {
        deletedAt: null,
        employee: req.user.nik,
      },
      select: selectMedicalCheck,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ medicalChecks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createMedicalCheck = async (req, res) => {
  try {
    const { systolic, diastolic } = req.body;
    const bloodPressure = normalizePressure(systolic, diastolic);

    if (!bloodPressure) {
      return res.status(400).json({
        message: "Systolic and diastolic blood pressure are required",
      });
    }

    const pendingMedicalCheck = await prisma.medicalCheck.findFirst({
      where: {
        deletedAt: null,
        employee: req.user.nik,
        doctor: null,
      },
      select: {
        id: true,
      },
    });

    if (pendingMedicalCheck) {
      return res.status(409).json({
        message:
          "Previous medical test is still waiting for doctor verification",
      });
    }

    const medicalCheck = await prisma.medicalCheck.create({
      data: {
        employee: req.user.nik,
        bloodPressure,
        isFit: null,
      },
      select: selectMedicalCheck,
    });

    res.status(201).json({ success: true, medicalCheck });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBranchMedicalChecks = async (req, res) => {
  try {
    const now = new Date();
    const medicalCheckUpdatedFrom = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const medicalChecks = await prisma.medicalCheck.findMany({
      where: {
        deletedAt: null,
        OR: [
          { doctor: null },
          {
            updatedAt: {
              gte: medicalCheckUpdatedFrom,
              lte: now,
            },
          },
        ],
        employeeUser: {
          is: {
            branchId: req.user.branchId,
            deletedAt: null,
          },
        },
      },
      select: selectMedicalCheck,
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json({ medicalChecks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDoctorDashboard = async (req, res) => {
  try {
    const pendingUsers = await prisma.medicalCheck.count({
      where: {
        deletedAt: null,
        doctor: null,
        employee: { not: null },
        employeeUser: {
          is: {
            branchId: req.user.branchId,
            deletedAt: null,
          },
        },
      },
    });

    res.json({ pendingUsers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMedicalCheckHistory = async (req, res) => {
  try {
    const medicalChecks = await prisma.medicalCheck.findMany({
      where: {
        deletedAt: null,
        doctor: { not: null },
        employeeUser: {
          is: {
            branchId: req.user.branchId,
            deletedAt: null,
          },
        },
      },
      select: {
        ...selectMedicalCheck,
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, editedBy: true, reason: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ medicalChecks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateMedicalCheckHistory = async (req, res) => {
  try {
    const medicalCheckId = Number(req.params.id);
    const { systolic, diastolic, isFit, unNormalCondition, reason, confirmation, expectedUpdatedAt } = req.body;
    const bloodPressure = normalizePressure(systolic, diastolic);
    const cleanReason = String(reason || "").trim();
    const cleanCondition = String(unNormalCondition || "").trim() || null;
    const expectedDate = new Date(expectedUpdatedAt);

    if (!Number.isInteger(medicalCheckId) || medicalCheckId <= 0) {
      return res.status(400).json({ message: "Invalid medical check id." });
    }
    if (!bloodPressure) {
      return res.status(400).json({ message: "Valid systolic and diastolic values are required." });
    }
    if (typeof isFit !== "boolean") {
      return res.status(400).json({ message: "A Fit or Unfit result is required." });
    }
    if (!isFit && !cleanCondition) {
      return res.status(400).json({ message: "A doctor statement is required for an Unfit result." });
    }
    if (cleanCondition && cleanCondition.length > 2000) {
      return res.status(400).json({ message: "Doctor statement is too long." });
    }
    if (cleanReason.length < 10 || cleanReason.length > 1000) {
      return res.status(400).json({ message: "Edit reason must contain between 10 and 1000 characters." });
    }
    if (confirmation !== "UPDATE MEDICAL RECORD") {
      return res.status(400).json({ message: "The confirmation phrase is incorrect." });
    }
    if (Number.isNaN(expectedDate.getTime())) {
      return res.status(400).json({ message: "The medical record version is invalid. Refresh and try again." });
    }

    const existing = await prisma.medicalCheck.findFirst({
      where: {
        id: medicalCheckId,
        deletedAt: null,
        doctor: { not: null },
        employeeUser: {
          is: {
            branchId: req.user.branchId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        bloodPressure: true,
        isFit: true,
        unNormalCondition: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Verified medical record was not found in this branch." });
    }

    const medicalCheck = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.medicalCheck.updateMany({
        where: {
          id: medicalCheckId,
          deletedAt: null,
          updatedAt: expectedDate,
        },
        data: {
          doctor: req.user.nik,
          bloodPressure,
          isFit,
          unNormalCondition: cleanCondition,
          updatedAt: new Date(),
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("MEDICAL_RECORD_CHANGED");
      }

      await tx.medicalCheckRevision.create({
        data: {
          medicalCheckId,
          editedBy: req.user.nik,
          reason: cleanReason,
          previousBloodPressure: existing.bloodPressure,
          newBloodPressure: bloodPressure,
          previousIsFit: existing.isFit,
          newIsFit: isFit,
          previousUnNormalCondition: existing.unNormalCondition,
          newUnNormalCondition: cleanCondition,
        },
      });

      return tx.medicalCheck.findUnique({
        where: { id: medicalCheckId },
        select: selectMedicalCheck,
      });
    });

    res.json({ success: true, medicalCheck });
  } catch (error) {
    if (error.message === "MEDICAL_RECORD_CHANGED") {
      return res.status(409).json({ message: "This medical record changed after you opened it. Refresh and review the latest data." });
    }
    res.status(500).json({ message: error.message });
  }
};

const verifyMedicalCheck = async (req, res) => {
  try {
    const { id } = req.params;
    const { isFit, unNormalCondition } = req.body;
    const medicalCheckId = Number(id);

    if (!Number.isInteger(medicalCheckId)) {
      return res.status(400).json({ message: "Invalid medical check id" });
    }

    if (typeof isFit !== "boolean") {
      return res.status(400).json({ message: "isFit must be boolean" });
    }

    const existingMedicalCheck = await prisma.medicalCheck.findFirst({
      where: {
        id: medicalCheckId,
        deletedAt: null,
        employeeUser: {
          is: {
            branchId: req.user.branchId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingMedicalCheck) {
      return res.status(404).json({
        message: "Medical check not found in this branch",
      });
    }

    const medicalCheck = await prisma.medicalCheck.update({
      where: {
        id: medicalCheckId,
      },
      data: {
        doctor: req.user.nik,
        isFit,
        unNormalCondition: unNormalCondition
          ? String(unNormalCondition).trim()
          : null,
      },
      select: selectMedicalCheck,
    });

    res.json({ success: true, medicalCheck });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export {
  getMyMedicalChecks,
  createMedicalCheck,
  getDoctorDashboard,
  getMedicalCheckHistory,
  updateMedicalCheckHistory,
  getBranchMedicalChecks,
  verifyMedicalCheck,
};
