import prisma from '../lib/prisma.js';
import { roomRecoveryWhere } from '../services/defaultModeOneRoom.js';

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();

const summarizeMember = (eventUser, passingGrade) => {
  const documents = [...(eventUser.applicationDocs || [])].sort((a, b) => b.id - a.id);
  const ratings = new Map();
  for (const document of documents) {
    for (const appRating of document.appRatings || []) {
      const ratingId = appRating.ratingId ?? appRating.id;
      if (ratings.has(ratingId)) continue;
      const score = appRating.finalScores?.[0] || null;
      const status = normalizeStatus(appRating.status?.status);
      const theoryPassed = passingGrade != null && score?.finalScore != null &&
        Number(score.finalScore) >= Number(passingGrade) &&
        normalizeStatus(score.status?.status) !== 'CHECKING ESSAY';
      ratings.set(ratingId, {
        id: appRating.id,
        rating: appRating.rating?.rating || 'Unknown rating',
        status: status || 'NOT STARTED',
        submitted: true,
        verified: document.verifications?.isValid === true && !document.verifications?.deletedAt,
        theoryStarted: Boolean(score?.essayStartedAt || score?.multipleChoiceStartedAt),
        theoryPassed,
        waitingPractical: theoryPassed && ['WAITING PRACTICAL', 'PRACTICAL RECHECK'].includes(status),
        passed: theoryPassed && status === 'SUCCESS',
      });
    }
  }
  const ratingItems = [...ratings.values()];
  return {
    nik: eventUser.userNik,
    name: eventUser.user?.name || eventUser.userNik || 'Unknown user',
    submitted: documents.length > 0,
    verified: documents.some((document) => document.verifications?.isValid === true && !document.verifications?.deletedAt),
    theoryStarted: ratingItems.some((rating) => rating.theoryStarted),
    theoryPassed: ratingItems.some((rating) => rating.theoryPassed),
    waitingPractical: ratingItems.some((rating) => rating.waitingPractical),
    fullyPassed: ratingItems.length > 0 && ratingItems.every((rating) => rating.passed),
    ratings: ratingItems,
  };
};

const getCheckerAdminDashboard = async (req, res) => {
  try {
    const branchUnitId = Number(req.user.branchUnitId);
    if (!Number.isSafeInteger(branchUnitId) || branchUnitId <= 0) {
      return res.status(403).json({ message: 'A branch unit is required to view this dashboard.' });
    }
    const sectors = await prisma.sector.findMany({
      where: { branchUnitId, deletedAt: null },
      select: {
        id: true,
        sector: true,
        subBranchUnitRatings: {
          where: { deletedAt: null, rating: { deletedAt: null } },
          select: { ratingId: true, rating: { select: { rating: true } } },
        },
      },
      orderBy: [{ sector: 'asc' }, { id: 'asc' }],
    });
    const sectorIds = sectors.map((sector) => sector.id);
    const eventSelect = {
        id: true, event: true, createdAt: true, startDate: true, finishDate: true,
        sector: { select: { sector: true } },
        passingGrade: true,
        eventUsers: {
          where: { deletedAt: null },
          select: {
            userNik: true,
            user: { select: { name: true } },
            applicationDocs: {
              where: { deletedAt: null },
              select: {
                id: true,
                verifications: { select: { isValid: true, deletedAt: true } },
                appRatings: {
                  where: { deletedAt: null },
                  select: {
                    id: true, ratingId: true,
                    rating: { select: { rating: true } },
                    status: { select: { status: true } },
                    finalScores: {
                      where: { deletedAt: null, isInvalidated: false },
                      orderBy: [{ id: 'desc' }], take: 1,
                      select: {
                        finalScore: true, essayStartedAt: true, multipleChoiceStartedAt: true,
                        status: { select: { status: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
    };
    const eventScope = { sectorId: { in: sectorIds }, deletedAt: null };
    const events = sectorIds.length ? await prisma.event.findMany({
        where: eventScope, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5, select: eventSelect,
      }) : [];
    const ratingIds = new Set(sectors.flatMap((sector) => sector.subBranchUnitRatings.map((item) => item.ratingId).filter((id) => id != null)));
    return res.json({
      missingRoomCount: await prisma.eventUser.count({ where: roomRecoveryWhere(branchUnitId) }),
      ratingCount: ratingIds.size,
      sectors: sectors.map((sector) => ({
        id: sector.id,
        sector: sector.sector,
        ratings: [...new Set(sector.subBranchUnitRatings.map((item) => item.rating?.rating).filter(Boolean))].sort(),
      })),
      events: events.map((event) => {
        const members = [...new Map(event.eventUsers.filter((item) => item.userNik).map((item) => [item.userNik, item])).values()]
          .map((item) => summarizeMember(item, event.passingGrade))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          id: event.id, name: event.event, sector: event.sector?.sector,
          startDate: event.startDate, finishDate: event.finishDate,
          counts: {
            assigned: members.length,
            submitted: members.filter((member) => member.submitted).length,
            verified: members.filter((member) => member.verified).length,
            theoryStarted: members.filter((member) => member.theoryStarted).length,
            theoryPassed: members.filter((member) => member.theoryPassed).length,
            waitingPractical: members.filter((member) => member.waitingPractical).length,
            fullyPassed: members.filter((member) => member.fullyPassed).length,
          },
          members,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export { getCheckerAdminDashboard };
