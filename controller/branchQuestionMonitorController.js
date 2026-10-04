import prisma from '../lib/prisma.js';

export const options = async (_req, res) => {
  try {
    const [branches, units, sectors, assignments] = await Promise.all([
      prisma.branch.findMany({ where: { deletedAt: null }, select: { id: true, branch: true }, orderBy: { branch: 'asc' } }),
      prisma.branchUnit.findMany({ where: { deletedAt: null }, select: { id: true, branchId: true, unit: true }, orderBy: { unit: 'asc' } }),
      prisma.sector.findMany({ where: { deletedAt: null }, select: { id: true, branchUnitId: true, sector: true }, orderBy: { sector: 'asc' } }),
      prisma.subBranchUnitRating.findMany({ where: { deletedAt: null, rating: { deletedAt: null } }, select: { sectorId: true, rating: { select: { id: true, rating: true } } } }),
    ]);
    res.json({ branches, units, sectors, assignments });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

export function summarizeCorrections(rows, type) {
  const summary = new Map();
  for (const row of rows) {
    const question = type === 'ESSAY' ? row.essay : row.multipleChoice;
    if (type === 'MULTIPLE_CHOICE' && question?.isMats) continue;
    if (!question || (type === 'ESSAY' && (row.score == null || !row.checker))) continue;
    let item = summary.get(question.id);
    if (!item) { item = { id: question.id, question: question.question, version: question.version, total: 0, correct: 0, incorrect: 0, sum: 0, percentages: [], answerSummary: { A: 0, B: 0, C: 0, D: 0 } }; summary.set(question.id, item); }
    item.total++;
    if (type === 'ESSAY') { item.sum += Number(row.score); if (question.value > 0) item.percentages.push(Number(row.score) / question.value * 100); }
    else { row.isTrue ? item.correct++ : item.incorrect++; const answer = String(row.answer || '').toUpperCase(); if (answer in item.answerSummary) item.answerSummary[answer]++; }
  }
  return [...summary.values()].map(({ sum, percentages, ...item }) => ({ ...item, averageScore: item.total ? sum / item.total : null, averagePercentage: percentages.length ? percentages.reduce((a,b) => a+b,0) / percentages.length : null, percentageTrue: item.total ? item.correct / item.total * 100 : null }));
}

export const load = async (req, res) => {
  try {
    const { type, view, attempt = 'ALL', startDate, endDate } = req.body;
    const branchId = Number(req.body.branchId), branchUnitId = Number(req.body.branchUnitId), sectorId = Number(req.body.sectorId), ratingId = Number(req.body.ratingId);
    if (![branchId, branchUnitId, sectorId, ratingId].every(id => Number.isSafeInteger(id) && id > 0) || !['ESSAY','MULTIPLE_CHOICE'].includes(type) || !['MONITOR','STATISTIC','DETAIL','QUESTION_DETAIL'].includes(view) || !['ALL','LATEST','FIRST','RECHECK'].includes(attempt)) return res.status(400).json({ message: 'Select branch, branch unit, sector, rating and question type.' });
    const questionId = Number(req.body.questionId);
    if (view === 'QUESTION_DETAIL' && (!Number.isSafeInteger(questionId) || questionId <= 0)) return res.status(400).json({ message: 'Select a question.' });
    const assignment = await prisma.subBranchUnitRating.findFirst({ where: { ratingId, sectorId, deletedAt: null, sector: { is: { branchUnitId, deletedAt: null, branchUnit: { is: { branchId, deletedAt: null } } } } }, select: { id: true } });
    if (!assignment) return res.status(404).json({ message: 'Rating is not available in the selected branch unit and sector.' });
    const groupWhere = { deletedAt: null, questionGroup: { is: { deletedAt: null, subBranchUnitRatingId: assignment.id } } };
    const relation = type === 'ESSAY' ? 'essayQuestionGroups' : 'mcQuestionGroups';
    const model = type === 'ESSAY' ? prisma.essay : prisma.multipleChoice;
    if (view === 'DETAIL') {
      const groupId = Number(req.body.groupId);
      if (!Number.isSafeInteger(groupId) || groupId <= 0) return res.status(400).json({ message: 'Select a group.' });
      const questions = await model.findMany({ where: { branchUnitId, deletedAt: null, isActive: true, [relation]: { some: { ...groupWhere, questionGroupId: groupId } } }, select: { id: true, question: true, version: true, ...(type === 'MULTIPLE_CHOICE' ? { a: true, b: true, c: true, d: true } : {}) }, orderBy: { id: 'desc' }, take: 200 });
      return res.json({ questions, limit: 200 });
    }
    if (view === 'MONITOR') {
      const groups = await prisma.questionGroup.findMany({ where: { deletedAt: null, subBranchUnitRatingId: assignment.id, kindOfQuestionId: type === 'ESSAY' ? 1 : 2 }, select: { id: true, group: true, quantity: true, [relation]: { where: { deletedAt: null, [type === 'ESSAY' ? 'essay' : 'multipleChoice']: { is: { deletedAt: null, isActive: true, branchUnitId } } }, select: { [type === 'ESSAY' ? 'essayId' : 'multipleChoiceId']: true } } }, orderBy: { id: 'asc' } });
      const questionWhere = { branchUnitId, deletedAt: null, isActive: true, ...(type === 'MULTIPLE_CHOICE' ? { isMats: false } : {}) };
      const [total, unassigned] = await Promise.all([model.count({ where: questionWhere }), model.count({ where: { ...questionWhere, [relation]: { none: { deletedAt: null, questionGroup: { is: { deletedAt: null } } } } } })]);
      return res.json({ total, unassigned, scopeNote: 'Totals and unassigned questions are branch-unit-wide; groups are scoped to selected sector/rating.', groups: groups.map(group => ({ id: group.id, group: group.group, required: group.quantity || 0, available: new Set(group[relation].map(item => item[type === 'ESSAY' ? 'essayId' : 'multipleChoiceId'])).size })) });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) return res.status(400).json({ message: 'Select a valid date range.' });
    const start = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T23:59:59.999Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return res.status(400).json({ message: 'Invalid date range.' });
    const scores = await prisma.finalScore.findMany({ where: { deletedAt: null, isInvalidated: false, appRating: { is: { deletedAt: null, ratingId, applicationDoc: { is: { deletedAt: null, eventUser: { is: { deletedAt: null, event: { is: { deletedAt: null, sectorId } } } } } } } } }, select: { id: true, appRatingId: true, createdAt: true, essaySubmittedAt: true, multipleChoiceSubmittedAt: true }, orderBy: { id: 'asc' } });
    const byRating = new Map();
    for (const score of scores) { const list = byRating.get(score.appRatingId) || []; list.push(score); byRating.set(score.appRatingId,list); }
    const ids = [...byRating.values()].flatMap(list => attempt === 'LATEST' ? list.slice(-1) : attempt === 'FIRST' ? list.slice(0,1) : attempt === 'RECHECK' ? list.slice(1) : list).filter(score => { const submitted = type === 'ESSAY' ? score.essaySubmittedAt : score.multipleChoiceSubmittedAt; return submitted && submitted >= start && submitted <= end; }).map(score => score.id);
    const rows = type === 'ESSAY'
      ? await prisma.essayCorrection.findMany({ where: { deletedAt: null, finalScoreId: { in: ids }, score: { not: null }, checker: { not: null }, ...(view === 'QUESTION_DETAIL' ? { essayId: questionId } : {}) }, select: { score: true, checker: true, essay: { select: { id: true, question: true, version: true, value: true, ...(view === 'QUESTION_DETAIL' ? { answer: true } : {}) } }, ...(view === 'QUESTION_DETAIL' ? { checkerUser: { select: { name: true } } } : {}) } })
      : await prisma.multipleChoiceCorrection.findMany({ where: { deletedAt: null, finalScoreId: { in: ids }, ...(view === 'QUESTION_DETAIL' ? { multipleChoiceId: questionId } : {}), multipleChoice: { is: { isMats: false } } }, select: { answer: true, isTrue: true, multipleChoice: { select: { id: true, question: true, version: true, isMats: true, ...(view === 'QUESTION_DETAIL' ? { a: true, b: true, c: true, d: true, key: true } : {}) } } } });
    if (view === 'QUESTION_DETAIL') {
      const summary = summarizeCorrections(rows,type)[0];
      if (!summary) return res.status(404).json({ message: 'Question was not found in the selected statistics.' });
      if (type === 'ESSAY') {
        const checkers = new Map();
        for (const row of rows) {
          const item = checkers.get(row.checker) || { name: row.checkerUser?.name || 'Unknown checker', count: 0, sum: 0 };
          item.count++; item.sum += Number(row.score); checkers.set(row.checker,item);
        }
        return res.json({ ...summary, modelAnswer: rows[0].essay.answer, maximumMarks: rows[0].essay.value, minimumScore: Math.min(...rows.map(row => Number(row.score))), maximumScore: Math.max(...rows.map(row => Number(row.score))), checkers: [...checkers.values()].map(({ sum, ...item }) => ({ ...item, averageScore: sum / item.count })) });
      }
      const { a, b, c, d, key } = rows[0].multipleChoice;
      return res.json({ ...summary, a, b, c, d, correctAnswer: String(key || '').trim().toUpperCase() });
    }
    res.json({ questions: summarizeCorrections(rows,type), attempts: ids.length });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
