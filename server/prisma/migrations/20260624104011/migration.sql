-- DropIndex
DROP INDEX "Audit_previousAuditId_idx";

-- RenameIndex
ALTER INDEX "PreviousNcReview_currentAuditId_auditorId_sourceType_sourceId_k" RENAME TO "PreviousNcReview_currentAuditId_auditorId_sourceType_source_key";
