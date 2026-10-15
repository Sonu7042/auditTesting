const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const controller = require("../controllers/clientAuditJobController");
const sessionController = require("../controllers/clientAuditSessionController");

const router = express.Router();
router.use(protect);
router.get("/", authorize("ADMIN", "AUDITOR"), controller.getJobs);
router.get("/options", authorize("ADMIN"), controller.getOptions);
router.put("/auditors/:auditorId/qualification", authorize("ADMIN"), controller.upsertQualification);
router.post("/readiness", authorize("ADMIN"), controller.checkReadiness);
router.post("/", authorize("ADMIN"), controller.createJob);
router.get("/notices", authorize("ADMIN"), controller.listNotices);
router.post("/notices/run", authorize("ADMIN"), controller.runNotices);
router.get("/:jobId/check-in", authorize("AUDITOR"), sessionController.getCheckInDetails);
router.post("/:jobId/check-in", authorize("AUDITOR"), sessionController.checkInPhotoUpload, sessionController.checkIn);
router.get("/:jobId/session", authorize("AUDITOR"), sessionController.getSession);
router.get("/:jobId/completion-readiness", authorize("AUDITOR"), sessionController.getCompletionReadiness);
router.post("/:jobId/complete", authorize("AUDITOR"), sessionController.completeAudit);
router.put("/:jobId/session/responses/:snapshotItemId", authorize("AUDITOR"), sessionController.responseEvidenceUpload, sessionController.saveQuestionResponse);
router.patch("/:jobId/cancel", authorize("ADMIN"), controller.cancelJob);

module.exports = router;

