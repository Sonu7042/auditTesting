CREATE TABLE "AuditEscalationDelivery" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "scheduledDate" TIMESTAMP(3) NOT NULL,
  "overdueDays" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notificationSentAt" TIMESTAMP(3),
  "emailSentAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditEscalationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditEscalationDelivery_scheduleId_recipientId_scheduledDate_overdueDays_key"
ON "AuditEscalationDelivery"("scheduleId", "recipientId", "scheduledDate", "overdueDays");

CREATE INDEX "AuditEscalationDelivery_status_lastAttemptAt_idx"
ON "AuditEscalationDelivery"("status", "lastAttemptAt");

ALTER TABLE "AuditEscalationDelivery" ADD CONSTRAINT "AuditEscalationDelivery_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "AuditSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEscalationDelivery" ADD CONSTRAINT "AuditEscalationDelivery_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
