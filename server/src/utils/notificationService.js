const prisma = require("../config/prisma");
const { broadcastNotification } = require("./notificationSocket");

const NOTIFICATION_TYPES = {
  CHECKLIST_QUESTION_ADDED: "CHECKLIST_QUESTION_ADDED",
  CHECKLIST_SUBCATEGORY_ADDED: "CHECKLIST_SUBCATEGORY_ADDED",

  WORKFORCE_SUBMITTED: "WORKFORCE_SUBMITTED",
  WORKFORCE_APPROVED: "WORKFORCE_APPROVED",
  WORKFORCE_REJECTED: "WORKFORCE_REJECTED",

  MACHINERY_SUBMITTED: "MACHINERY_SUBMITTED",
  MACHINERY_APPROVED: "MACHINERY_APPROVED",
  MACHINERY_REJECTED: "MACHINERY_REJECTED",

  CHEMICAL_SUBMITTED: "CHEMICAL_SUBMITTED",
  CHEMICAL_APPROVED: "CHEMICAL_APPROVED",
  CHEMICAL_REJECTED: "CHEMICAL_REJECTED",

  DOCUMENT_SUBMITTED: "DOCUMENT_SUBMITTED",
  DOCUMENT_APPROVED: "DOCUMENT_APPROVED",
  DOCUMENT_REJECTED: "DOCUMENT_REJECTED",

  AUDITOR_ASSIGNED: "AUDITOR_ASSIGNED",
  AUDIT_SCHEDULED: "AUDIT_SCHEDULED",
  AUDIT_RESCHEDULED: "AUDIT_RESCHEDULED",
  AUDIT_CYCLE_STARTED: "AUDIT_CYCLE_STARTED",
  AUDIT_STARTED: "AUDIT_STARTED",
  AUDIT_OVERDUE_ESCALATION: "AUDIT_OVERDUE_ESCALATION",

  NC_RAISED: "NC_RAISED",
  AUDIT_REPORT_COMPLETED: "AUDIT_REPORT_COMPLETED",
  CLIENT_AUDIT_COMPLETED: "CLIENT_AUDIT_COMPLETED",
  CLIENT_NC_CAPA_SUBMITTED: "CLIENT_NC_CAPA_SUBMITTED",
  NC_PUBLISHED: "NC_PUBLISHED",
};

// Every notification-creating call site should go through this one function
// so recipients are always resolved consistently and every notification is
// pushed over the socket the same way. Pass exactly one of recipientRole /
// recipientId (or both, if a future case genuinely needs it).
const createNotification = async ({
  title,
  message,
  type,
  recipientRole = null,
  recipientId = null,
  projectId = null,
  auditId = null,
  sectionId = null,
  questionId = null,
  createdById = null,
  link = null,
}) => {
  if (!recipientRole && !recipientId) return null;

  const notification = await prisma.notification.create({
    data: {
      title,
      message,
      type,
      recipientRole,
      recipientId,
      projectId,
      auditId,
      sectionId,
      questionId,
      createdById,
      link,
    },
    include: {
      createdBy: {
        select: { id: true, fullName: true, username: true, role: true },
      },
    },
  });

  broadcastNotification(notification);

  return notification;
};

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
};
