const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getNotifications, getNotificationHistory, markNotificationsRead, markAllNotificationsRead, deleteNotification } = require("../controllers/notificationController");

const router = express.Router();

router.get("/", protect, getNotifications);
router.get("/history", protect, getNotificationHistory);
router.patch("/read", protect, markNotificationsRead);
router.patch("/read-all", protect, markAllNotificationsRead);
router.delete("/:notificationId", protect, deleteNotification);

module.exports = router;
