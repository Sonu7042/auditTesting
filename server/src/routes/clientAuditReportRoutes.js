const router = require("express").Router();
const controller = require("../controllers/clientAuditReportController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

router.use(protect);
router.get("/", authorize("ADMIN", "AUDITOR", "CORPORATE_MANAGER", "REGIONAL_MANAGER", "ZONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"), controller.list);
router.post("/jobs/:jobId/generate", authorize("ADMIN", "AUDITOR"), controller.generate);
router.patch("/:reportId/review", authorize("ADMIN", "AUDITOR"), controller.review);
router.post("/:reportId/corrections", authorize("ADMIN"), controller.createCorrection);
router.patch("/corrections/:correctionId/submit", authorize("AUDITOR"), controller.correctionEvidenceUpload, controller.submitCorrection);
router.patch("/corrections/:correctionId/review", authorize("ADMIN"), controller.reviewCorrection);
router.get("/:reportId/pdf", authorize("ADMIN", "AUDITOR", "CORPORATE_MANAGER", "REGIONAL_MANAGER", "ZONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"), controller.pdf);

module.exports = router;
