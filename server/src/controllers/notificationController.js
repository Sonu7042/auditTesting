const prisma = require("../config/prisma");

// A user can receive a notification directly or through their role. Include
// both scopes so targeted admin notifications are not hidden by the broader
// ADMIN role scope (and the same rule works consistently for every role).
const getNotificationScope = (req) => {
  const userId = req.user?.id || "__none__";
  const role = req.user?.role || "__none__";

  return {
    OR: [
      { recipientId: userId },
      { recipientRole: role },
    ],
  };
};

const notificationInclude = {
  createdBy: {
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
    },
  },
};

exports.getNotifications = async (req, res) => {
  try {
    const scope = getNotificationScope(req);

    const notifications = await prisma.notification.findMany({
      where: {
        ...scope,
        isRead: false,
      },
      include: notificationInclude,
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
    });

    res.json({
      success: true,
      data: notifications,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getNotificationHistory = async (req, res) => {
  try {
    const scope = getNotificationScope(req);
    const take = Math.min(Number(req.query.limit) || 30, 100);
    const skip = Number(req.query.offset) || 0;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: scope,
        include: notificationInclude,
        orderBy: {
          createdAt: "desc",
        },
        take,
        skip,
      }),
      prisma.notification.count({ where: scope }),
    ]);

    res.json({
      success: true,
      data: notifications,
      total,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    const scope = getNotificationScope(req);
    const { notificationId, auditId, sectionId, questionId } = req.body;

    if (!notificationId && !auditId && !sectionId && !questionId) {
      return res.status(400).json({
        success: false,
        message: "Notification or related target is required",
      });
    }

    const where = {
      ...scope,
      isRead: false,
      ...(notificationId ? { id: notificationId } : {}),
      ...(!notificationId && auditId ? { auditId } : {}),
      ...(!notificationId && sectionId ? { sectionId } : {}),
      ...(!notificationId && questionId ? { questionId } : {}),
    };

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    res.json({
      success: true,
      count: result.count,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const scope = getNotificationScope(req);

    const result = await prisma.notification.updateMany({
      where: { ...scope, isRead: false },
      data: { isRead: true },
    });

    res.json({
      success: true,
      count: result.count,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const scope = getNotificationScope(req);
    const { notificationId } = req.params;

    const result = await prisma.notification.deleteMany({
      where: { ...scope, id: notificationId },
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
