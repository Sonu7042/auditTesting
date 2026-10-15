CREATE TABLE "ClientAuditNonCompliance" (
 "id" TEXT NOT NULL, "ncNumber" TEXT NOT NULL, "responseId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "snapshotItemId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "severity" TEXT NOT NULL, "priority" TEXT NOT NULL, "observation" TEXT NOT NULL, "recommendation" TEXT,
 "rootCause" TEXT, "correctiveAction" TEXT, "preventiveAction" TEXT, "responsiblePerson" TEXT, "targetDate" TIMESTAMP(3), "capaSubmittedById" TEXT,
 "capaSubmittedAt" TIMESTAMP(3), "auditorRemarks" TEXT, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ClientAuditNonCompliance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientAuditNcEvidence" (
 "id" TEXT NOT NULL, "ncId" TEXT NOT NULL, "evidenceType" TEXT NOT NULL DEFAULT 'CAPA', "imageUrl" TEXT NOT NULL, "publicId" TEXT,
 "imageName" TEXT, "mimeType" TEXT, "fileHash" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ClientAuditNcEvidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientAuditNcHistory" (
 "id" TEXT NOT NULL, "ncId" TEXT NOT NULL, "action" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL, "remarks" TEXT,
 "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ClientAuditNcHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientAuditNonCompliance_ncNumber_key" ON "ClientAuditNonCompliance"("ncNumber");
CREATE UNIQUE INDEX "ClientAuditNonCompliance_responseId_key" ON "ClientAuditNonCompliance"("responseId");
CREATE INDEX "ClientAuditNonCompliance_jobId_status_idx" ON "ClientAuditNonCompliance"("jobId", "status");
CREATE INDEX "ClientAuditNonCompliance_sessionId_idx" ON "ClientAuditNonCompliance"("sessionId");
CREATE INDEX "ClientAuditNonCompliance_status_targetDate_idx" ON "ClientAuditNonCompliance"("status", "targetDate");
CREATE INDEX "ClientAuditNcEvidence_ncId_createdAt_idx" ON "ClientAuditNcEvidence"("ncId", "createdAt");
CREATE INDEX "ClientAuditNcHistory_ncId_createdAt_idx" ON "ClientAuditNcHistory"("ncId", "createdAt");
ALTER TABLE "ClientAuditNonCompliance" ADD CONSTRAINT "ClientAuditNonCompliance_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ClientAuditQuestionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditNcEvidence" ADD CONSTRAINT "ClientAuditNcEvidence_ncId_fkey" FOREIGN KEY ("ncId") REFERENCES "ClientAuditNonCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditNcHistory" ADD CONSTRAINT "ClientAuditNcHistory_ncId_fkey" FOREIGN KEY ("ncId") REFERENCES "ClientAuditNonCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
