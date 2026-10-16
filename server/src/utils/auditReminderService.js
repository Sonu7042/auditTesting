const prisma = require("../config/prisma");
const { sendEmail } = require("./sendEmail");

const DEFAULT_DAYS_BEFORE = [7, 1, 0];
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const parseReminderDays = () => {
  const configured = process.env.AUDIT_REMINDER_DAYS;
  if (!configured) return DEFAULT_DAYS_BEFORE;
  const values = [...new Set(configured.split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 0))];
  return values.length ? values.sort((a, b) => b - a) : DEFAULT_DAYS_BEFORE;
};

const startOfUtcDay = (value = new Date()) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const addUtcDays = (value, days) => new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

const reminderSubject = (schedule, daysBefore) => {
  const timing = daysBefore === 0 ? "today" : daysBefore === 1 ? "tomorrow" : `in ${daysBefore} days`;
  return `Audit reminder: ${schedule.project.projectName} ${timing}`;
};

const reminderMessage = (schedule, auditor, daysBefore) => {
  const formattedDate = schedule.date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "UTC",
  });
  const timing = daysBefore === 0 ? "today" : daysBefore === 1 ? "tomorrow" : `in ${daysBefore} days`;
  return [
    `Hello ${auditor.fullName},`,
    "",
    `This is a reminder that your ${schedule.audit.auditType} audit for ${schedule.project.projectName} is scheduled ${timing}, on ${formattedDate}.`,
    "",
    "Please sign in to the Audit Portal to review the schedule and prepare for the audit.",
    "",
    "Regards,",
    "Audit Portal",
  ].join("\n");
};

const claimDelivery = async (schedule, auditor, daysBefore) => {
  const key = {
    scheduleId_auditorId_auditDate_daysBefore: {
      scheduleId: schedule.id,
      auditorId: auditor.id,
      auditDate: schedule.date,
      daysBefore,
    },
  };
  try {
    return await prisma.auditReminderDelivery.create({
      data: { scheduleId: schedule.id, auditorId: auditor.id, auditDate: schedule.date, daysBefore },
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }

  const existing = await prisma.auditReminderDelivery.findUnique({ where: key });
  if (!existing || existing.status === "SENT" || existing.attempts >= MAX_ATTEMPTS) return null;
  if (Date.now() - existing.lastAttemptAt.getTime() < RETRY_AFTER_MS) return null;

  const claimed = await prisma.auditReminderDelivery.updateMany({
    where: { id: existing.id, status: existing.status, lastAttemptAt: existing.lastAttemptAt },
    data: { status: "PENDING", attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null },
  });
  return claimed.count ? existing : null;
};

const deliverReminder = async (schedule, assignment, daysBefore) => {
  const auditor = assignment.user;
  if (!auditor.email || !auditor.status) return;
  const delivery = await claimDelivery(schedule, auditor, daysBefore);
  if (!delivery) return;

  try {
    await sendEmail(
      [auditor.email],
      reminderSubject(schedule, daysBefore),
      reminderMessage(schedule, auditor, daysBefore),
      { throwOnError: true },
    );
    await prisma.auditReminderDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
  } catch (error) {
    await prisma.auditReminderDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: String(error.message || error).slice(0, 1000) },
    });
  }
};

const runAuditReminders = async () => {
  const today = startOfUtcDay();
  for (const daysBefore of parseReminderDays()) {
    const targetStart = addUtcDays(today, daysBefore);
    const targetEnd = addUtcDays(targetStart, 1);
    const schedules = await prisma.auditSchedule.findMany({
      where: { date: { gte: targetStart, lt: targetEnd } },
      include: {
        project: { select: { projectName: true } },
        audit: { select: { auditType: true } },
        auditors: { include: { user: { select: { id: true, fullName: true, email: true, status: true } } } },
      },
    });
    for (const schedule of schedules) {
      await Promise.all(schedule.auditors.map((assignment) => deliverReminder(schedule, assignment, daysBefore)));
    }
  }
};

const startAuditReminderWorker = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("Audit email reminders disabled: EMAIL_USER and EMAIL_PASS are required.");
    return null;
  }
  const configuredInterval = Number(process.env.AUDIT_REMINDER_INTERVAL_MINUTES);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 5
    ? configuredInterval * 60 * 1000
    : DEFAULT_INTERVAL_MS;
  const run = () => runAuditReminders().catch((error) => console.error("Audit reminder worker error:", error));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  console.log(`Audit email reminders enabled for ${parseReminderDays().join(", ")} day(s) before each audit.`);
  return timer;
};

module.exports = { parseReminderDays, runAuditReminders, startAuditReminderWorker };
