const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const hub = require("../controllers/adminHubController");

const router = express.Router();
router.use(protect);
// The hierarchy is scoped to what each user may see, so managers can open it too.
router.get("/hierarchy", authorize("ADMIN", "CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER"), hub.hierarchy);
router.use(authorize("ADMIN"));
router.get("/approvals", hub.approvals);
router.get("/instruments", hub.instruments);
router.get("/performance", hub.performance);
router.get("/demo-personas", hub.demoPersonas);
router.post("/demo-session", hub.demoSession);

module.exports = router;
