export const isCheckerAdmin = user => (user?.roleNames || []).some(role => String(role).trim().toUpperCase() === 'CHECKER ADMIN');
export const sameBranchUnit = (user, unitId) => Number.isInteger(Number(user?.branchUnitId)) && Number(user.branchUnitId) > 0 && Number(user.branchUnitId) === Number(unitId);
// Administrative delegation covers Supervisor validation, not OJTI signatures.
export const canAdminReviewProposal = (user, rating) => isCheckerAdmin(user)
  && sameBranchUnit(user, rating?.applicationDoc?.eventUser?.event?.sector?.branchUnitId)
  && sameBranchUnit(user, rating?.applicationDoc?.user?.branchUnitId)
  && rating?.applicationDoc?.userNik !== user.nik
  && String(rating?.applicationDoc?.eventUser?.event?.remarkDoc?.remark || '').trim().toUpperCase() === 'PERPANJANGAN';
