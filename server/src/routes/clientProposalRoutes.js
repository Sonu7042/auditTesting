const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const c = require("../controllers/clientProposalController");

const router = express.Router();
router.use(protect);
router.post("/", authorize("AUDITOR"), c.create);
router.get("/", authorize("ADMIN", "AUDITOR"), c.list);
router.post("/:id/admin-review", authorize("ADMIN"), c.adminReview);
router.post("/:id/sgs-review", authorize("ADMIN"), c.sgsReview);
module.exports = router;
