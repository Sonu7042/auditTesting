-- Migration C (contract): finalize the project-scoped checklist model.
-- Run ONLY after Migration A has been applied and the consolidation script
-- (server/scripts/consolidate-project-checklists.js) has been run for real
-- against this database, so every ProjectChecklistSection/Question row is
-- already deduplicated per (project, checklistType) and every
-- AuditQuestionResponse.auditId is populated.

-- Make the new columns mandatory now that they are fully backfilled.
ALTER TABLE "ProjectChecklistSection" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "ProjectChecklistSection" ALTER COLUMN "checklistType" SET NOT NULL;
ALTER TABLE "AuditQuestionResponse" ALTER COLUMN "auditId" SET NOT NULL;

-- Drop the old auditId-based ownership of ProjectChecklistSection.
ALTER TABLE "ProjectChecklistSection" DROP CONSTRAINT "ProjectChecklistSection_auditId_fkey";
ALTER TABLE "ProjectChecklistSection" DROP COLUMN "auditId";
