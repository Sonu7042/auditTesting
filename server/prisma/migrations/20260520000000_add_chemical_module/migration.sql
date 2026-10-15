CREATE TABLE "Chemical" (
    "id" TEXT NOT NULL,
    "chemicalName" TEXT NOT NULL,
    "chemicalId" TEXT NOT NULL,
    "safetyDataSheetUrl" TEXT,
    "safetyDataSheetPublicId" TEXT,
    "safetyDataSheetName" TEXT,
    "safetyDataSheetType" TEXT,
    "chemicalImageUrl" TEXT,
    "chemicalImagePublicId" TEXT,
    "chemicalImageName" TEXT,
    "chemicalImageType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "rejectionRemark" TEXT,
    "sentToAdmin" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "correctionComment" TEXT,
    "correctionRequestedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chemical_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Chemical_projectId_chemicalId_key" ON "Chemical"("projectId", "chemicalId");

ALTER TABLE "Chemical" ADD CONSTRAINT "Chemical_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chemical" ADD CONSTRAINT "Chemical_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
