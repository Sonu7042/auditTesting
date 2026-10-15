-- Audit cycle lineage
ALTER TABLE "Audit"
ADD COLUMN "cycleNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "previousAuditId" TEXT;

ALTER TABLE "Audit"
ADD CONSTRAINT "Audit_previousAuditId_fkey"
FOREIGN KEY ("previousAuditId") REFERENCES "Audit"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Audit_previousAuditId_idx" ON "Audit"("previousAuditId");

-- Report completion and stopped timers
ALTER TABLE "AuditReport"
ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "AuditTimer"
ADD COLUMN "stoppedAt" TIMESTAMP(3);

-- Associate operational findings and verifications with an audit cycle
ALTER TABLE "WorkforceNonCompliance" ADD COLUMN "auditId" TEXT;
ALTER TABLE "MachineryNonCompliance" ADD COLUMN "auditId" TEXT;
ALTER TABLE "ChemicalNonCompliance" ADD COLUMN "auditId" TEXT;
ALTER TABLE "AuditMachineryVerification" ADD COLUMN "auditId" TEXT;
ALTER TABLE "AuditChemicalVerification" ADD COLUMN "auditId" TEXT;

ALTER TABLE "WorkforceNonCompliance"
ADD CONSTRAINT "WorkforceNonCompliance_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MachineryNonCompliance"
ADD CONSTRAINT "MachineryNonCompliance_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChemicalNonCompliance"
ADD CONSTRAINT "ChemicalNonCompliance_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditMachineryVerification"
ADD CONSTRAINT "AuditMachineryVerification_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditChemicalVerification"
ADD CONSTRAINT "AuditChemicalVerification_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "AuditMachineryVerification_projectId_auditorId_key";
DROP INDEX IF EXISTS "AuditChemicalVerification_projectId_auditorId_key";

CREATE UNIQUE INDEX "AuditMachineryVerification_projectId_auditId_auditorId_key"
ON "AuditMachineryVerification"("projectId", "auditId", "auditorId");

CREATE UNIQUE INDEX "AuditChemicalVerification_projectId_auditId_auditorId_key"
ON "AuditChemicalVerification"("projectId", "auditId", "auditorId");

-- Mandatory previous NC review for re-audit cycles
CREATE TABLE "PreviousNcReview" (
    "id" TEXT NOT NULL,
    "currentAuditId" TEXT NOT NULL,
    "sourceAuditId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "auditorRemarks" TEXT,
    "closureDate" TIMESTAMP(3),
    "rootCauseAnalysis" TEXT,
    "correctiveActionsTaken" TEXT,
    "responsiblePerson" TEXT,
    "managementCompletionDate" TIMESTAMP(3),
    "actionRequired" TEXT,
    "actionOwner" TEXT,
    "targetDate" TIMESTAMP(3),
    "currentProgress" TEXT,
    "closureRemarks" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviousNcReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreviousNcClosureEvidence" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "imageName" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviousNcClosureEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreviousNcReview_currentAuditId_sourceType_sourceId_key"
ON "PreviousNcReview"("currentAuditId", "sourceType", "sourceId");

CREATE INDEX "PreviousNcReview_currentAuditId_auditorId_idx"
ON "PreviousNcReview"("currentAuditId", "auditorId");

ALTER TABLE "PreviousNcReview"
ADD CONSTRAINT "PreviousNcReview_currentAuditId_fkey"
FOREIGN KEY ("currentAuditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreviousNcReview"
ADD CONSTRAINT "PreviousNcReview_sourceAuditId_fkey"
FOREIGN KEY ("sourceAuditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreviousNcReview"
ADD CONSTRAINT "PreviousNcReview_auditorId_fkey"
FOREIGN KEY ("auditorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreviousNcClosureEvidence"
ADD CONSTRAINT "PreviousNcClosureEvidence_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "PreviousNcReview"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
