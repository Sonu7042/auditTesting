const express = require("express");
const { createProject, updateProject, updateStatus} = require("../controllers/project/createProject");
const { getAllProjects, AuditorsAccordingAuditType } = require("../controllers/project/getAllProject");
const { createAuditSchedule, getAuditScheduleCount, getAuditSchedules, rescheduleAudit } = require("../controllers/project/createAuditSchedule");
const  upload  = require("../utils/multer");
const { uploadTemplateFromExcel, getChecklistTemplate, getChecklistTemplateById, deleteTemplate, addQuestion, createSection, updateSection, updateQuestion, updateMainMenu, sectionLock, questionsLock, categoryLock, getChecklistTemplateNames, getProjectChecklist, getProjectChecklistByAudit, createProjectSection, addProjectQuestion, updateProjectSection, updateProjectQuestion, updateProjectMainMenu, projectCategoryLock, projectSectionLock, projectQuestionLock, updateProjectChecklistApprovalStatus, getProjectDocumentQuestions, submitProjectDocumentQuestions, documentQuestionImageUpload, updateProjectDocumentQuestionStatus, requestProjectDocumentQuestionCorrection} = require("../controllers/templetCheckList/templetCheckList");
const {
  getNotifications,
  getNotificationHistory,
  markNotificationsRead,
  markAllNotificationsRead,
  deleteNotification,
} = require("../controllers/notificationController");
const { auditQuestionImageUpload, saveAuditQuestionResponse, getNonComplianceResponses } = require("../controllers/auditQuestionResponseController");
const {
  workforceNonComplianceUpload,
  addWorkforceNonComplianceActionEvidence,
  createWorkforceNonCompliance,
  getWorkforceNonCompliances,
} = require("../controllers/workforceNonComplianceController");
const {
  getAuditMachineryVerification,
  saveAuditMachineryVerification,
} = require("../controllers/auditMachineryVerificationController");
const {
  machineryNonComplianceUpload,
  addMachineryNonComplianceActionEvidence,
  createMachineryNonCompliance,
  getMachineryNonCompliances,
} = require("../controllers/machineryNonComplianceController");
const {
  getAuditChemicalVerification,
  saveAuditChemicalVerification,
} = require("../controllers/auditChemicalVerificationController");
const {
  chemicalNonComplianceUpload,
  addChemicalNonComplianceActionEvidence,
  createChemicalNonCompliance,
  getChemicalNonCompliances,
} = require("../controllers/chemicalNonComplianceController");
const {
  getAuditTimer,
  startAuditTimer,
  updateAuditTimer,
} = require("../controllers/auditTimerController");
const {
  clearAuditorSignature,
  completeAuditReport,
  downloadAuditReport,
  downloadAuditReportWord,
  downloadOpenNcReport,
  getAuditReports,
  getAuditAssessmentProgress,
  saveAuditReport,
  saveAuditorSignature,
  updateAuditAssessmentProgress,
} = require("../controllers/auditReportController");
const {
  getPreviousNcReviews,
  reviewUpload,
  startNewAuditCycle,
  updatePreviousNcReview,
  getNextAuditUpdateSelections,
  queueNextAuditUpdate,
  removeNextAuditUpdate,
} = require("../controllers/auditCycleController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  preventCompletedAuditEdit,
} = require("../middleware/auditEditLockMiddleware");

const router = express.Router();

router.post("/create-project", createProject);
router.get("/allProjects", protect, getAllProjects);
router.get("/auditorsAccordingAuditType/:type", AuditorsAccordingAuditType)
router.put("/update-project/:projectId", updateProject);
router.put("/update-status/:projectId", updateStatus);
router.post("/createAuditSchedule", protect, authorize("ADMIN"), createAuditSchedule);
router.get("/getAuditScheduleCount", protect, getAuditScheduleCount);
router.get("/getAuditSchedules", protect, getAuditSchedules);
router.patch("/audit-schedules/:scheduleId/reschedule", protect, authorize("ADMIN"), rescheduleAudit);
router.post("/uploadTemplateCheckList", upload.single("file"), uploadTemplateFromExcel);
router.get("/getChecklistTemplate", getChecklistTemplate);
router.get("/getChecklistTemplateById/:templateId", getChecklistTemplateById);
router.delete("/deleteTemplate/:templateId", deleteTemplate);
router.post("/createSection", createSection);
router.post("/addQuestion", addQuestion);


router.patch("/section/update", updateSection);
router.patch("/question/update", updateQuestion);
router.patch("/mainMenu/update", updateMainMenu);

router.patch("/category/toggle-lock", categoryLock);
router.patch("/section/toggle-lock", sectionLock);
router.patch("/question/toggle-lock", questionsLock);

router.get("/getChecklistTemplateNames", getChecklistTemplateNames);
router.get("/notifications", protect, getNotifications);
router.get("/notifications/history", protect, getNotificationHistory);
router.patch("/notifications/read", protect, markNotificationsRead);
router.patch("/notifications/read-all", protect, markAllNotificationsRead);
router.delete("/notifications/:notificationId", protect, deleteNotification);
router.get("/getProjectChecklist/:projectId", protect, getProjectChecklist);
router.get("/getProjectChecklistByAudit/:auditId", protect, getProjectChecklistByAudit);

router.post("/project-checklist/createSection", protect, preventCompletedAuditEdit, createProjectSection);
router.post("/project-checklist/addQuestion", protect, documentQuestionImageUpload, preventCompletedAuditEdit, addProjectQuestion);
router.patch("/project-checklist/section/update", protect, preventCompletedAuditEdit, updateProjectSection);
router.patch("/project-checklist/question/update", protect, preventCompletedAuditEdit, updateProjectQuestion);
router.patch("/project-checklist/mainMenu/update", protect, preventCompletedAuditEdit, updateProjectMainMenu);
router.patch("/project-checklist/category/toggle-lock", protect, preventCompletedAuditEdit, projectCategoryLock);
router.patch("/project-checklist/section/toggle-lock", protect, preventCompletedAuditEdit, projectSectionLock);
router.patch("/project-checklist/question/toggle-lock", protect, preventCompletedAuditEdit, projectQuestionLock);
router.patch("/project-checklist/approval-status", protect, updateProjectChecklistApprovalStatus);

router.get("/:projectId/document-questions", protect, getProjectDocumentQuestions);
router.patch("/:projectId/document-questions/submit", protect, documentQuestionImageUpload, preventCompletedAuditEdit, submitProjectDocumentQuestions);
router.patch("/:projectId/document-questions/:questionId/correction-request", protect, requestProjectDocumentQuestionCorrection);
router.patch("/:projectId/document-questions/:questionId/status", protect, preventCompletedAuditEdit, updateProjectDocumentQuestionStatus);
router.get("/audit-question-responses/non-compliance", protect, getNonComplianceResponses);
router.post("/audit-question-responses", protect, auditQuestionImageUpload, saveAuditQuestionResponse);
router.get("/workforce-non-compliances", protect, getWorkforceNonCompliances);
router.post("/workforce-non-compliances", protect, workforceNonComplianceUpload, createWorkforceNonCompliance);
router.patch("/workforce-non-compliances/:recordId/action-evidence", protect, workforceNonComplianceUpload, addWorkforceNonComplianceActionEvidence);
router.get("/audit-machinery-verification", protect, getAuditMachineryVerification);
router.post("/audit-machinery-verification", protect, saveAuditMachineryVerification);
router.get("/machinery-non-compliances", protect, getMachineryNonCompliances);
router.post("/machinery-non-compliances", protect, machineryNonComplianceUpload, createMachineryNonCompliance);
router.patch("/machinery-non-compliances/:recordId/action-evidence", protect, machineryNonComplianceUpload, addMachineryNonComplianceActionEvidence);
router.get("/audit-chemical-verification", protect, getAuditChemicalVerification);
router.post("/audit-chemical-verification", protect, saveAuditChemicalVerification);
router.get("/chemical-non-compliances", protect, getChemicalNonCompliances);
router.post("/chemical-non-compliances", protect, chemicalNonComplianceUpload, createChemicalNonCompliance);
router.patch("/chemical-non-compliances/:recordId/action-evidence", protect, chemicalNonComplianceUpload, addChemicalNonComplianceActionEvidence);
router.get("/audit-reports", protect, getAuditReports);
router.get(
  "/:projectId/audits/:auditId/assessment-progress",
  protect,
  getAuditAssessmentProgress,
);
router.patch(
  "/:projectId/audits/:auditId/assessment-progress",
  protect,
  updateAuditAssessmentProgress,
);
router.get("/audit-reports/:reportId/download", protect, downloadAuditReport);
router.get(
  "/audit-reports/:reportId/download/word",
  protect,
  downloadAuditReportWord,
);
router.post("/audit-reports", protect, saveAuditReport);
router.post(
  "/audit-reports/signature",
  protect,
  authorize("AUDITOR"),
  saveAuditorSignature,
);
router.delete(
  "/audit-reports/signature",
  protect,
  authorize("AUDITOR"),
  clearAuditorSignature,
);
router.get(
  "/audit-reports/:reportId/download/open-nc",
  protect,
  authorize("AUDITOR"),
  downloadOpenNcReport,
);
router.patch("/audit-reports/:reportId/complete", protect, completeAuditReport);
router.post("/audits/:auditId/re-audit", protect, startNewAuditCycle);
router.get(
  "/audits/:auditId/previous-nc-reviews",
  protect,
  getPreviousNcReviews,
);
router.patch(
  "/audits/:auditId/previous-nc-reviews/:reviewId",
  protect,
  reviewUpload,
  updatePreviousNcReview,
);
router.get(
  "/audits/:auditId/next-audit-updates",
  protect,
  getNextAuditUpdateSelections,
);
router.post(
  "/audits/:auditId/next-audit-updates",
  protect,
  queueNextAuditUpdate,
);
router.delete(
  "/audits/:auditId/next-audit-updates/:selectionId",
  protect,
  removeNextAuditUpdate,
);
router.get("/:projectId/audits/:auditId/timer", protect, getAuditTimer);
router.post("/:projectId/audits/:auditId/timer/start", protect, startAuditTimer);
router.patch("/:projectId/audits/:auditId/timer", protect, updateAuditTimer);

module.exports = router;


