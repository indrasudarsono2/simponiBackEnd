import prisma from '../lib/prisma.js';

const conflict = message => Object.assign(new Error(message), { status: 409 });

export async function readLiveConfiguration(db, eventId) {
  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      id: true, event: true, theoryMode: true, difficulty: true,
      eventQuestions: { where: { deletedAt: null, kindOfQuestionId: { in: [1, 2] } }, select: { id: true, kindOfQuestionId: true, quantity: true, persentage: true, minutes: true } },
      sector: { select: { id: true, sector: true, subBranchUnitRatings: {
        where: { deletedAt: null, rating: { deletedAt: null } }, orderBy: { id: 'asc' },
        select: { id: true, ratingId: true, rating: { select: { rating: true } }, questionGroups: {
          where: { deletedAt: null, kindOfQuestionId: { in: [1, 2] } }, orderBy: { id: 'asc' },
          select: { id: true, group: true, quantity: true, kindOfQuestionId: true, mandatoryRating: { select: { mandatoryItemId: true } } },
        } } } } },
    },
  });
  if (!event) throw Object.assign(new Error('Event not found.'), { status: 404 });
  const configuration = await db.matsConfiguration.findUnique({ where: { id: 1 }, select: { mode: true, quantity: true } });
  const allocations = await db.matsCategoryAllocation.findMany({ where: { deletedAt: null }, select: { mandatoryItemId: true, quantity: true } });
  const mandatoryRatings = await db.mandatoryRating.findMany({
    where: { ratingId: { in: event.sector?.subBranchUnitRatings.map(r => r.ratingId).filter(Boolean) || [] }, deletedAt: null, mandatoryItemId: { not: null } },
    select: { ratingId: true, mandatoryItemId: true },
  });
  for (const rating of event.sector?.subBranchUnitRatings || []) {
    rating.mandatoryItemIds = [...new Set(mandatoryRatings.filter(r => r.ratingId === rating.ratingId).map(r => r.mandatoryItemId))];
  }
  return { ...event, mats: { mode: configuration?.mode === 'CATEGORY_PORTION' ? 'CATEGORY_PORTION' : 'SEPARATE_POOL', quantity: Number(configuration?.quantity || 0), allocations } };
}

export function configurationIssues(snapshot) {
  const issues = [];
  const settings = snapshot.eventQuestions;
  if (!settings.length || new Set(settings.map(s => s.kindOfQuestionId)).size !== settings.length || settings.some(s => ![1, 2].includes(s.kindOfQuestionId))) issues.push('Configure at least one examination part, with no duplicate question types.');
  if (Math.abs(settings.reduce((sum, s) => sum + Number(s.persentage || 0), 0) - 1) > 0.000001) issues.push('Weights must total 100%.');
  const ratings = snapshot.sector?.subBranchUnitRatings || [];
  if (!ratings.length) issues.push('The sector has no ratings.');
  for (const s of settings) {
    if (!Number.isInteger(s.quantity) || s.quantity < 1 || !Number.isFinite(s.persentage) || s.persentage < 0 || s.persentage > 1) issues.push('Question counts and weights must be valid.');
    if (snapshot.theoryMode === 'MODE_1' && (!Number.isInteger(s.minutes) || s.minutes < 1)) issues.push('Mode 1 requires a duration for each examination part.');
    if (!s.persentage) continue;
    for (const r of ratings) {
      const groups = r.questionGroups.filter(g => g.kindOfQuestionId === s.kindOfQuestionId);
      if (!groups.length || groups.some(g => !Number.isInteger(g.quantity) || g.quantity < 1)) issues.push(`${r.rating?.rating}: configure valid ${s.kindOfQuestionId === 1 ? 'Essay' : 'Multiple Choice'} groups.`);
      if (groups.reduce((sum, g) => sum + Number(g.quantity || 0), 0) !== s.quantity) issues.push(`${r.rating?.rating}: group quantities must match the configured ${s.kindOfQuestionId === 1 ? 'Essay' : 'Multiple Choice'} count (${s.quantity}).`);
      if (s.kindOfQuestionId === 2 && snapshot.mats.mode === 'CATEGORY_PORTION') {
        for (const g of groups) {
          const portion = snapshot.mats.allocations.find(a => a.mandatoryItemId === g.mandatoryRating?.mandatoryItemId)?.quantity || 0;
          if (portion > g.quantity) issues.push(`${r.rating?.rating}: MATS allocation exceeds the quantity for ${g.group}.`);
        }
      }
    }
  }
  return [...new Set(issues)];
}

export async function examinationHasStarted(db, eventId) {
  const [draft, participant, score, monitor] = await Promise.all([
    db.modeOneExamDraft.findFirst({ where: { eventId, OR: [{ deadlineAt: { not: null } }, { submittedAt: { not: null } }] }, select: { id: true } }),
    db.theorySessionParticipant.findFirst({ where: { eventUser: { eventId }, joinedAt: { not: null } }, select: { id: true } }),
    db.finalScore.findFirst({ where: { eventId }, select: { id: true } }),
    db.monitorTime.findFirst({ where: { eventQuestion: { eventId } }, select: { id: true } }),
  ]);
  return Boolean(draft || participant || score || monitor);
}

export async function assertConfigurationEditable(db, eventId) {
  const locked = await db.eventConfigurationVersion.findFirst({ where: { eventId, lockedAt: { not: null } }, select: { id: true } });
  if (locked || await examinationHasStarted(db, eventId)) throw conflict('Examination configuration is locked because an examination has started.');
}

export async function captureConfiguration({ eventId, actorNik = null, actorName = null, reason, source = 'FINALIZED' }) {
  return prisma.$transaction(async db => {
    // Serialize finalization, edits, and first examination access on the event row.
    await db.event.update({ where: { id: eventId }, data: { updatedAt: new Date() } });
    const previous = await db.eventConfigurationVersion.findFirst({ where: { eventId }, orderBy: { version: 'desc' } });
    if (source === 'BACKFILL_CURRENT' && previous) return previous;
    if (source === 'FINALIZED') await assertConfigurationEditable(db, eventId);
    if (previous && !String(reason || '').trim()) throw conflict('A reason is required for a new configuration version.');
    const snapshot = await readLiveConfiguration(db, eventId);
    const issues = configurationIssues(snapshot);
    if (source === 'FINALIZED' && issues.length) throw conflict(issues.join(' '));
    const started = await examinationHasStarted(db, eventId);
    return db.eventConfigurationVersion.create({ data: {
      eventId, version: (previous?.version || 0) + 1, source, actorNik, actorName,
      reason: String(reason || 'Initial configuration finalized.').trim(), snapshot: { ...snapshot, captureIssues: issues },
      lockedAt: started ? new Date() : null,
    } });
  });
}

export async function getExamConfiguration(eventId, { actorNik = null, trigger = 'EXAMINATION_OPEN' } = {}) {
  return prisma.$transaction(async db => {
    await db.event.update({ where: { id: Number(eventId) }, data: { updatedAt: new Date() } });
    let saved = await db.eventConfigurationVersion.findFirst({ where: { eventId: Number(eventId) }, orderBy: { version: 'desc' } });
    const current = await db.event.findUnique({ where: { id: Number(eventId) }, select: { sectorId: true, theoryMode: true, difficulty: true, eventQuestions: { where: { deletedAt: null, kindOfQuestionId: { in: [1, 2] } }, select: { id: true, kindOfQuestionId: true, quantity: true, persentage: true, minutes: true } } } });
    const normalized = rows => JSON.stringify([...rows].sort((a, b) => a.kindOfQuestionId - b.kindOfQuestionId).map(q => [q.id, q.kindOfQuestionId, q.quantity, q.persentage, q.minutes]));
    if (!current) throw Object.assign(new Error('Event not found.'), { status: 404 });
    const changed = saved && (current.sectorId !== saved.snapshot.sector?.id || current.theoryMode !== saved.snapshot.theoryMode || current.difficulty !== saved.snapshot.difficulty || normalized(current.eventQuestions) !== normalized(saved.snapshot.eventQuestions));
    if (changed && saved.lockedAt) throw conflict('Event settings differ from the locked examination configuration. Contact the Checker Admin.');
    if (!saved || changed || (saved.source === 'BACKFILL_CURRENT' && !saved.lockedAt)) {
      await assertConfigurationEditable(db, Number(eventId));
      const snapshot = await readLiveConfiguration(db, Number(eventId));
      const issues = configurationIssues(snapshot);
      if (issues.length) throw conflict(`Examination cannot start. Ask the Checker Admin to fix the configuration: ${issues.join(' ')}`);
      const actor = actorNik ? await db.user.findUnique({ where: { nik: actorNik }, select: { name: true } }) : null;
      saved = await db.eventConfigurationVersion.create({ data: {
        eventId: Number(eventId), version: (saved?.version || 0) + 1,
        source: 'AUTO_FINALIZED', actorNik, actorName: actor?.name || null,
        reason: `Automatically finalized before examination (${trigger}). ${changed ? 'Event settings changed after the previous capture.' : 'No finalized configuration was available.'}`,
        snapshot: { ...snapshot, captureIssues: [] }, lockedAt: new Date(),
      } });
    }
    // Backfilled snapshots preserve legacy, potentially incomplete settings; do not invent historical settings.
    if (['FINALIZED', 'AUTO_FINALIZED'].includes(saved.source)) {
      const issues = configurationIssues(saved.snapshot);
      if (issues.length) throw conflict(issues.join(' '));
    }
    if (!saved.lockedAt) await db.eventConfigurationVersion.update({ where: { id: saved.id }, data: { lockedAt: new Date() } });
    return { ...saved.snapshot, configurationVersionId: saved.id, configurationVersion: saved.version };
  });
}

export const ratingConfiguration = (snapshot, ratingId) => {
  const rating = snapshot.sector?.subBranchUnitRatings.find(r => r.ratingId === Number(ratingId));
  if (!rating) throw conflict('This rating is not included in the saved event configuration.');
  return rating;
};
