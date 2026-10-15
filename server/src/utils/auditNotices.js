const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("./notificationService");
const { sendEmail } = require("./sendEmail");

const DAY = 24 * 60 * 60 * 1000;
const KINDS = [
  { kind: "T7", daysBefore: 7, label: "7-day reminder and logistics confirmation" },
  { kind: "T3", daysBefore: 3, label: "Auditor deployment check" },
  { kind: "T1", daysBefore: 1, label: "Deployment verification and arrival tracking" },
];

// Creates the communication-audit-trail rows for a job. The scheduling notice
// is recorded as sent; the reminders are queued for the worker below.
const scheduleNotices = async (job) => {
  const rows = [{ jobId: job.id, kind: "SCHEDULED", dueAt: new Date(), status: "SENT", sentAt: new Date(), recipient: job.location?.contactEmail || null, note: "Dealer informed of the audit schedule" }];
  for (const k of KINDS) {
    const dueAt = new Date(job.scheduledStart.getTime() - k.daysBefore * DAY);
    rows.push({ jobId: job.id, kind: k.kind, dueAt, status: dueAt <= new Date() ? "MISSED" : "PENDING", recipient: job.location?.contactEmail || null, note: k.label });
  }
  await prisma.clientAuditNotice.createMany({ data: rows, skipDuplicates: true });
};

const deliver = async (notice) => {
  const job = await prisma.clientAuditJob.findUnique({ where: { id: notice.jobId }, include: { location: true, assignments: true } });
  if (!job || job.status === "CANCELLED") return prisma.clientAuditNotice.update({ where: { id: notice.id }, data: { status: "SKIPPED" } });
  const meta = KINDS.find((k) => k.kind === notice.kind);
  const when = job.scheduledStart.toLocaleString("en-IN");
  const text = `${meta?.label || notice.kind}: audit at ${job.location.dealerName} - ${job.location.locationName} on ${when}.`;
  const targets = notice.kind === "T1" || notice.kind === "T3" ? job.assignments.map((a) => a.auditorId) : [];
  for (const auditorId of targets) {
    await createNotification({ title: meta?.label || "Audit reminder", message: text, type: NOTIFICATION_TYPES.AUDIT_SCHEDULED, recipientId: auditorId, link: "/auditor-dashboard/new-report" }).catch(() => null);
  }
  await createNotification({ title: meta?.label || "Audit reminder", message: text, type: NOTIFICATION_TYPES.AUDIT_SCHEDULED, recipientRole: "ADMIN", link: "/admin-dashboard/client-audit-scheduling" }).catch(() => null);
  const mail = await sendEmail([job.location.contactEmail], `Audit reminder - ${job.location.dealerName}`, `Hello ${job.location.contactName},\n\n${text}\n\nRegards,\nAudit Portal`);
  return prisma.clientAuditNotice.update({ where: { id: notice.id }, data: { status: "SENT", sentAt: new Date(), note: `${notice.note || ""}${mail ? "" : " (email not configured)"}`.trim() } });
};

const runDueNotices = async () => {
  const due = await prisma.clientAuditNotice.findMany({ where: { status: "PENDING", dueAt: { lte: new Date() } } });
  for (const notice of due) await deliver(notice).catch((error) => console.error("Notice failed:", error.message));
  return due.length;
};

let timer = null;
const startNoticeWorker = () => {
  if (timer) return;
  timer = setInterval(() => runDueNotices().catch(() => null), 10 * 60 * 1000);
  timer.unref?.();
};

module.exports = { scheduleNotices, runDueNotices, startNoticeWorker };
