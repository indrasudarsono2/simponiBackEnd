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
        updatedAt: {
          gte: medicalCheckUpdatedFrom,
          lte: now,
        },
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
  getBranchMedicalChecks,
  verifyMedicalCheck,
};
