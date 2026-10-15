const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { login, me, changePassword } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.get("/me", protect, me);
router.post("/change-password", protect, changePassword);

module.exports = router;
