const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createWorker,
  createWorkerRole,
  deleteWorker,
  getWorkerRoles,
  getWorkersByProject,
  requestWorkerCorrection,
  submitWorkersToAdmin,
  updateWorker,
  updateWorkerStatus,
} = require("../controllers/userDashboard/createWorker");
const {
  createMachinery,
  deleteMachinery,
  getMachineriesByProject,
  machineryDocumentUpload,
  requestMachineryCorrection,
  submitMachineriesToAdmin,
  updateMachinery,
  updateMachineryStatus,
} = require("../controllers/userDashboard/createMachinery");
const {
  chemicalDocumentUpload,
  createChemical,
  deleteChemical,
  getChemicalsByProject,
  submitChemicalsToAdmin,
  requestChemicalCorrection,
  updateChemical,
  updateChemicalStatus,
} = require("../controllers/userDashboard/createChemical");

const router = express.Router();

router.get("/worker-roles", protect, getWorkerRoles);
router.post("/worker-roles", protect, createWorkerRole);
router.get("/projects/:projectId/workers", protect, getWorkersByProject);
router.post("/projects/:projectId/workers", protect, createWorker);
router.patch("/projects/:projectId/workers/submit", protect, submitWorkersToAdmin);
router.patch(
  "/projects/:projectId/workers/:workerId/correction-request",
  protect,
  requestWorkerCorrection
);
router.patch("/projects/:projectId/workers/:workerId", protect, updateWorker);
router.patch(
  "/projects/:projectId/workers/:workerId/status",
  protect,
  updateWorkerStatus
);
router.delete("/projects/:projectId/workers/:workerId", protect, deleteWorker);

router.get("/projects/:projectId/machineries", protect, getMachineriesByProject);
router.post(
  "/projects/:projectId/machineries",
  protect,
  machineryDocumentUpload,
  createMachinery
);
router.patch(
  "/projects/:projectId/machineries/submit",
  protect,
  submitMachineriesToAdmin
);
router.patch(
  "/projects/:projectId/machineries/:machineryId/correction-request",
  protect,
  requestMachineryCorrection
);
router.patch(
  "/projects/:projectId/machineries/:machineryId",
  protect,
  machineryDocumentUpload,
  updateMachinery
);
router.patch(
  "/projects/:projectId/machineries/:machineryId/status",
  protect,
  updateMachineryStatus
);
router.delete(
  "/projects/:projectId/machineries/:machineryId",
  protect,
  deleteMachinery
);

router.get("/projects/:projectId/chemicals", protect, getChemicalsByProject);
router.post(
  "/projects/:projectId/chemicals",
  protect,
  chemicalDocumentUpload,
  createChemical
);
router.patch(
  "/projects/:projectId/chemicals/submit",
  protect,
  submitChemicalsToAdmin
);
router.patch(
  "/projects/:projectId/chemicals/:chemicalId/correction-request",
  protect,
  requestChemicalCorrection
);
router.patch(
  "/projects/:projectId/chemicals/:chemicalId",
  protect,
  chemicalDocumentUpload,
  updateChemical
);
router.patch(
  "/projects/:projectId/chemicals/:chemicalId/status",
  protect,
  updateChemicalStatus
);
router.delete(
  "/projects/:projectId/chemicals/:chemicalId",
  protect,
  deleteChemical
);

module.exports = router;
