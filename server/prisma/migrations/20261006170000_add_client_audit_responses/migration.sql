CREATE TABLE "ClientAuditQuestionResponse" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "snapshotItemId" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "answer" TEXT,
    "result" TEXT,
    "observation" TEXT,
    "measurementValue" DOUBLE PRECISION,
    "naReason" TEXT,
    "recommendation" TEXT,
    "responsiblePerson" TEXT,
    "targetDate" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientAuditQuestionResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditResponseEvidence" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "publicId" TEXT,
    "imageName" TEXT,
    "mimeType" TEXT,
    "fileHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAuditResponseEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditResponseRevision" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "previousResponse" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAuditResponseRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientAuditQuestionResponse_sessionId_snapshotItemId_key" ON "ClientAuditQuestionResponse"("sessionId", "snapshotItemId");
CREATE INDEX "ClientAuditQuestionResponse_sessionId_responseStatus_idx" ON "ClientAuditQuestionResponse"("sessionId", "responseStatus");
CREATE INDEX "ClientAuditQuestionResponse_snapshotItemId_idx" ON "ClientAuditQuestionResponse"("snapshotItemId");
CREATE INDEX "ClientAuditResponseEvidence_responseId_createdAt_idx" ON "ClientAuditResponseEvidence"("responseId", "createdAt");
CREATE UNIQUE INDEX "ClientAuditResponseRevision_responseId_revisionNumber_key" ON "ClientAuditResponseRevision"("responseId", "revisionNumber");
ALTER TABLE "ClientAuditQuestionResponse" ADD CONSTRAINT "ClientAuditQuestionResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClientAuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditQuestionResponse" ADD CONSTRAINT "ClientAuditQuestionResponse_snapshotItemId_fkey" FOREIGN KEY ("snapshotItemId") REFERENCES "LocationChecklistSnapshotItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAuditResponseEvidence" ADD CONSTRAINT "ClientAuditResponseEvidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ClientAuditQuestionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditResponseRevision" ADD CONSTRAINT "ClientAuditResponseRevision_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ClientAuditQuestionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
