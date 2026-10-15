-- CreateTable
CREATE TABLE "AuditChemicalVerification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "checkedChemicals" JSONB NOT NULL,
    "checkedChemicalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChemicalVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalNonCompliance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "chemicalName" TEXT NOT NULL,
    "description1" TEXT NOT NULL,
    "description2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemicalNonCompliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChemicalNonComplianceEvidence" (
    "id" TEXT NOT NULL,
    "nonComplianceId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "imageName" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemicalNonComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditChemicalVerification_projectId_auditorId_key" ON "AuditChemicalVerification"("projectId", "auditorId");

-- AddForeignKey
ALTER TABLE "AuditChemicalVerification" ADD CONSTRAINT "AuditChemicalVerification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChemicalVerification" ADD CONSTRAINT "AuditChemicalVerification_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalNonCompliance" ADD CONSTRAINT "ChemicalNonCompliance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalNonCompliance" ADD CONSTRAINT "ChemicalNonCompliance_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChemicalNonComplianceEvidence" ADD CONSTRAINT "ChemicalNonComplianceEvidence_nonComplianceId_fkey" FOREIGN KEY ("nonComplianceId") REFERENCES "ChemicalNonCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
