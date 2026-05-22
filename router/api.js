import express from 'express';
const router = express.Router();

import { authenticateToken } from '../middleware/auth.js';

import * as monitorTime from '../controller/monitorTimeController.js'
import * as profileController from '../controller/profileController.js'
import * as regionalController from '../controller/regionalController.js';
import * as branchController from '../controller/branchController.js';
import * as professionController from '../controller/professionController.js';
import * as ratingController from '../controller/ratingController.js';
import * as branchUnitController from '../controller/branchUnitController.js';
import * as sectorController from '../controller/sectorController.js';
import * as ratingCheckerAdminController from '../controller/ratingCheckerAdminController.js';
import * as mandatoryItemController from '../controller/mandatoryItemController.js'
import * as mandatoryRatingController from '../controller/monitorRatingController.js'
import * as questionGroupEssayController from '../controller/questionGroupEssayController.js';
import * as essayController from '../controller/essayController.js';
import * as questionGroupMultipleChoiceController from '../controller/questionGroupMultipleChoiceController.js';
import * as multipleChoiceController from '../controller/multipleChoiceController.js';
import * as essayGroupController from '../controller/essayGroupController.js';
import * as multipleChoiceGroupController from '../controller/multipleChoiceGroupController.js';
import * as sessionController from '../controller/sessionController.js'
import * as eventController from '../controller/eventController.js'
import * as authController from '../controller/authController.js'
import * as groupController from '../controller/groupController.js'
import * as eventQuestionController from '../controller/eventQuestionController.js'
import * as licenseUserController from '../controller/licenseUserController.js'
import * as logbookUserController from '../controller/logbookUserController.js'
import * as ielpUserController from '../controller/ielpUserController.js'
import * as medexUserController from '../controller/medexUserController.js'
import * as competenceUserController from '../controller/competenceUserController.js'
import * as userGeneralController from '../controller/userGeneralController.js'
import * as userRoleGeneralController from '../controller/userRoleGeneralController.js'
import * as userRoleBranchUnitController from '../controller/userRoleBranchUnitController.js'
import * as userBranchController from '../controller/userBranchController.js'
import * as checkerRatingController from '../controller/checkerRatingController.js'
import * as professionInBranchController from '../controller/professionInBranchController.js'
import * as userBranchUnitController from '../controller/userBranchUnitController.js'
import * as applicationDocumentController from '../controller/applicationDocumentController.js'
import * as verificationController from '../controller/verificationController.js'
import * as dashboardController from '../controller/dashboardController.js'
import * as tokenController from '../controller/tokenController.js'
import * as examinationController from '../controller/examintaionController.js'
import * as roomController from '../controller/roomController.js'
import * as performanceCheckController from '../controller/performanceCheckController.js'
import * as practicalExamController from '../controller/practicalExamController.js'
import * as previewController from '../controller/previewController.js'
import * as scoreUserController from '../controller/scoreUserController.js'
import * as scoreCheckerController from '../controller/scoreCheckerController.js'
import * as dataCheckerController from '../controller/dataCheckerController.js'
import * as checkerHistoryController from '../controller/checkerHistoryController.js'
import * as checkerStatisticController from '../controller/checkerStatisticController.js'
import upload, { uploadCompetence, uploadEssay, uploadEvent, uploadIelp, uploadLicense, uploadlogbookUser, uploadMedex, uploadMultipleChoice, uploadPracticalTest, uploadPreview, uploadRoom } from '../lib/multer.js'

// Auth - Public route (no authentication required)
router.post('/auth/login', authController.login)

// Apply authentication middleware to all routes below this line
router.use(authenticateToken)

router.post('/postTime', monitorTime.postTime)

router.get('/profile', profileController.getProfile);
router.put('/profile/:id', profileController.editProfile)

router.get('/dashboardOperational', dashboardController.getDashboardOperational)
router.post('/dashboardToken', dashboardController.postDashboardToken)

router.get('/regions', regionalController.getRegions);
router.post('/regions', regionalController.addRegion);
router.put('/regions/:id', regionalController.getRegionById);
router.delete('/regions/:id', regionalController.deleteRegionById);

router.get('/branches', branchController.getBranches);
router.post('/branches', branchController.addBranch);
router.put('/branches/:id', branchController.getBranchById);
router.delete('/branches/:id', branchController.deleteBranchById);

router.get('/professions', professionController.getProfessions);
router.post('/professions', professionController.addProfession);
router.put('/professions/:id', professionController.getProfessionById);
router.delete('/professions/:id', professionController.deleteProfessionById);

router.get('/ratings', ratingController.getRatings);
router.post('/ratings', ratingController.addRating);
router.put('/ratings/:id', ratingController.getRatingById);
router.delete('/ratings/:id', ratingController.deleteRatingById);

router.get('/mandatoryItem', mandatoryItemController.getMandatoryItem)
router.post('/mandatoryItem', mandatoryItemController.postMandatoryItem)
router.put('/mandatoryItem/:id', mandatoryItemController.updateMandatoryItem)
router.delete('/mandatoryItem/:id', mandatoryItemController.deleteMandatoryItem)

router.get('/mandatoryRating', mandatoryRatingController.getMandatoryRating)
router.post('/mandatoryRating', mandatoryRatingController.postMandatoryRating)
router.delete('/mandatoryRating/:id', mandatoryRatingController.deleteMandatoryRating)

router.get('/branchUnits', branchUnitController.getBranchUnits);
router.get('/branchUnitsGetBranch', branchUnitController.branchUnitsGetBranch);
router.post('/branchUnits', branchUnitController.addBranchUnit);
router.put('/branchUnits/:id', branchUnitController.getBranchUnitById);
router.delete('/branchUnits/:id', branchUnitController.deleteBranchUnitById);

router.get('/sectors', sectorController.getSectors);
router.get('/sectorGetBranchUnit', sectorController.sectorGetBranchUnit);
router.post('/sectors', sectorController.addSector);
router.put('/sectors/:id', sectorController.getSectorById);
router.delete('/sectors/:id', sectorController.deleteSectorById);

router.get('/ratingCheckerAdmins', ratingCheckerAdminController.getRatingCheckerAdmins);
router.get('/allRatings', ratingCheckerAdminController.getAllRating);
router.post('/ratingCheckerAdmins', ratingCheckerAdminController.addRatingCheckerAdmins);
router.put('/ratingCheckerAdmins/:id', ratingCheckerAdminController.getRatingCheckerAdminById);
router.delete('/ratingCheckerAdmins/:id', ratingCheckerAdminController.deleteRatingCheckerAdminById);

router.get('/questionGroupsEssay', questionGroupEssayController.getQuestionGroups);
router.post('/questionGroupsEssay', questionGroupEssayController.addQuestionGroup);
router.put('/questionGroupsEssay/:id', questionGroupEssayController.getQuestionGroupId);
router.delete('/questionGroupsEssay/:id', questionGroupEssayController.deleteQuestionGroupId);

router.get('/essays', essayController.getEssays);
router.post('/essays', uploadEssay.any(), essayController.addEssays);
router.put('/essays/:id', uploadEssay.any(), essayController.getUpdateEssayById);
router.delete('/essays/:id', essayController.deleteEssayById);

router.get('/essayGroups', essayGroupController.getEssayGroups);
router.post('/essayGroups', essayGroupController.addEssayGroups);

router.get('/questionGroupsMultipleChoice', questionGroupMultipleChoiceController.getQuestionGroups);
router.post('/questionGroupsMultipleChoice', questionGroupMultipleChoiceController.addQuestionGroup);
router.put('/questionGroupsMultipleChoice/:id', questionGroupMultipleChoiceController.getQuestionGroupId);
router.delete('/questionGroupsMultipleChoice/:id', questionGroupMultipleChoiceController.deleteQuestionGroupId);

router.get('/multipleChoices', multipleChoiceController.getMultipleChoices);
router.post('/multipleChoices', uploadMultipleChoice.any(), multipleChoiceController.addMultipleChoice);
router.put('/multipleChoices/:id', uploadMultipleChoice.any(), multipleChoiceController.getUpdateMultipleChoiceById);
router.delete('/multipleChoices/:id', multipleChoiceController.deleteMultipleChoiceById);

router.get('/multipleChoiceGroups', multipleChoiceGroupController.getMultipleChoiceGroups);
router.post('/multipleChoiceGroups', multipleChoiceGroupController.addMultipleChoiceGroups);

router.get('/sessions', sessionController.getSessions)
router.post('/sessions', sessionController.addSession)
router.put('/sessions/:id', sessionController.getSesionById)
router.delete('/sessions/:id', sessionController.deleteSessionById)

router.get('/events', eventController.getEvents)
// Accept any single file with any field name
router.post('/events', uploadEvent.any(), eventController.addEvents)
router.put('/events/:id', uploadEvent.any(), eventController.getEventById)
router.delete('/events/:id', eventController.deleteEventById)
router.get('/eventsGetUser/:id', eventController.getUser)
router.get('/eventsGetEventUser/:id', eventController.getEventUser)
router.post('/eventsPostUser', eventController.postUser)
router.post('/eventsDeleteEventUser', eventController.deleteEventUser)

router.get('/groups', groupController.getGroups)
router.post('/groups', groupController.addGroup)
router.put('/groups/:id', groupController.getGroupById)
router.delete('/groups/:id', groupController.deleteGroupById)

router.get('/eventQuestions', eventQuestionController.getEventQuestions);
router.post('/eventQuestions', eventQuestionController.addEventQuestions)
router.put('/eventQuestions/:id', eventQuestionController.getEventQuestionById)
router.delete('/eventQuestions/:id', eventQuestionController.deleteEventQuestionId)

router.get('/licenseUser', licenseUserController.getLicenseUser)
router.post('/licenseUser', uploadLicense.any(), licenseUserController.addLicenseUser)
router.put('/licenseUser/:id', uploadLicense.any(), licenseUserController.getLicenseById)
router.delete('/licenseUser/:id', uploadLicense.any(), licenseUserController.deleteLicenseById)

router.get('/logbookUser', logbookUserController.getLogbookUser)
router.post('/logbookUser', uploadlogbookUser.any(), logbookUserController.addLogbookUser)
router.put('/logbookUser/:id', uploadlogbookUser.any(), logbookUserController.getLogbookById)
router.delete('/logbookUser/:id', logbookUserController.deleteLogbookById)

router.get('/ielpUser', ielpUserController.getIelpUser)
router.post('/ielpUser', uploadIelp.any(), ielpUserController.addIelpUser)
router.put('/ielpUser/:id', uploadIelp.any(), ielpUserController.getIelpById)
router.delete('/ielpUser/:id', ielpUserController.deleteIelpById)

router.get('/medexUser', medexUserController.getMedexUser)
router.post('/medexUser', uploadMedex.any(), medexUserController.addMedexUser)
router.put('/medexUser/:id', uploadMedex.any(), medexUserController.getMedexById);
router.delete('/medexUser/:id', medexUserController.deleteMedexById)

router.get('/competenceUser', competenceUserController.getCompetenceUser)
router.post('/competenceUser', uploadCompetence.any(), competenceUserController.addCompetenceUser)
router.put('/competenceUser/:id', uploadCompetence.any(), competenceUserController.getCompetenceById)
router.delete('/competenceUser/:id', competenceUserController.deleteCompetenceById)

router.get('/userGeneral', userGeneralController.getUserGeneral)
router.post('/userGeneral', userGeneralController.addUserGeneral)
router.put('/userGeneral/:id', userGeneralController.getUpdateByUserId)
router.delete('/userGeneral/:id', userGeneralController.deleteUserById)

router.get('/userRoleGeneral', userRoleGeneralController.getUserRoleGeneral)
router.put('/userRoleGeneral/:id', userRoleGeneralController.getUpdateData)

router.get('/userRoleBranchUnit', userRoleBranchUnitController.getUserRoleBranchUnit)
router.put('/userRoleBranchUnit/:id', userRoleBranchUnitController.getUpdateData)

router.get('/userBranch', userBranchController.getUserBranch)
router.post('/userBranch', userBranchController.assignUser)
router.put('/userBranch/:id', userBranchController.updatedata)
router.post('/userBranch/assign-unit', userBranchController.assignBranchUnit)

router.get('/userBranchUnit', userBranchUnitController.getUserBranchUnit)
router.post('/userBranchUnit/assignSector', userBranchUnitController.assignSector)
router.put('/userBranchUnit/:id', userBranchUnitController.updatedata)

router.get('/checkerRating', checkerRatingController.getChecker)
router.post('/checkerRating', checkerRatingController.postCheckerRating)

router.get('/professionInBranch', professionInBranchController.getProfessions)
router.post('/professionInBranch', professionInBranchController.addProfession)
router.put('/professionInBranch/:id', professionInBranchController.getProfessionById)
router.delete('/professionInBranch/:id', professionInBranchController.deleteProfessionById)

router.get('/applicationDocument', applicationDocumentController.getApplicationDoc)
router.post('/applicationDocument', applicationDocumentController.addApplicationDoc)
router.put('/applicationDocument/:id', applicationDocumentController.getApplicationDocById)
router.delete('/applicationDocument/:id', applicationDocumentController.deleteApplicationDoc)

router.get('/verificationInit', verificationController.getVerificationInit)
router.post('/verification', verificationController.getVerification)
router.post('/verificationItem', verificationController.getVerificationItem)
router.post('/verificationPost', verificationController.postVerification)
router.post('/getVerificationDetail', verificationController.getVerificationDetail)    

router.get('/token', tokenController.getTokenData)
router.post('/token', tokenController.postTokenData)
router.put('/token/:id', tokenController.editTokenData)

router.get('/room', roomController.getRoom)
router.post('/room', uploadRoom.any(), roomController.postRoom)
router.put('/room/:id', uploadRoom.any(), roomController.editRoom)
router.delete('/room/:id', roomController.deleteRoom)

router.get('/examination', examinationController.getExamination)
router.post('/examinationEssay', examinationController.getEssayQuestion)
router.post('/examinationAnswer', examinationController.postEssayAnswer)
router.post('/examinationMultipleChoice', examinationController.getMultipleChoiceQuestion)
router.post('/examinationMultipleChoiceAnswer', examinationController.postMultipleChoiceAnswer)

router.get('/performanceCheck', performanceCheckController.getEvent)
router.post('/performanceCheck', performanceCheckController.postEssayAnswer)

router.get('/practicalExam', practicalExamController.getPractical)
router.put('/practicalExam/:id', uploadPracticalTest.any(), practicalExamController.putPractical)

router.post('/preview', uploadPreview.any(), previewController.postPreview)

router.get('/scoreUser', scoreUserController.getUserScore)
router.get('/scoreUserPractical', scoreUserController.getUserScorePractical)

router.get('/scoreChecker', scoreCheckerController.getUserCheckerScore)
router.post('/scoreChecker', scoreCheckerController.postUserCheckerScore)
router.post('/scoreCheckerEvidance', scoreCheckerController.postUserCheckerScoreEvidance)
router.get('/scoreCheckerPractical', scoreCheckerController.getUserCheckerPractical)
router.post('/scoreCheckerPractical', scoreCheckerController.postUserCheckerPractical)

router.get('/dataCheckerIelp', dataCheckerController.getIelpCheckerData)
router.get('/dataCheckerMedex', dataCheckerController.getMedexCheckerData)
router.get('/dataCheckerCompetence', dataCheckerController.getCompetenceCheckerData)

router.get('/checkerHistory', checkerHistoryController.getData)
router.post('/checkerHistory', checkerHistoryController.postData)

router.get('/checkerStatistic', checkerStatisticController.getMember)
router.post('/checkerStatistic', checkerStatisticController.postMember)
router.get('/checkerStatisticQuestion', checkerStatisticController.getQuestion)
router.put('/checkerStatisticQuestion/:id', checkerStatisticController.getQuestionDetail)
export default router;
