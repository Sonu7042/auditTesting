-- CreateTable
CREATE TABLE "WorkforceNonCompliance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "subcontractedCompany" TEXT NOT NULL,
    "workforce" TEXT NOT NULL,
    "description1" TEXT NOT NULL,
    "description2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceNonCompliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceNonComplianceEvidence" (
    "id" TEXT NOT NULL,
    "nonComplianceId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "imageName" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceNonComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WorkforceNonCompliance" ADD CONSTRAINT "WorkforceNonCompliance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceNonCompliance" ADD CONSTRAINT "WorkforceNonCompliance_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceNonComplianceEvidence" ADD CONSTRAINT "WorkforceNonComplianceEvidence_nonComplianceId_fkey" FOREIGN KEY ("nonComplianceId") REFERENCES "WorkforceNonCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
