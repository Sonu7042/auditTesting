const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const c = require("../controllers/siteChangeController");

const router = express.Router();
router.use(protect);
router.get("/", authorize("ADMIN", "AUDITOR", "SITE_INCHARGE", "SITE_USER", "REGIONAL_MANAGER", "ZONAL_MANAGER", "CORPORATE_MANAGER"), c.list);
router.post("/", authorize("AUDITOR", "SITE_INCHARGE", "SITE_USER"), c.create);
router.post("/:id/decision", authorize("ADMIN"), c.decide);

module.exports = router;
