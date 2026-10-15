ALTER TABLE "ProjectChecklistSection" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'Approved';
ALTER TABLE "ProjectChecklistSection" ADD COLUMN "approvalRemark" TEXT;

ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'Approved';
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "approvalRemark" TEXT;
