DROP INDEX IF EXISTS "PreviousNcReview_currentAuditId_sourceType_sourceId_key";

CREATE UNIQUE INDEX "PreviousNcReview_currentAuditId_auditorId_sourceType_sourceId_key"
ON "PreviousNcReview"("currentAuditId", "auditorId", "sourceType", "sourceId");
