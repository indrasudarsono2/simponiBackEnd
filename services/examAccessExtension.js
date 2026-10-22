export const extensionUntil = rating => rating?.examAccessExtensions?.[0]?.accessUntil || null;
export function hasExtendedAccess(rating, now = new Date()) {
  const until = extensionUntil(rating);
  return Boolean(until && new Date(until).getTime() >= new Date(now).getTime());
}
export function theoryIsFinished(rating) {
  const state = String(rating?.status?.status || '').toUpperCase();
  const finalState = String(rating?.finalScores?.[0]?.status?.status || '').toUpperCase();
  if (['SUCCESS','WAITING PRACTICAL','PRACTICAL RECHECK'].includes(finalState)) return true;
  if (state === 'RECHECK') return false;
  return ['SUCCESS','FAILED','WAITING PRACTICAL','PRACTICAL RECHECK'].includes(state) || finalState === 'FAILED';
}
export function validateExtension({ rating, event, accessUntil, reason, now = new Date() }) {
  if (event.theoryMode !== 'MODE_1') throw Object.assign(new Error('Mode 2 access is controlled by its shared examination session.'),{status:409});
  if (!event.finishDate || new Date(event.finishDate) >= now) throw Object.assign(new Error('This event has not expired. An access exception is not required.'),{status:409});
  if (theoryIsFinished(rating)) throw Object.assign(new Error('This rating has completed theory or exhausted its attempts. An access extension does not reset attempts.'),{status:409});
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500) throw Object.assign(new Error('Enter a reason between 10 and 500 characters.'),{status:400});
  if (typeof accessUntil !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(accessUntil)) throw Object.assign(new Error('The access deadline must include an explicit timezone.'),{status:400});
  const until = new Date(accessUntil);
  if (!Number.isFinite(until.getTime()) || until <= now || until <= new Date(event.finishDate) || (extensionUntil(rating) && until <= new Date(extensionUntil(rating)))) throw Object.assign(new Error('Choose a future deadline later than the event end and any existing extension.'),{status:400});
  return {accessUntil:until,reason:reason.trim()};
}
