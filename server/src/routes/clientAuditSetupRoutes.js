const express = require("express");
const upload = require("../utils/multer");
const site = require("../controllers/siteSetupController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const controller = require("../controllers/clientAuditSetupController");
const checklistController = require("../controllers/clientChecklistController");
const bulk = require("../controllers/bulkImportController");

const router = express.Router();
router.use(protect);
// A site's own page is readable by the users who cover that site; everything else here is admin only.
router.get("/locations/:locationId/overview", authorize("ADMIN", "CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"), site.siteOverview);
router.use(authorize("ADMIN"));

// Repeatable Excel imports for companies, auditors and users (sites, tools, manpower and checklists are imported below).
router.get("/imports/:kind/template", bulk.template);
router.post("/imports/:kind", upload.single("file"), bulk.importFile);

router.get("/options", controller.getSetupOptions);
router.get("/checklists/constants", checklistController.getConstants);
router.get("/checklists/versions", checklistController.getVersions);
router.post("/checklists/versions", checklistController.createVersion);
router.get("/checklists/versions/:versionId", checklistController.getVersion);
router.post("/checklists/versions/:versionId/items", checklistController.createItem);
router.put("/checklists/versions/:versionId/items/:itemId", checklistController.updateItem);
router.delete("/checklists/versions/:versionId/items/:itemId", checklistController.deleteItem);
router.post("/checklists/versions/:versionId/starter-items", checklistController.addStarterItems);
router.get("/checklists/template", checklistController.checklistTemplate);
router.post("/checklists/versions/:versionId/import", upload.single("file"), checklistController.importItems);
router.post("/checklists/versions/:versionId/demo-pack", checklistController.addDemoPack);
router.post("/checklists/versions/:versionId/publish", checklistController.publishVersion);
router.get("/locations/:locationId/checklist-preview", checklistController.previewLocationChecklist);
router.post("/locations/:locationId/checklist-snapshots", checklistController.generateLocationSnapshot);
router.get("/locations/:locationId/checklist-snapshots", checklistController.getLocationSnapshots);
router.get("/companies/overview", site.companiesOverview);
router.get("/companies/:companyId/sites", site.companySites);
router.get("/companies/:companyId/checklists", site.companyChecklists);
router.get("/registers-template", site.registersTemplate);
router.post("/companies/:companyId/checklists/upload", upload.single("file"), site.uploadChecklist);
router.post("/site-requests/:id/fill-from-excel", upload.single("file"), site.fillFromExcel);
router.post("/site-requests/:id/registers", upload.single("file"), site.importRegistersToRequest);
router.post("/locations/:locationId/registers", upload.single("file"), site.importRegistersToSite);
router.get("/site-requests/template", site.downloadTemplate);
router.post("/site-requests/import", upload.single("file"), site.importSites);
router.get("/site-requests", site.listRequests);
router.post("/site-requests", site.createRequest);
router.get("/site-requests/:id", site.getRequest);
router.put("/site-requests/:id", site.updateRequest);
router.delete("/site-requests/:id", site.deleteRequest);
router.post("/site-requests/:id/submit", site.submitRequest);
router.post("/site-requests/:id/return", site.returnRequest);
router.post("/site-requests/:id/reject", site.rejectRequest);
router.post("/site-requests/:id/approve", site.approveRequest);
router.get("/programmes", controller.getProgrammes);
router.post("/programmes", controller.createProgramme);
router.get("/locations", controller.getLocations);
router.post("/locations", controller.createLocation);
router.get("/locations/:locationId", controller.getLocation);
router.put("/locations/:locationId", controller.updateLocation);

module.exports = router;

