import { requireMenu, requireRole, ROLES } from "./authorize.js";

const policies = [
  { pattern: /^\/mats(\/|$)/, menus: ["mandatoryQuestion"], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/(regions|branches)(\/|$)/, menus: ["branchManagement"] },
  { pattern: /^\/professions(\/|$)/, menus: ["professionManagement"] },
  { pattern: /^\/ratings(\/|$)/, menus: ["ratingManagement"] },
  { pattern: /^\/(mandatoryItem|mandatoryRating)(\/|$)/, menus: ["mandatoryQuestion"] },
  { pattern: /^\/branchUnits(\/|$)/, menus: ["branchUnitManagement"] },
  { pattern: /^\/(userGeneral|userRoleGeneral)(\/|$)/, menus: ["userManagement"] },
  { pattern: /^\/rolesManagement(\/|$)/, menus: ["rolesManagement"] },
  { pattern: /^\/sectors(\/|$)/, menus: ["sectorManagement"] },
  { pattern: /^\/professionInBranch(\/|$)/, menus: ["professionInBranch"] },
  { pattern: /^\/(userBranch|userRoleBranch)(\/|$)/, menus: ["userManagementBranch"] },
  { pattern: /^\/(escalationLevels|escalationActors)(\/|$)/, menus: ["escalation"] },
  { pattern: /^\/(userBranchUnit|userRoleBranchUnit)(\/|$)/, menus: ["userManagementBranchUnit", "userManagementChecker"] },
  { pattern: /^\/(checkerRating|ratingCheckerAdmins)(\/|$)/, menus: ["ratingCheckerAdmin"] },
  { pattern: /^\/(sessions|events|groups|eventQuestions|token)(\/|$)/, menus: ["eventPreparation"] },
  { pattern: /^\/room(\/|$)/, menus: ["room", "eventPreparation"] },
  { pattern: /^\/(questionGroupsEssay|essays|essayGroups)(\/|$)/, menus: ["essayChoiceQuestion"] },
  { pattern: /^\/(questionGroupsMultipleChoice|multipleChoices|multipleChoiceGroups)(\/|$)/, menus: ["multipleChoiceQuestion"] },
  { pattern: /^\/cwpSupervisors$/, methods: ["GET"], menus: ["cwpManagement", "dutyReport"] },
  { pattern: /^\/(cwps|cwpSectors|cwpFrequencies|cwpSupervisors)(\/|$)/, menus: ["cwpManagement"] },
  { pattern: /^\/shifts$/, methods: ["GET"], menus: ["shiftManagement", "dutyReport"] },
  { pattern: /^\/shifts(\/|$)/, menus: ["shiftManagement"] },
  { pattern: /^\/performanceCheck(\/|$)/, menus: ["performanceCheck"] },
  { pattern: /^\/scoreChecker(\/|$)/, menus: ["score"] },
  { pattern: /^\/pfcScore(\/|$)/, menus: ["pfcScore"] },
  { pattern: /^\/dataChecker(\/|$)/, menus: ["data"] },
  { pattern: /^\/checkerHistory(\/|$)/, menus: ["history"] },
  { pattern: /^\/dashboardDoctor(\/|$)/, menus: ["dashboardDoctor"] },
  { pattern: /^\/(checkerStatistic|checkerStatisticQuestion)(\/|$)/, menus: ["checkerStatistic", "mandatoryQuestion"] },
  { pattern: /^\/medicalCheck\/monitor(\/|$)/, menus: ["monitorMedicalTest"] },
  { pattern: /^\/medicalCheck\/history(\/|$)/, menus: ["monitorMedicalTest"] },
  { pattern: /^\/medicalCheck\/[^/]+\/verify(\/|$)/, menus: ["monitorMedicalTest"] },
  { pattern: /^\/lhdReports\/recap$/, menus: ["logbookBranchUnit", "logbookGeneralAdmin", "dutyReport"] },
  { pattern: /^\/onGoingIssues\/recap$/, menus: ["logbookBranchUnit", "logbookGeneralAdmin", "dutyReport"] },
  { pattern: /^\/(dutyReports|onGoingIssues|lhdBooks|positionLogs)(\/|$)/, menus: ["dutyReport"] },
  { pattern: /^\/(dailyLogbookGa|personalLogbookGa)(\/|$)/, menus: ["logbookGeneralAdmin"] },
  { pattern: /^\/(dailyLogbook|personalLogbook)(\/|$)/, menus: ["logbookBranchUnit", "logbook"] },
];

export const enforceRoutePolicy = (req, res, next) => {
  const policy = policies.find((item) =>
    item.pattern.test(req.path) &&
    (!item.methods || item.methods.includes(req.method)),
  );
  if (!policy) return next();
  const checkMenus = () => requireMenu(...policy.menus)(req, res, next);
  return policy.roles ? requireRole(...policy.roles)(req, res, checkMenus) : checkMenus();
};
