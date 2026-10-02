import prisma from "../lib/prisma.js";

export const scoreTheorySessionEssay = async (req, res, finalScore) => {
  try {
    const participant = await prisma.theorySessionParticipant.findUnique({
      where: { finalScoreId: finalScore.id },
      include: {
        session: { include: { event: { include: { eventQuestions: { where: { deletedAt: null, kindOfQuestionId: 1 } } } } } },
        eventUser: true,
        appRating: { select: { ratingId: true } },
      },
    });
    if (!participant || participant.session.status !== "ENDED") return res.status(409).json({ message: "The examination session has not ended." });
    const assignedChecker = await prisma.checkerGroup.findFirst({
      where: { checker: req.user.nik, deletedAt: null, groupId: finalScore.groupMember?.groupId },
      select: { id: true },
    });
    if (!assignedChecker) return res.status(403).json({ message: "You are not the assigned checker for this Essay." });
    const submitted = req.body?.essayCorrection;
    if (!Array.isArray(submitted) || !submitted.length) return res.status(400).json({ message: "All Essay scores are required." });
    const corrections = await prisma.essayCorrection.findMany({
      where: { finalScoreId: finalScore.id, deletedAt: null },
      select: { id: true, score: true, essay: { select: { value: true } } },
    });
    const requested = new Map(submitted.map((item) => [Number(item.essayCorrectionId), Number(item.score)]));
    if (requested.size !== corrections.length || submitted.length !== corrections.length || corrections.some((item) => {
      const score = requested.get(item.id);
      return item.score != null || !Number.isFinite(score) || score < 0 || score > Number(item.essay?.value || 0);
    })) return res.status(400).json({ message: "Provide one valid score for every Essay answer." });
    const maximum = corrections.reduce((sum, item) => sum + Number(item.essay?.value || 0), 0);
    if (maximum <= 0) return res.status(409).json({ message: "Essay maximum score is not configured." });
    const obtained = corrections.reduce((sum, item) => sum + requested.get(item.id), 0);
    const weight = Number(participant.questionSnapshot?.essayWeight || 0);
    const essayScore = obtained / maximum * 100 * weight;
    const total = essayScore + Number(finalScore.multipleChoiceScore || 0);
    const event = participant.session.event;
    const passed = total >= Number(event.passingGrade || 0);
    const priorAttempts = await prisma.finalScore.count({ where: { appRatingId: participant.appRatingId, eventId: event.id, id: { not: finalScore.id }, deletedAt: null, isInvalidated: false } });
    const requiresPractical = event.isPractical || event.isSimulator;
    const statusName = passed
      ? requiresPractical ? "WAITING PRACTICAL" : "SUCCESS"
      : event.difficulty === "EASY" || priorAttempts === 0 ? "RECHECK" : "FAILED";
    const status = await prisma.status.findFirst({ where: { status: statusName, deletedAt: null }, select: { id: true } });
    if (!status) return res.status(500).json({ message: `Status ${statusName} is not configured.` });
    const changed = await prisma.$transaction(async (tx) => {
      const claim = await tx.finalScore.updateMany({ where: { id: finalScore.id, statusId: finalScore.statusId, isInvalidated: false, deletedAt: null }, data: { statusId: status.id, essayScore, finalScore: total } });
      if (claim.count !== 1) return false;
      for (const item of corrections) {
        await tx.essayCorrection.update({ where: { id: item.id }, data: { score: requested.get(item.id), checker: req.user.nik } });
      }
      await tx.appRating.update({ where: { id: participant.appRatingId }, data: { statusId: status.id } });
      if (passed && !requiresPractical && participant.appRating?.ratingId && participant.eventUser.userNik) {
        const existing = await tx.userRating.findFirst({ where: { finalScoreId: finalScore.id, deletedAt: null }, select: { id: true } });
        if (!existing) await tx.userRating.create({ data: {
          ratingId: participant.appRating.ratingId,
          userId: participant.eventUser.userNik,
          finalScoreId: finalScore.id,
          expireddate: event.forExpiredDate,
        } });
      }
      return true;
    });
    if (!changed) return res.status(409).json({ message: "This Essay was already scored." });
    res.json({ success: true, finalScore: total, status: statusName, emailPending: true });
  } catch (error) {
    console.error("Mode 2 Essay scoring failed", error);
    res.status(500).json({ message: "Unable to score this Mode 2 Essay." });
  }
};
