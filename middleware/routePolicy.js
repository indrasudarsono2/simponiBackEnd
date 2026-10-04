import { requireMenu, requireRole, ROLES } from "./authorize.js";

const policies = [
  { pattern: /^\/branchQuestionMonitor(\/|$)/, menus: ['pfcScore'], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/operationalGuide$/, methods: ["GET"], menus: ["dashboardOperational"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/mats(\/|$)/, menus: ["mandatoryQuestion"], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/passingGradeStandard$/, methods: ["PUT"], menus: ["mandatoryQuestion"], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/passingGradeStandard$/, methods: ["GET"], menus: ["mandatoryQuestion", "eventPreparation"] },
  { pattern: /^\/(regions|branches)(\/|$)/, menus: ["branchManagement"] },
  { pattern: /^\/professions(\/|$)/, menus: ["professionManagement"] },
  { pattern: /^\/ratings(\/|$)/, menus: ["ratingManagement"] },
  { pattern: /^\/(mandatoryItem|mandatoryRating)(\/|$)/, menus: ["mandatoryQuestion"] },
  { pattern: /^\/branchUnits(\/|$)/, menus: ["branchUnitManagement"] },
  { pattern: /^\/(userGeneral|userRoleGeneral)(\/|$)/, menus: ["userManagement"] },
  { pattern: /^\/userLoginSecurity(\/|$)/, menus: ["userManagement"], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/rolesManagement(\/|$)/, menus: ["rolesManagement"] },
  { pattern: /^\/sectors(\/|$)/, menus: ["sectorManagement"] },
  { pattern: /^\/professionInBranch(\/|$)/, menus: ["professionInBranch"] },
  { pattern: /^\/(userBranch|userRoleBranch)(\/|$)/, menus: ["userManagementBranch"] },
  { pattern: /^\/(escalationLevels|escalationActors)(\/|$)/, menus: ["escalation"] },
  { pattern: /^\/(userBranchUnit|userRoleBranchUnit)(\/|$)/, menus: ["userManagementBranchUnit", "userManagementChecker"] },
  { pattern: /^\/(checkerRating|ratingCheckerAdmins)(\/|$)/, menus: ["ratingCheckerAdmin"] },
  { pattern: /^\/allRatings$/, menus: ["ratingCheckerAdmin"] },
  { pattern: /^\/ratingSummary$/, menus: ["ratingSummary"] },
  { pattern: /^\/proposalLetters\/supervisors$/, menus: ["applicationDoc"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/proposalLetters\/application\/\d+(?:\/assign)?$/, menus: ["applicationDoc"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/proposalLetters\/inbox$/, menus: ["proposalLetters"], roles: [ROLES.SUPERVISOR] },
  { pattern: /^\/proposalLetters\/\d+\/revise$/, menus: ["applicationDoc"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/proposalLetters\/\d+\/decision$/, menus: ["proposalLetters", "applicationDoc", "ojtiRequests"], roles: [ROLES.SUPERVISOR, ROLES.OPERATIONAL] },
  { pattern: /^\/proposalLetters\/\d+$/, menus: ["applicationDoc", "proposalLetters", "ojtiRequests"], roles: [ROLES.OPERATIONAL, ROLES.SUPERVISOR] },
  { pattern: /^\/(sessions|events|groups|eventQuestions|token)(\/|$)/, menus: ["eventPreparation"] },
  { pattern: /^\/events(?:GetUser|GetEventUser)\/\d+$/, methods: ["GET"], menus: ["eventPreparation"] },
  { pattern: /^\/events(?:PostUser|DeleteEventUser)$/, methods: ["POST"], menus: ["eventPreparation"] },
  { pattern: /^\/ojtiRecommendations\/eligible$/, menus: ["applicationDoc"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/ojtiRecommendations\/inbox$/, menus: ["ojtiRequests"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/theorySessions\/lead(\/|$)/, menus: ["theorySession"], roles: [ROLES.CHECKER_EXAMINATION_LEAD] },
  { pattern: /^\/theorySessions\/mine$/, menus: ["examination"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/theorySessions\/\d+\/(choose-rating|attempt|draft|submit)$/, menus: ["examination"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/theorySessions\/\d+\/clock$/, menus: ["theorySession", "examination"] },
  { pattern: /^\/theorySessions(\/|$)/, menus: ["theorySession"], roles: [ROLES.CHECKER_EXAMINATION_LEAD] },
  { pattern: /^\/room(\/|$)/, menus: ["room", "eventPreparation"] },
  { pattern: /^\/examination(?:Essay|Answer|Draft|MultipleChoice(?:Answer)?)?$/, menus: ["examination"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/(questionGroupsEssay|essays|essayGroups)(\/|$)/, menus: ["essayChoiceQuestion"] },
  { pattern: /^\/(questionGroupsMultipleChoice|multipleChoices|multipleChoiceGroups)(\/|$)/, menus: ["multipleChoiceQuestion"] },
  { pattern: /^\/questionReview$/, methods: ["GET"], menus: ["questionReview"], roles: [ROLES.CHECKER_EXAMINATION] },
  { pattern: /^\/cwpSupervisors$/, methods: ["GET"], menus: ["cwpManagement", "dutyReport"] },
  { pattern: /^\/(cwps|cwpSectors|cwpFrequencies|cwpSupervisors)(\/|$)/, menus: ["cwpManagement"] },
  { pattern: /^\/shifts$/, methods: ["GET"], menus: ["shiftManagement", "dutyReport"] },
  { pattern: /^\/shifts(\/|$)/, menus: ["shiftManagement"] },
  { pattern: /^\/performanceCheck\/reset-(?:options\/\d+|attempt)$/, menus: ["performanceCheck"], roles: [ROLES.CHECKER] },
  { pattern: /^\/performanceCheck(\/|$)/, menus: ["performanceCheck"] },
  { pattern: /^\/practicalExam\/theory-review\/\d+$/, methods: ["GET"], menus: ["practicalExam"], roles: [ROLES.CHECKER] },
  { pattern: /^\/practicalExam(\/|$)/, menus: ["practicalExam"] },
  { pattern: /^\/scoreChecker\/(?:theory-review|evidence-download)\/\d+$/, methods: ["GET"], menus: ["score", "pfcScore"], roles: [ROLES.CHECKER_ADMIN, ROLES.GENERAL_CHECKER, ROLES.GENERAL_ADMIN] },
  { pattern: /^\/scoreChecker(\/|$)/, menus: ["score"] },
  { pattern: /^\/scoreUser\/certificate\/\d+$/, methods: ["GET"], menus: ["userHistory"], roles: [ROLES.OPERATIONAL] },
  { pattern: /^\/pfcScore\/branchUnit$/, menus: ["pfcScore"], roles: [ROLES.GENERAL_ADMIN] },
  { pattern: /^\/pfcScore(\/|$)/, menus: ["pfcScore"] },
  { pattern: /^\/dataChecker(\/|$)/, menus: ["data"] },
  { pattern: /^\/checkerHistory(\/|$)/, menus: ["history"] },
  { pattern: /^\/dashboardDoctor(\/|$)/, menus: ["dashboardDoctor"] },
  { pattern: /^\/checkerStatistic\/me$/, methods: ["GET"], menus: ["userHistory"], roles: [ROLES.OPERATIONAL] },
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
  const roleNames = new Set(
    (req.user?.roleNames || []).map((role) => String(role || "").trim().toUpperCase()),
  );
  const questionManagementPath = /^\/(questionGroupsEssay|essays|essayGroups|questionGroupsMultipleChoice|multipleChoices|multipleChoiceGroups)(\/|$)/;
  if (roleNames.has(ROLES.CHECKER_EXAMINATION) &&
      !roleNames.has(ROLES.CHECKER_ADMIN) &&
      !roleNames.has(ROLES.GENERAL_ADMIN) &&
      questionManagementPath.test(req.path)) {
    return res.status(403).json({
      success: false,
      message: "Checker Examination may only use the read-only Question Review endpoint.",
    });
  }

  const policy = policies.find((item) =>
    item.pattern.test(req.path) &&
    (!item.methods || item.methods.includes(req.method)),
  );
  if (!policy) return next();
  const checkMenus = () => requireMenu(...policy.menus)(req, res, next);
  return policy.roles ? requireRole(...policy.roles)(req, res, checkMenus) : checkMenus();
};
