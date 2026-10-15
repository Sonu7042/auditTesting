-- Notification: support targeting a specific user (recipientId), in addition
-- to the existing role-wide broadcast (recipientRole), plus a precomputed
-- client route to open on click.
ALTER TABLE "Notification" ALTER COLUMN "recipientRole" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "recipientId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "link" TEXT;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Notification_recipientRole_isRead_idx" ON "Notification"("recipientRole", "isRead");
CREATE INDEX "Notification_recipientId_isRead_idx" ON "Notification"("recipientId", "isRead");

-- ProjectChecklistQuestion: track who last submitted a document for a
-- precise Admin -> User notification target (documents have no other
-- per-record "creator" since the checklist question itself is shared
-- across every audit cycle of a project).
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "documentSubmittedById" TEXT;

ALTER TABLE "ProjectChecklistQuestion" ADD CONSTRAINT "ProjectChecklistQuestion_documentSubmittedById_fkey" FOREIGN KEY ("documentSubmittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
