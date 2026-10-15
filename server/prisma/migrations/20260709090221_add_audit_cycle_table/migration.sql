/*
  Warnings:

  - You are about to drop the column `auditId` on the `ProjectChecklistSection` table. All the data in the column will be lost.
  - Made the column `auditId` on table `AuditQuestionResponse` required. This step will fail if there are existing NULL values in that column.
  - Made the column `projectId` on table `ProjectChecklistSection` required. This step will fail if there are existing NULL values in that column.
  - Made the column `checklistType` on table `ProjectChecklistSection` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ProjectChecklistSection" DROP CONSTRAINT "ProjectChecklistSection_auditId_fkey";

-- AlterTable
ALTER TABLE "AuditQuestionResponse" ALTER COLUMN "auditId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ProjectChecklistSection" DROP COLUMN "auditId",
ALTER COLUMN "projectId" SET NOT NULL,
ALTER COLUMN "checklistType" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkforceNonCompliance" ALTER COLUMN "workforceRole" DROP DEFAULT,
ALTER COLUMN "phoneNumber" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "NextAuditUpdateSelection_sourceAuditId_auditorId_sourceType_sou" RENAME TO "NextAuditUpdateSelection_sourceAuditId_auditorId_sourceType_key";
