import prisma from "../lib/prisma.js";

const parsePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const formatLocalDate = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatUtcDate = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseUtcDateTime = (dateValue, timeValue) => {
  const dateMatch = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!dateMatch || !timeMatch) return null;

  return new Date(Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
  ));
};

const formatTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const formatShiftTime = (value) => {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
};

const parseClockToMinutes = (value) => {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
};

const sortShiftDetails = (shiftDetails = []) =>
  [...shiftDetails].sort((first, second) => {
    const firstStart = parseClockToMinutes(formatShiftTime(first.start));
    const firstEnd = parseClockToMinutes(formatShiftTime(first.end));
    const secondStart = parseClockToMinutes(formatShiftTime(second.start));
    const secondEnd = parseClockToMinutes(formatShiftTime(second.end));
    const firstOvernight =
      firstStart !== null && firstEnd !== null && firstStart > firstEnd;
    const secondOvernight =
      secondStart !== null && secondEnd !== null && secondStart > secondEnd;

    if (firstOvernight !== secondOvernight) {
      return firstOvernight ? -1 : 1;
    }

    return (firstStart ?? 0) - (secondStart ?? 0);
  });

const getControlWindows = (shiftName) =>
  sortShiftDetails(shiftName?.shifts || [])
    .filter((shiftDetail) => shiftDetail.isControl)
    .map((shiftDetail) => {
      const start = formatShiftTime(shiftDetail.start);
      const end = formatShiftTime(shiftDetail.end);

      if (!start || !end) return null;

      return {
        id: shiftDetail.id,
        start,
        end,
        startMinutes: parseClockToMinutes(start),
        endMinutes: parseClockToMinutes(end),
      };
    })
    .filter((window) => window?.startMinutes !== null && window?.endMinutes !== null);

const isTimeInsideWindow = (timeValue, window) => {
  if (!window) return true;

  const timeMinutes = parseClockToMinutes(timeValue);
  if (timeMinutes === null) return false;

  if (window.startMinutes <= window.endMinutes) {
    return timeMinutes >= window.startMinutes && timeMinutes <= window.endMinutes;
  }

  return timeMinutes >= window.startMinutes || timeMinutes <= window.endMinutes;
};

const findWindowForTime = (timeValue, windows) =>
  windows.find((window) => isTimeInsideWindow(timeValue, window)) || null;

const formatWindows = (windows) =>
  windows.map((window) => `${window.start} - ${window.end}`).join(", ");

const getFitControllers = async (branchUnitId) => {
  const now = new Date();
  const medicalCheckValidFrom = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const fitMedicalChecks = await prisma.medicalCheck.findMany({
    where: {
      deletedAt: null,
      isFit: true,
      updatedAt: {
        gte: medicalCheckValidFrom,
      },
      employeeUser: {
        branchUnitId,
        deletedAt: null,
      },
    },
    include: {
      employeeUser: {
        select: {
          nik: true,
          name: true,
          branchUnitId: true,
          userRatings: {
            where: {
              deletedAt: null,
              expireddate: {
                gte: now,
              },
              ratingId: {
                not: null,
              },
              rating: {
                is: {
                  deletedAt: null,
                },
              },
            },
            select: {
              ratingId: true,
              expireddate: true,
              rating: {
                select: {
                  id: true,
                  rating: true,
                },
              },
            },
            orderBy: {
              expireddate: "desc",
            },
          },
          ielp: {
            where: {
              deletedAt: null,
              isConfirmed: true,
              expired: {
                gte: now,
              },
            },
            select: {
              id: true,
              expired: true,
              level: true,
            },
            orderBy: {
              expired: "desc",
            },
          },
          medex: {
            where: {
              deletedAt: null,
              isConfirmed: true,
              expired: {
                gte: now,
              },
            },
            select: {
              id: true,
              expired: true,
              institution: true,
            },
            orderBy: {
              expired: "desc",
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const controllerMap = new Map();

  for (const medicalCheck of fitMedicalChecks) {
    if (!medicalCheck.employee || !medicalCheck.employeeUser) continue;
    if (controllerMap.has(medicalCheck.employee)) continue;

    controllerMap.set(medicalCheck.employee, {
      nik: medicalCheck.employee,
      name: medicalCheck.employeeUser.name,
      medicalCheckId: medicalCheck.id,
      medicalCheckStatus: "FIT",
      validRatingIds: [
        ...new Set(
          (medicalCheck.employeeUser.userRatings || [])
            .map((userRating) => userRating.ratingId)
            .filter((ratingId) => Number.isInteger(ratingId)),
        ),
      ],
      userRatings: medicalCheck.employeeUser.userRatings || [],
      hasValidIelp: (medicalCheck.employeeUser.ielp || []).length > 0,
      hasValidMedex: (medicalCheck.employeeUser.medex || []).length > 0,
      latestIelp: medicalCheck.employeeUser.ielp?.[0] || null,
      latestMedex: medicalCheck.employeeUser.medex?.[0] || null,
    });
  }

  return [...controllerMap.values()].filter(
    (controller) =>
      controller.validRatingIds.length > 0 &&
      controller.hasValidIelp &&
      controller.hasValidMedex,
  );
};

const getAssignedControllerNiksForDutyDate = async (
  branchUnitId,
  dutyReportId,
  shiftDate,
) => {
  if (!branchUnitId || !dutyReportId || !shiftDate) return new Set();

  const assignedLogBooks = await prisma.logBook.findMany({
    where: {
      deletedAt: null,
      userNik: {
        not: null,
      },
      dutyReportId: {
        not: dutyReportId,
      },
      dutyReport: {
        is: {
          shiftDate,
          deletedAt: null,
          supervisorCwp: {
            is: {
              branchUnitId,
              deletedAt: null,
            },
          },
        },
      },
    },
    select: {
      userNik: true,
    },
  });

  return new Set(
    assignedLogBooks
      .map((logBook) => logBook.userNik)
      .filter((userNik) => Boolean(userNik)),
  );
};

const getPositionLogSetup = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = req.user?.nik;
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);

    if (!branchUnitId || !supervisor) {
      return res.status(401).json({ message: "User data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Duty report is required." });
    }

    const dutyReport = await prisma.dutyReport.findFirst({
      where: {
        id: dutyReportId,
        supervisor,
        deletedAt: null,
        supervisorCwp: {
          is: {
            branchUnitId,
            deletedAt: null,
          },
        },
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
                cwp: {
                  is: {
                    deletedAt: null,
                  },
                },
              },
              include: {
                cwp: {
                  include: {
                    logBooks: {
                      where: {
                        dutyReportId,
                        deletedAt: null,
                      },
                      include: {
                        user: {
                          select: {
                            nik: true,
                            name: true,
                          },
                        },
                      },
                    },
                    rating: true,
                  },
                },
              },
              orderBy: {
                id: "asc",
              },
            },
          },
        },
        shiftName: {
          include: {
            shifts: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const assignedControllerNiks = await getAssignedControllerNiksForDutyDate(
      branchUnitId,
      dutyReportId,
      dutyReport.shiftDate,
    );
    const controllers = (await getFitControllers(branchUnitId)).filter(
      (controller) => !assignedControllerNiks.has(controller.nik),
    );
    const cwpRows = (dutyReport.supervisorCwp?.cwpSupervisors || []).map((cwpSupervisor) => {
      return {
        cwpSupervisorId: cwpSupervisor.id,
        cwp: cwpSupervisor.cwp,
        logBooks: (cwpSupervisor.cwp?.logBooks || []).map((logBook) => ({
          id: logBook.id,
          userNik: logBook.userNik,
          controllerName: logBook.user?.name || null,
          isFinal: logBook.isFinal,
          timeIn: formatTime(logBook.timeIn),
          timeInDate: formatUtcDate(logBook.timeIn),
          timeOut: formatTime(logBook.timeOut),
          timeOutDate: formatUtcDate(logBook.timeOut),
          duration: logBook.duration,
        })),
        controllers: controllers
          .filter((controller) =>
            controller.validRatingIds.includes(cwpSupervisor.cwp?.ratingId),
          )
          .map((controller) => ({
            nik: controller.nik,
            name: controller.name,
            medicalCheckId: controller.medicalCheckId,
            medicalCheckStatus: controller.medicalCheckStatus,
            ielpExpired: controller.latestIelp?.expired || null,
            medexExpired: controller.latestMedex?.expired || null,
          })),
      };
    });

    res.json({
      dutyReport: {
        ...dutyReport,
        shiftDate: formatLocalDate(dutyReport.shiftDate),
      },
      cwpRows,
      controllers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const savePositionLogs = async (req, res) => {
  try {
    const branchUnitId = req.user?.branchUnitId;
    const supervisor = req.user?.nik;
    const dutyReportId = parsePositiveInt(req.params.dutyReportId);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (!branchUnitId || !supervisor) {
      return res.status(401).json({ message: "User data is missing." });
    }

    if (!dutyReportId) {
      return res.status(400).json({ message: "Duty report is required." });
    }

    const dutyReport = await prisma.dutyReport.findFirst({
      where: {
        id: dutyReportId,
        supervisor,
        deletedAt: null,
        supervisorCwp: {
          is: {
            branchUnitId,
            deletedAt: null,
          },
        },
      },
      include: {
        supervisorCwp: {
          include: {
            cwpSupervisors: {
              where: {
                deletedAt: null,
                cwp: {
                  is: {
                    deletedAt: null,
                  },
                },
              },
              select: {
                id: true,
                cwpId: true,
                cwp: {
                  select: {
                    ratingId: true,
                  },
                },
              },
            },
          },
        },
        shiftName: {
          include: {
            shifts: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!dutyReport) {
      return res.status(404).json({ message: "Duty report not found." });
    }

    const dutyReportDate = formatLocalDate(dutyReport.shiftDate);
    const controlWindows = getControlWindows(dutyReport.shiftName);
    const controlWindowLabel = formatWindows(controlWindows);
    const allowedCwpIds = new Set(
      (dutyReport.supervisorCwp?.cwpSupervisors || [])
        .map((cwpSupervisor) => cwpSupervisor.cwpId)
        .filter((cwpId) => Number.isInteger(cwpId)),
    );
    const cwpRatingMap = new Map(
      (dutyReport.supervisorCwp?.cwpSupervisors || [])
        .filter((cwpSupervisor) => Number.isInteger(cwpSupervisor.cwpId))
        .map((cwpSupervisor) => [
          cwpSupervisor.cwpId,
          cwpSupervisor.cwp?.ratingId || null,
        ]),
    );
    const fitControllers = await getFitControllers(branchUnitId);
    const fitControllerNiks = new Set(fitControllers.map((controller) => controller.nik));
    const fitControllerMap = new Map(
      fitControllers.map((controller) => [controller.nik, controller]),
    );
    const assignedControllerNiks = await getAssignedControllerNiksForDutyDate(
      branchUnitId,
      dutyReportId,
      dutyReport.shiftDate,
    );
    const errors = [];
    const normalizedRows = rows
      .map((row, index) => {
        const rowNumber = index + 1;
        const id = parsePositiveInt(row.id);
        const cwpId = parsePositiveInt(row.cwpId);
        const userNik = String(row.userNik || "").trim();
        const isFinal = row.isFinal === true;
        const timeIn = parseUtcDateTime(row.timeInDate || dutyReportDate, row.timeIn);
        const timeOut = parseUtcDateTime(row.timeOutDate || dutyReportDate, row.timeOut);
        const hasSubmittedDuration =
          row.duration !== null &&
          row.duration !== undefined &&
          row.duration !== "";
        const submittedDuration = hasSubmittedDuration ? Number(row.duration) : null;
        const calculatedDuration =
          timeIn && timeOut
            ? Math.max(0, (timeOut.getTime() - timeIn.getTime()) / 60000)
            : null;
        const duration = Number.isFinite(submittedDuration)
          ? submittedDuration
          : calculatedDuration;
        const timeInWindow = findWindowForTime(row.timeIn, controlWindows);
        const timeOutWindow = findWindowForTime(row.timeOut, controlWindows);
        const shiftId =
          timeInWindow && (!timeOutWindow || timeInWindow.id === timeOutWindow.id)
            ? timeInWindow.id
            : null;

        if (!cwpId || !allowedCwpIds.has(cwpId)) {
          errors.push(`Row ${rowNumber}: invalid CWP.`);
        }

        if (!userNik || !fitControllerNiks.has(userNik)) {
          errors.push(
            `Row ${rowNumber}: controller must have FIT medical test within 12 hours, valid IELP, and valid MEDEX.`,
          );
        } else if (assignedControllerNiks.has(userNik)) {
          errors.push(
            `Row ${rowNumber}: controller is already assigned to another duty report on the same day.`,
          );
        } else {
          const cwpRatingId = cwpRatingMap.get(cwpId);
          const controller = fitControllerMap.get(userNik);

          if (!cwpRatingId || !controller?.validRatingIds.includes(cwpRatingId)) {
            errors.push(
              `Row ${rowNumber}: controller does not have valid rating for selected CWP.`,
            );
          }
        }

        if (!timeIn) {
          errors.push(`Row ${rowNumber}: time in is required.`);
        } else if (isFinal && !timeOut) {
          errors.push(`Row ${rowNumber}: final row requires time out.`);
        } else {
          if (!controlWindows.length) {
            errors.push(`Row ${rowNumber}: no control shift window is available.`);
          } else if (!timeInWindow) {
            errors.push(
              `Row ${rowNumber}: time in must be inside control window ${controlWindowLabel}.`,
            );
          }

          if (row.timeOut && controlWindows.length && !timeOutWindow) {
            errors.push(
              `Row ${rowNumber}: time out must be inside control window ${controlWindowLabel}.`,
            );
          }

          if (timeInWindow && timeOutWindow && timeInWindow.id !== timeOutWindow.id) {
            errors.push(
              `Row ${rowNumber}: time in and time out must be in the same control shift.`,
            );
          }
        }

        return {
          id,
          cwpId,
          userNik,
          isFinal,
          shiftId,
          timeIn,
          timeOut,
          duration,
        };
      })
      .filter(
        (row) => row.cwpId && row.userNik && row.shiftId && row.timeIn,
      );

    const controllerCwpMap = new Map();

    for (const row of normalizedRows) {
      const assignedCwpId = controllerCwpMap.get(row.userNik);

      if (assignedCwpId && assignedCwpId !== row.cwpId) {
        errors.push(
          `Controller ${row.userNik} can only be assigned to one CWP.`,
        );
        break;
      }

      controllerCwpMap.set(row.userNik, row.cwpId);
    }

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    await prisma.$transaction(async (tx) => {
      for (const row of normalizedRows) {
        if (row.id) continue;

        const existingLogBook = await tx.logBook.findFirst({
          where: {
            dutyReportId,
            cwpId: row.cwpId,
            userNik: row.userNik,
            shiftId: row.shiftId,
            timeIn: row.timeIn,
            deletedAt: null,
          },
          select: {
            id: true,
          },
          orderBy: {
            id: "desc",
          },
        });

        if (existingLogBook) {
          row.id = existingLogBook.id;
        }
      }

      const submittedLogBookIds = normalizedRows
        .map((row) => row.id)
        .filter((id) => Number.isInteger(id));

      await tx.logBook.updateMany({
        where: {
          dutyReportId,
          deletedAt: null,
          ...(submittedLogBookIds.length
            ? {
                id: {
                  notIn: submittedLogBookIds,
                },
              }
            : {}),
        },
        data: {
          deletedAt: new Date(),
        },
      });

      for (const row of normalizedRows) {
        if (row.id) {
          const existingLogBook = await tx.logBook.findFirst({
            where: {
              id: row.id,
              dutyReportId,
              cwpId: row.cwpId,
            },
            select: {
              id: true,
            },
          });

          if (!existingLogBook) {
            throw new Error(`Logbook row ${row.id} is not valid for this duty report.`);
          }

          await tx.logBook.update({
            where: {
              id: existingLogBook.id,
            },
            data: {
              userNik: row.userNik,
              supervisor,
              isFinal: row.isFinal,
              shiftId: row.shiftId,
              timeIn: row.timeIn,
              timeOut: row.timeOut,
              duration: row.duration,
              deletedAt: null,
            },
          });
        } else {
          await tx.logBook.create({
            data: {
              userNik: row.userNik,
              supervisor,
              dutyReportId,
              cwpId: row.cwpId,
              isFinal: row.isFinal,
              shiftId: row.shiftId,
              timeIn: row.timeIn,
              timeOut: row.timeOut,
              duration: row.duration,
            },
          });
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { getPositionLogSetup, savePositionLogs };
