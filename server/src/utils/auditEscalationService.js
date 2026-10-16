const prisma = require("../config/prisma");
const { sendEmail } = require("./sendEmail");
const { createNotification, NOTIFICATION_TYPES } = require("./notificationService");

const DEFAULT_LEVELS = [1, 3, 7];
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const parseEscalationDays = () => {
  const configured = process.env.AUDIT_ESCALATION_DAYS;
  if (!configured) return DEFAULT_LEVELS;
  const values = [...new Set(configured.split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  return values.length ? values.sort((a, b) => a - b) : DEFAULT_LEVELS;
};

const startOfUtcDay = (value = new Date()) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const daysBetween = (start, end) => Math.floor((startOfUtcDay(end) - startOfUtcDay(start)) / 86400000);

const claimDelivery = async (schedule, recipient, overdueDays) => {
  const unique = {
    scheduleId_recipientId_scheduledDate_overdueDays: {
      scheduleId: schedule.id,
      recipientId: recipient.id,
      scheduledDate: schedule.date,
      overdueDays,
    },
  };
  try {
    return await prisma.auditEscalationDelivery.create({
      data: { scheduleId: schedule.id, recipientId: recipient.id, scheduledDate: schedule.date, overdueDays },
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }
  const existing = await prisma.auditEscalationDelivery.findUnique({ where: unique });
  if (!existing || existing.status === "SENT" || existing.attempts >= MAX_ATTEMPTS) return null;
  if (Date.now() - existing.lastAttemptAt.getTime() < RETRY_AFTER_MS) return null;
  const claimed = await prisma.auditEscalationDelivery.updateMany({
    where: { id: existing.id, status: existing.status, lastAttemptAt: existing.lastAttemptAt },
    data: { status: "PENDING", attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
  });
  return claimed.count ? existing : null;
};

const dashboardLink = (role) => {
  if (role === "ADMIN") return "/admin-dashboard/shared-calendar";
  if (role === "AUDITOR") return "/auditor-dashboard/schedule";
  return "/user-dashboard/shared-calendar";
};

const deliverEscalation = async (schedule, recipient, overdueDays) => {
  const delivery = await claimDelivery(schedule, recipient, overdueDays);
  if (!delivery) return;
  const scheduledDate = schedule.date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const title = `Audit overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
  const message = `${schedule.audit.auditType} audit for ${schedule.project.projectName}, scheduled on ${scheduledDate}, is still incomplete.`;
  let notificationSentAt = delivery.notificationSentAt;
  let emailSentAt = delivery.emailSentAt;
  const errors = [];

  if (!notificationSentAt) {
    try {
      await createNotification({
        title,
        message,
        type: NOTIFICATION_TYPES.AUDIT_OVERDUE_ESCALATION,
        recipientId: recipient.id,
        projectId: schedule.projectId,
        auditId: schedule.auditId,
        link: dashboardLink(recipient.role),
      });
      notificationSentAt = new Date();
    } catch (error) {
      errors.push(`Notification: ${error.message || error}`);
    }
  }

  if (!emailSentAt && recipient.email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      await sendEmail(
        [recipient.email],
        `${title}: ${schedule.project.projectName}`,
        `Hello ${recipient.fullName},\n\n${message}\n\nAssigned auditor(s): ${schedule.auditors.map(({ user }) => user.fullName).join(", ") || "Unassigned"}\n\nPlease review this overdue audit in the Audit Portal.\n\nRegards,\nAudit Portal`,
        { throwOnError: true },
      );
      emailSentAt = new Date();
    } catch (error) {
      errors.push(`Email: ${error.message || error}`);
    }
  }

  const emailRequired = Boolean(recipient.email && process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const complete = Boolean(notificationSentAt && (!emailRequired || emailSentAt));
  await prisma.auditEscalationDelivery.update({
    where: { id: delivery.id },
    data: {
      notificationSentAt,
      emailSentAt,
      status: complete ? "SENT" : "FAILED",
      error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
    },
  });
};

const runAuditEscalations = async () => {
  const today = startOfUtcDay();
  const levels = parseEscalationDays();
  const [schedules, activeUsers] = await Promise.all([
    prisma.auditSchedule.findMany({
      where: {
        date: { lt: today },
        audit: { auditReports: { none: { status: "Completed" } } },
      },
      include: {
        audit: { select: { auditType: true } },
        project: {
          include: {
            corporateManager: { select: { id: true, fullName: true, email: true, role: true, status: true } },
            regionalManager: { select: { id: true, fullName: true, email: true, role: true, status: true } },
            siteIncharge: { select: { id: true, fullName: true, email: true, role: true, status: true } },
          },
        },
        auditors: { include: { user: { select: { fullName: true } } } },
      },
    }),
    // An overdue audit is a portal-wide escalation. Notify every active
    // account individually so it appears in that user's dashboard and can
    // also be delivered to the user's email address when one is available.
    prisma.user.findMany({
      where: { status: true },
      select: { id: true, fullName: true, email: true, role: true, status: true },
    }),
  ]);

  for (const schedule of schedules) {
    const actualOverdueDays = daysBetween(schedule.date, today);
    const eligibleLevels = levels.filter((level) => level <= actualOverdueDays);
    const dueLevels = eligibleLevels.length ? [Math.max(...eligibleLevels)] : [];
    const uniqueRecipients = [...new Map(activeUsers.map((user) => [user.id, user])).values()];
    for (const overdueDays of dueLevels) {
      await Promise.all(uniqueRecipients.map((recipient) => deliverEscalation(schedule, recipient, overdueDays)));
    }
  }
};

const startAuditEscalationWorker = () => {
  const configuredInterval = Number(process.env.AUDIT_ESCALATION_INTERVAL_MINUTES);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 5 ? configuredInterval * 60000 : DEFAULT_INTERVAL_MS;
  const run = () => runAuditEscalations().catch((error) => console.error("Audit escalation worker error:", error));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  console.log(`Audit escalations enabled for ${parseEscalationDays().join(", ")} overdue day(s).`);
  return timer;
};

module.exports = { parseEscalationDays, runAuditEscalations, startAuditEscalationWorker };
