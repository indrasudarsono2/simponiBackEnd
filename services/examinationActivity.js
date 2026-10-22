// Read-only operational visibility. An unfinished attempt is not proof of browser presence.
export async function examinationActivity(client, branchUnitId, now = new Date()) {
  const scope = typeof branchUnitId === 'object' && branchUnitId !== null ? branchUnitId : null;
  if (scope) {
    if (!Array.isArray(scope.unitIds) || !scope.unitIds.every(id => Number.isSafeInteger(id) && id > 0) || !Number.isSafeInteger(scope.skip) || scope.skip < 0) throw Object.assign(new Error('Invalid examination scope.'), { status: 403 });
    branchUnitId = { in: scope.unitIds };
  } else if (!Number.isSafeInteger(branchUnitId) || branchUnitId <= 0) throw Object.assign(new Error('A branch unit is required.'), { status: 403 });
  const pagination = scope?.snapshot ? {} : scope ? { skip: scope.skip, take: 100 } : { take: 200 };
  const locationSelect = { name: true, branchUnit: { select: { id: true, unit: true, branch: { select: { id: true, branch: true } } } } };
  const mode1Where = { deadlineAt: { not: null }, submittedAt: null,
    appRating: { applicationDoc: { user: { branchUnitId }, eventUser: { event: { sector: { branchUnitId } } } } } };
  const mode2Where = { joinedAt: { not: null }, finalizedAt: null,
    session: { status: { in: ['RUNNING', 'PAUSED', 'ENDING'] } },
    eventUser: { user: { branchUnitId }, event: { sector: { branchUnitId } } } };
  const [mode1, mode2, mode1Count, overdueCount, mode2Count] = await Promise.all([
    client.modeOneExamDraft.findMany({ where: mode1Where, orderBy: [{ deadlineAt: 'asc' }, { id: 'asc' }], ...pagination,
      select: { id: true, ownerNik: true, kind: true, deadlineAt: true,
        appRating: { select: { rating: { select: { rating: true } }, applicationDoc: { select: {
          user: { select: locationSelect }, eventUser: { select: { event: { select: { id: true, event: true } } } },
        } } } } } }),
    client.theorySessionParticipant.findMany({ where: mode2Where, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], ...pagination,
      select: { id: true, joinedAt: true, eventUser: { select: { userNik: true, user: { select: locationSelect }, event: { select: { id: true, event: true } } } },
        appRating: { select: { rating: { select: { rating: true } } } },
        session: { select: { status: true, remainingSeconds: true, resumedAt: true } } } }),
    client.modeOneExamDraft.count({ where: mode1Where }),
    client.modeOneExamDraft.count({ where: { ...mode1Where, deadlineAt: { lte: now } } }),
    client.theorySessionParticipant.count({ where: mode2Where }),
  ]);
  const attempts = mode1.map(d => ({ id: `mode1-${d.id}`, mode: 'MODE_1', nik: d.ownerNik,
    branchId: d.appRating?.applicationDoc?.user?.branchUnit?.branch?.id ?? null, branchUnitId: d.appRating?.applicationDoc?.user?.branchUnit?.id ?? null,
    branch: d.appRating?.applicationDoc?.user?.branchUnit?.branch?.branch || '-', branchUnit: d.appRating?.applicationDoc?.user?.branchUnit?.unit || '-',
    name: d.appRating?.applicationDoc?.user?.name || d.ownerNik,
    event: d.appRating?.applicationDoc?.eventUser?.event?.event || '-',
    rating: d.appRating?.rating?.rating || '-', section: d.kind,
    deadline: d.deadlineAt, status: new Date(d.deadlineAt) <= now ? 'OVERDUE' : 'IN_PROGRESS' }));
  for (const p of mode2) {
    const s = p.session;
    const remaining = Math.max(0, Number(s.remainingSeconds || 0) * 1000 -
      (s.status === 'RUNNING' && s.resumedAt ? Math.max(0, now.getTime() - new Date(s.resumedAt).getTime()) : 0));
    attempts.push({ id: `mode2-${p.id}`, mode: 'MODE_2', nik: p.eventUser.userNik,
      branchId: p.eventUser.user?.branchUnit?.branch?.id ?? null, branchUnitId: p.eventUser.user?.branchUnit?.id ?? null,
      branch: p.eventUser.user?.branchUnit?.branch?.branch || '-', branchUnit: p.eventUser.user?.branchUnit?.unit || '-',
      name: p.eventUser.user?.name || p.eventUser.userNik, event: p.eventUser.event?.event || '-',
      rating: p.appRating?.rating?.rating || '-', section: 'THEORY',
      deadline: s.status === 'RUNNING' ? new Date(now.getTime() + remaining) : null,
      status: s.status === 'PAUSED' ? 'PAUSED' : s.status === 'ENDING' || remaining === 0 ? 'OVERDUE' : 'IN_PROGRESS' });
  }
  return { checkedAt: now, mode1Count, mode2Count, overdueMode1Count: overdueCount,
    hasNext: scope?.snapshot ? false : scope ? mode1Count > scope.skip + 100 || mode2Count > scope.skip + 100 : false,
    total: mode1Count + mode2Count, truncated: scope?.snapshot ? false : mode1Count > 200 || mode2Count > 200, attempts };
}
