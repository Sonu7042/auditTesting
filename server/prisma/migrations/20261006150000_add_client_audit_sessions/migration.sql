CREATE TABLE "ClientAuditSession" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "deviceId" TEXT NOT NULL,
    "checkInLatitude" DOUBLE PRECISION NOT NULL,
    "checkInLongitude" DOUBLE PRECISION NOT NULL,
    "gpsAccuracy" DOUBLE PRECISION NOT NULL,
    "distanceFromSiteM" DOUBLE PRECISION NOT NULL,
    "checkInEvidenceUrl" TEXT NOT NULL,
    "checkInEvidencePublicId" TEXT,
    "checkInEvidenceName" TEXT,
    "checkInEvidenceMimeType" TEXT,
    "evidenceHash" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientAuditSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAuditSessionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientAuditSession_jobId_auditorId_key" ON "ClientAuditSession"("jobId", "auditorId");
CREATE INDEX "ClientAuditSession_auditorId_status_idx" ON "ClientAuditSession"("auditorId", "status");
CREATE INDEX "ClientAuditSession_jobId_status_idx" ON "ClientAuditSession"("jobId", "status");
CREATE INDEX "ClientAuditSessionEvent_sessionId_createdAt_idx" ON "ClientAuditSessionEvent"("sessionId", "createdAt");
ALTER TABLE "ClientAuditSession" ADD CONSTRAINT "ClientAuditSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClientAuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditSession" ADD CONSTRAINT "ClientAuditSession_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAuditSessionEvent" ADD CONSTRAINT "ClientAuditSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClientAuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
