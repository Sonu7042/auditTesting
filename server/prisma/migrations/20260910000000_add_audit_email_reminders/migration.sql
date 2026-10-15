CREATE TABLE "AuditReminderDelivery" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "auditorId" TEXT NOT NULL,
  "auditDate" TIMESTAMP(3) NOT NULL,
  "daysBefore" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditReminderDelivery_scheduleId_auditorId_auditDate_daysBefore_key"
ON "AuditReminderDelivery"("scheduleId", "auditorId", "auditDate", "daysBefore");

CREATE INDEX "AuditReminderDelivery_status_lastAttemptAt_idx"
ON "AuditReminderDelivery"("status", "lastAttemptAt");

ALTER TABLE "AuditReminderDelivery" ADD CONSTRAINT "AuditReminderDelivery_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "AuditSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditReminderDelivery" ADD CONSTRAINT "AuditReminderDelivery_auditorId_fkey"
FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
