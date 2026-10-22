import prisma from '../lib/prisma.js';

// Preserve every scored attempt, including invalidated or archived attempts.
export async function assertDocumentDeletable(type, id, db = prisma) {
  if (type === 'medex' || type === 'ielp') {
    const linked = await db.applicationDoc.findFirst({ where: { [type + 'Id']: id }, select: { id: true } });
    if (linked) throw Object.assign(new Error('This record is used by an application document and cannot be deleted. Add or synchronize a new record instead.'), { status: 409 });
  }
  let where;
  let scope;
  if (type === 'application') where = { id };
  else if (type === 'competence') {
    const certificate = await db.competence.findUnique({ where: { id }, select: { userId: true, ratingId: true } });
    if (!certificate?.userId || !certificate.ratingId) return;
    scope={userNik:certificate.userId,appRatings:{some:{ratingId:certificate.ratingId}}};
    // Legacy applications do not store a certificate ID: conservatively retain
    // certificates for the same applicant/rating once examination evidence exists.
    where = { userNik: certificate.userId, appRatings: { some: { ratingId: certificate.ratingId, finalScores: { some: {} } } } };
  } else {
    const field = { medex: 'medexId', ielp: 'ielpId', license: 'licenseId', logbook: 'logbookUserId' }[type];
    if (!field) throw new Error('Unsupported document type.');
    where = type === 'license'
      ? { OR: [{ licenseId: id }, { appRatings: { some: { practicalLicenseId: id, finalScores: { some: {} } } } }] }
      : { [field]: id };
  }
  const scored = await db.applicationDoc.findFirst({ where: { ...where, ...(type !== 'competence' ? { appRatings: { some: { finalScores: { some: {} } } } } : {}) }, select: { id: true } });
  if (scored) throw Object.assign(new Error('This document is linked to an application with a final score and cannot be deleted. Examination evidence must be retained.'), { status: 409 });
  scope ||= type==='license'?{OR:[{licenseId:id},{appRatings:{some:{practicalLicenseId:id}}}]}:where;
  const started=await db.applicationDoc.findFirst({where:{AND:[scope,{OR:[
    {appRatings:{some:{OR:[{modeOneExamDrafts:{some:{deadlineAt:{not:null},submittedAt:null}}},{theorySessionParticipants:{some:{joinedAt:{not:null},finalizedAt:null}}},{practicalTests:{some:{OR:[{score:{not:null}},{file:{not:null}}]}}}]}}},
    {eventUser:{theorySessionParticipants:{some:{joinedAt:{not:null},finalizedAt:null}}}}
  ]}]},select:{id:true}});
  if(started)throw Object.assign(new Error('This document is linked to a started examination or practical evidence and cannot be deleted.'),{status:409});
}
