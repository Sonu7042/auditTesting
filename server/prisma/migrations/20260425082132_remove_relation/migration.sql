/*
  Warnings:

  - You are about to drop the column `checklistTemplateId` on the `Audit` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Audit" DROP CONSTRAINT "Audit_checklistTemplateId_fkey";

-- AlterTable
ALTER TABLE "Audit" DROP COLUMN "checklistTemplateId";
