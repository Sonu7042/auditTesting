-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_corporateManagerId_fkey" FOREIGN KEY ("corporateManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_regionalManagerId_fkey" FOREIGN KEY ("regionalManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteInchargeId_fkey" FOREIGN KEY ("siteInchargeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_siteUserId_fkey" FOREIGN KEY ("siteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
