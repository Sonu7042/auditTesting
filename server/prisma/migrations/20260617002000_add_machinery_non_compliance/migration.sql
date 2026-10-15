-- CreateTable
CREATE TABLE "MachineryNonCompliance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "machineryName" TEXT NOT NULL,
    "description1" TEXT NOT NULL,
    "description2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineryNonCompliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineryNonComplianceEvidence" (
    "id" TEXT NOT NULL,
    "nonComplianceId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "imageName" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineryNonComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MachineryNonCompliance" ADD CONSTRAINT "MachineryNonCompliance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryNonCompliance" ADD CONSTRAINT "MachineryNonCompliance_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineryNonComplianceEvidence" ADD CONSTRAINT "MachineryNonComplianceEvidence_nonComplianceId_fkey" FOREIGN KEY ("nonComplianceId") REFERENCES "MachineryNonCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
