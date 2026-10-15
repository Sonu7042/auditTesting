const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const c = require("../controllers/governanceController");

const router = express.Router();
const VIEW = ["ADMIN", "CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"];

router.get("/verify/:code", c.verify);
router.use(protect);
router.get("/summary", authorize(...VIEW), c.summary);
router.get("/leaderboard", authorize(...VIEW), c.leaderboard);
router.get("/certificates", authorize(...VIEW), c.listCertificates);
router.get("/certificates/:id/pdf", authorize(...VIEW), c.certificatePdf);
router.get("/periods", authorize("ADMIN"), c.listPeriods);
router.post("/periods", authorize("ADMIN"), c.createPeriod);
router.post("/periods/:id/close", authorize("ADMIN"), c.closePeriod);
router.post("/certificates/:id/decision", authorize("ADMIN"), c.approveCertificate);
router.get("/access/site/:locationId", authorize("ADMIN"), c.siteAccess);
router.get("/access/options", authorize("ADMIN"), c.accessOptions);
router.get("/access/users", authorize("ADMIN"), c.listUsers);
router.post("/access/users", authorize("ADMIN"), c.createUser);
router.post("/access/users/:id/reset-password", authorize("ADMIN"), c.resetPassword);
router.patch("/access/users/:id/status", authorize("ADMIN"), c.setUserStatus);
module.exports = router;
