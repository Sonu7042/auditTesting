ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "documentDueDate" TIMESTAMP(3);
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "documentSentToAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "documentSubmittedAt" TIMESTAMP(3);
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "documentStatus" TEXT NOT NULL DEFAULT 'Pending';
