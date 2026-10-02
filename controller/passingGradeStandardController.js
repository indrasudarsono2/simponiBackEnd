import prisma from "../lib/prisma.js";

const getStandard = () => prisma.passingGradeStandard.findUnique({ where: { id: 1 } });

const getPassingGradeStandard = async (_req, res) => {
  try {
    const standard = await getStandard();
    if (!standard) return res.status(503).json({ message: "Passing grade standard is not configured." });
    return res.json(standard);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updatePassingGradeStandard = async (req, res) => {
  const theoryGrade = Number(req.body?.theoryGrade);
  const practicalGrade = Number(req.body?.practicalGrade);
  if (req.body?.theoryGrade == null || req.body?.practicalGrade == null
    || ![theoryGrade, practicalGrade].every((grade) => Number.isFinite(grade) && grade >= 0 && grade <= 100)) {
    return res.status(400).json({ message: "Theory and practical passing grades must be between 0 and 100." });
  }

  try {
    const cutoff = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const standard = await tx.passingGradeStandard.update({
        where: { id: 1 },
        data: { theoryGrade, practicalGrade },
      });
      const events = await tx.event.updateMany({
        where: { deletedAt: null, startDate: { gt: cutoff } },
        data: { passingGrade: theoryGrade, practicalPassingGrade: practicalGrade },
      });
      return { standard, updatedFutureEvents: events.count };
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export { getPassingGradeStandard, updatePassingGradeStandard };
