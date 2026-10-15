-- AlterTable
ALTER TABLE "ProjectChecklistSection" ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectChecklistQuestion" ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false;
