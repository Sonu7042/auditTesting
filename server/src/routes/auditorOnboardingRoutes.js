const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const c = require("../controllers/auditorOnboardingController");

const router = express.Router();
router.get("/verify/:code", c.verifyAuditor);
router.use(protect);

router.get("/me/training", authorize("AUDITOR"), c.myTraining);
router.post("/me/video-progress", authorize("AUDITOR"), c.myVideoProgress);
router.post("/me/submit", authorize("AUDITOR"), c.mySubmit);
router.post("/me/refresher", authorize("AUDITOR"), c.startRefresher);
router.get("/me/certificate/pdf", authorize("AUDITOR"), c.certificatePdf);
router.post("/me/photo", authorize("AUDITOR"), c.setMyPhoto);
router.get("/me/profile", authorize("AUDITOR"), c.myProfile);
router.post("/me/change-requests", authorize("AUDITOR"), c.requestChange);
router.get("/me/id-card", authorize("AUDITOR"), c.idCard);
router.get("/me/id-card/pdf", authorize("AUDITOR"), c.idCardPdf);
router.get("/me/authority-letter/pdf", authorize("AUDITOR"), c.letterPdf);

router.use(authorize("ADMIN"));
router.get("/content", c.getTrainingContent);
router.put("/content", c.saveTrainingContent);
router.get("/", c.list);
router.post("/", c.create);
router.get("/:userId", c.detail);
router.post("/:userId/photo", c.setPhoto);
router.put("/:userId/profile", c.updateProfile);
router.post("/:userId/change-requests/:requestId/decision", c.decideChange);
router.get("/:userId/certificate/pdf", c.certificatePdf);
router.get("/:userId/id-card", c.idCard);
router.get("/:userId/id-card/pdf", c.idCardPdf);
router.get("/:userId/authority-letter/pdf", c.letterPdf);
router.post("/:userId/resend-credentials", c.resendCredentials);
router.post("/:userId/review", c.review);
router.post("/:userId/approve", c.approve);
router.post("/:userId/reject", c.reject);
router.post("/:userId/retrain", c.sendForRetraining);
router.post("/:userId/scores", c.addScore);
router.put("/:userId/field-readiness", c.updateFieldReadiness);

module.exports = router;
