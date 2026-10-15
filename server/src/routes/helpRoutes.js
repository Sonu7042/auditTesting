const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const c = require("../controllers/helpController");

const router = express.Router();
router.use(protect);

router.get("/meta", c.meta);
router.get("/bootstrap", c.bootstrap);
router.get("/policies", c.policies);
router.post("/policies/acknowledge", c.acknowledge);
router.get("/guide", c.guide);
router.post("/guide/progress", c.guideProgress);
router.get("/training", c.training);
router.post("/training/:id/complete", c.completeTraining);

router.get("/tickets", c.listTickets);
router.post("/tickets", c.createTicket);
router.get("/tickets/:id", c.ticket);
router.post("/tickets/:id/messages", c.reply);
router.patch("/tickets/:id", authorize("ADMIN"), c.updateTicket);

router.get("/admin/policies", authorize("ADMIN"), c.adminPolicies);
router.post("/admin/policies", authorize("ADMIN"), c.savePolicy);
router.put("/admin/policies/:id", authorize("ADMIN"), c.savePolicy);
router.get("/admin/policies/:id/acknowledgements", authorize("ADMIN"), c.policyAcks);
router.get("/admin/training", authorize("ADMIN"), c.adminTraining);
router.post("/admin/training", authorize("ADMIN"), c.saveTraining);
router.put("/admin/training/:id", authorize("ADMIN"), c.saveTraining);
router.delete("/admin/training/:id", authorize("ADMIN"), c.deleteTraining);

module.exports = router;
