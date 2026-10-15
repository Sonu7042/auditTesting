-- CreateTable
CREATE TABLE "AuditMachineryVerification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "checkedMachineries" JSONB NOT NULL,
    "checkedMachineryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditMachineryVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditMachineryVerification_projectId_auditorId_key" ON "AuditMachineryVerification"("projectId", "auditorId");

-- AddForeignKey
ALTER TABLE "AuditMachineryVerification" ADD CONSTRAINT "AuditMachineryVerification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditMachineryVerification" ADD CONSTRAINT "AuditMachineryVerification_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
