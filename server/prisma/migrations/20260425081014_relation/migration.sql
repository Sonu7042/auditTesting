-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "checklistTemplateId" TEXT;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
