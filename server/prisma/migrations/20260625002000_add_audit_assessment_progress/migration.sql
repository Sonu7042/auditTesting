CREATE TABLE "AuditAssessmentProgress" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "visitedSections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditAssessmentProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditAssessmentProgress_projectId_auditId_auditorId_key"
ON "AuditAssessmentProgress"("projectId", "auditId", "auditorId");

ALTER TABLE "AuditAssessmentProgress"
ADD CONSTRAINT "AuditAssessmentProgress_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditAssessmentProgress"
ADD CONSTRAINT "AuditAssessmentProgress_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditAssessmentProgress"
ADD CONSTRAINT "AuditAssessmentProgress_auditorId_fkey"
FOREIGN KEY ("auditorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
