const fieldsByType = {
  IELP: ["institution", "level", "released", "expired", "rater", "file"],
  MEDEX: ["institution", "released", "expired", "examiner", "file"],
};

const normalizeValue = (value) => value instanceof Date ? value.toISOString() : value ?? null;

const credentialSnapshot = (type, record) => Object.fromEntries(
  fieldsByType[type].map((field) => [field, normalizeValue(record?.[field])]),
);

const credentialChanges = (type, previous, next) => Object.fromEntries(
  fieldsByType[type]
    .map((field) => [field, { from: normalizeValue(previous?.[field]), to: normalizeValue(next?.[field]) }])
    .filter(([, value]) => value.from !== value.to),
);

const appendCredentialHistory = (db, {
  type, record, eventType, actorNik = null, checkerNik = null, note = null,
  previous = null, createdAt = undefined,
}) => db.credentialHistory.create({
  data: {
    credentialType: type,
    credentialId: record.id,
    rootCredentialId: record.rootVersionId || record.id,
    version: record.version || 1,
    eventType,
    actorNik,
    checkerNik,
    note,
    file: record.file || null,
    snapshot: JSON.stringify(credentialSnapshot(type, record)),
    changes: previous ? JSON.stringify(credentialChanges(type, previous, record)) : null,
    ...(createdAt ? { createdAt } : {}),
  },
});

export { appendCredentialHistory, credentialChanges, credentialSnapshot };
