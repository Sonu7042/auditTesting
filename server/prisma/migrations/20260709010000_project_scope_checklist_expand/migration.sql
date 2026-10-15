-- Migration A (expand): make ProjectChecklistSection project-scoped and give
-- AuditQuestionResponse its own auditId, without yet dropping the old columns.
-- This keeps the app working on the old auditId-based columns during rollout
-- while the new columns are backfilled, per the three-phase (expand/migrate/contract)
-- plan for fixing duplicate checklist data across audit cycles.

-- AddColumn (nullable for now, backfilled below)
ALTER TABLE "ProjectChecklistSection" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ProjectChecklistSection" ADD COLUMN "checklistType" TEXT;

-- Backfill from the still-present auditId -> Audit.projectId / Audit.checklistType
UPDATE "ProjectChecklistSection" pcs
SET "projectId" = a."projectId",
    "checklistType" = a."checklistType"
FROM "Audit" a
WHERE pcs."auditId" = a.id;

-- AddColumn (nullable for now, backfilled below)
ALTER TABLE "AuditQuestionResponse" ADD COLUMN "auditId" TEXT;

-- Backfill using the OLD question -> section -> auditId path, before any
-- section/question consolidation happens.
UPDATE "AuditQuestionResponse" aqr
SET "auditId" = pcs."auditId"
FROM "ProjectChecklistQuestion" pcq
JOIN "ProjectChecklistSection" pcs ON pcq."sectionId" = pcs.id
WHERE aqr."questionId" = pcq.id;

-- AddForeignKey
ALTER TABLE "ProjectChecklistSection" ADD CONSTRAINT "ProjectChecklistSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditQuestionResponse" ADD CONSTRAINT "AuditQuestionResponse_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProjectChecklistSection_projectId_checklistType_idx" ON "ProjectChecklistSection"("projectId", "checklistType");

CREATE INDEX "AuditQuestionResponse_auditId_responseType_idx" ON "AuditQuestionResponse"("auditId", "responseType");

-- Replace the old (questionId, auditorId) uniqueness with (questionId, auditorId, auditId)
-- so that one auditor can have one answer per question PER CYCLE instead of globally.
DROP INDEX "AuditQuestionResponse_questionId_auditorId_key";
CREATE UNIQUE INDEX "AuditQuestionResponse_questionId_auditorId_auditId_key" ON "AuditQuestionResponse"("questionId", "auditorId", "auditId");
