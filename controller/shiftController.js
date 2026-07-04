import prisma from "../lib/prisma.js";

const parseTimeToMinutes = (value = "") => {
  const match = String(value).trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
};

const calculateDuration = (start, end) => {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === null || endMinutes === null) return null;

  const duration = endMinutes - startMinutes;
  return duration >= 0 ? duration : duration + 24 * 60;
};

const toTimeDate = (time) => new Date(`1970-01-01T${time}:00.000Z`);

const formatTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const serializeShift = (shift) => ({
  ...shift,
  start: formatTime(shift.start),
  end: formatTime(shift.end),
});

const sortShiftDetails = (shiftDetails = []) =>
  [...shiftDetails].sort((first, second) => {
    const firstStart = parseTimeToMinutes(first.start);
    const firstEnd = parseTimeToMinutes(first.end);
    const secondStart = parseTimeToMinutes(second.start);
    const secondEnd = parseTimeToMinutes(second.end);
    const firstIsOvernight =
      firstStart !== null && firstEnd !== null && firstStart > firstEnd;
    const secondIsOvernight =
      secondStart !== null && secondEnd !== null && secondStart > secondEnd;

    if (firstIsOvernight !== secondIsOvernight) {
      return firstIsOvernight ? -1 : 1;
    }

    return (firstStart ?? 0) - (secondStart ?? 0);
  });

const serializeShiftName = (shiftName) => ({
  ...shiftName,
  shifts: sortShiftDetails((shiftName.shifts || []).map(serializeShift)),
});

const normalizeShiftName = (value = "") => String(value).trim().toUpperCase();

const parseBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";

const normalizeDetails = (details = []) => {
  if (!Array.isArray(details)) return { details: [], errors: ["Shift details must be an array."] };

  const errors = [];
  const normalizedDetails = details.map((detail, index) => {
    const rowNumber = index + 1;
    const start = String(detail.start || "").trim();
    const end = String(detail.end || "").trim();
    const isControl = parseBoolean(detail.isControl);
    const duration = calculateDuration(start, end);

    if (duration === null) {
      errors.push(`Detail ${rowNumber}: start and end must use HH:mm format.`);
    } else if (isControl && duration > 120) {
      errors.push(`Detail ${rowNumber}: on duty duration maximum is 120 minutes.`);
    } else if (!isControl && duration < 45) {
      errors.push(`Detail ${rowNumber}: rest duration minimum is 45 minutes.`);
    }

    return {
      start,
      end,
      duration,
      isControl,
    };
  });

  if (normalizedDetails.length === 0) {
    errors.push("At least one shift detail is required.");
  }

  return { details: normalizedDetails, errors };
};

const getShifts = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    const shiftNames = await prisma.shiftName.findMany({
      where: {
        branchUnitId,
        deletedAt: null,
      },
      include: {
        shifts: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            start: "asc",
          },
        },
      },
      orderBy: {
        shift: "asc",
      },
    });

    res.json(shiftNames.map(serializeShiftName));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addShift = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const shift = normalizeShiftName(req.body.shift);
    const { details, errors } = normalizeDetails(req.body.shifts);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!shift) {
      errors.unshift("Shift name is required.");
    }

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const duplicateShiftName = await prisma.shiftName.findFirst({
      where: {
        branchUnitId,
        shift,
        deletedAt: null,
      },
    });

    if (duplicateShiftName) {
      return res.status(409).json({
        message: `Shift "${shift}" already exists in your branch unit.`,
      });
    }

    const createdShiftName = await prisma.shiftName.create({
      data: {
        branchUnitId,
        shift,
        shifts: {
          create: details.map((detail) => ({
            start: toTimeDate(detail.start),
            end: toTimeDate(detail.end),
            duration: detail.duration,
            isControl: detail.isControl,
          })),
        },
      },
      include: {
        shifts: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            start: "asc",
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      shift: serializeShiftName(createdShiftName),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateShift = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parseInt(req.params.id, 10);
    const shift = normalizeShiftName(req.body.shift);
    const { details, errors } = normalizeDetails(req.body.shifts);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid shift name ID." });
    }

    if (!shift) {
      errors.unshift("Shift name is required.");
    }

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const currentShiftName = await prisma.shiftName.findFirst({
      where: {
        id,
        branchUnitId,
        deletedAt: null,
      },
    });

    if (!currentShiftName) {
      return res.status(404).json({ message: "Shift not found." });
    }

    const duplicateShiftName = await prisma.shiftName.findFirst({
      where: {
        id: {
          not: id,
        },
        branchUnitId,
        shift,
        deletedAt: null,
      },
    });

    if (duplicateShiftName) {
      return res.status(409).json({
        message: `Shift "${shift}" already exists in your branch unit.`,
      });
    }

    const updatedShiftName = await prisma.$transaction(async (tx) => {
      await tx.shift.updateMany({
        where: {
          shiftNameId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      return tx.shiftName.update({
        where: {
          id,
        },
        data: {
          shift,
          shifts: {
            create: details.map((detail) => ({
              start: toTimeDate(detail.start),
              end: toTimeDate(detail.end),
              duration: detail.duration,
              isControl: detail.isControl,
            })),
          },
        },
        include: {
          shifts: {
            where: {
              deletedAt: null,
            },
            orderBy: {
              start: "asc",
            },
          },
        },
      });
    });

    res.json({
      success: true,
      shift: serializeShiftName(updatedShiftName),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteShift = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const id = parseInt(req.params.id, 10);

    if (!branchUnitId) {
      return res.status(401).json({ message: "Branch unit data is missing." });
    }

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid shift name ID." });
    }

    const shiftName = await prisma.shiftName.findFirst({
      where: {
        id,
        branchUnitId,
        deletedAt: null,
      },
    });

    if (!shiftName) {
      return res.status(404).json({ message: "Shift not found." });
    }

    await prisma.$transaction([
      prisma.shift.updateMany({
        where: {
          shiftNameId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
      prisma.shiftName.update({
        where: {
          id,
        },
        data: {
          deletedAt: new Date(),
        },
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getShifts, addShift, updateShift, deleteShift };
