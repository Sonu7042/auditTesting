const express = require("express");

const router = express.Router();

const { createCompany, getCompanies, getCompany, updateCompany, deleteCompany} = require("../controllers/company/createCompany")

const {protect} = require("../middleware/authMiddleware")
const {authorize} = require("../middleware/roleMiddleware")

router.post("/create-company", protect, authorize("ADMIN"), createCompany);
router.get("/getcompanies", protect, authorize("ADMIN"), getCompanies);
router.get("/getCompany/:id", protect, authorize("ADMIN"), getCompany);
router.put("/updateCompany/:id", protect, authorize("ADMIN"), updateCompany);
router.delete("/deleteCompany/:id", protect, authorize("ADMIN"), deleteCompany);



module.exports = router




