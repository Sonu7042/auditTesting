CREATE TABLE "AuditScheduleHistory" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "previousDate" TIMESTAMP(3) NOT NULL,
  "newDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "rescheduledById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditScheduleHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditScheduleHistory_scheduleId_createdAt_idx" ON "AuditScheduleHistory"("scheduleId", "createdAt");
ALTER TABLE "AuditScheduleHistory" ADD CONSTRAINT "AuditScheduleHistory_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AuditSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditScheduleHistory" ADD CONSTRAINT "AuditScheduleHistory_rescheduledById_fkey" FOREIGN KEY ("rescheduledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
