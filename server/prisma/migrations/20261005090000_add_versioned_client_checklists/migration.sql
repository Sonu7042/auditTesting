CREATE TABLE "ClientChecklistVersion" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientChecklistVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientChecklistItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "expectedCondition" TEXT,
    "responseType" TEXT NOT NULL DEFAULT 'COMPLIANCE',
    "severityOnFail" TEXT NOT NULL DEFAULT 'MEDIUM',
    "mahindraPriority" TEXT NOT NULL DEFAULT 'IMPORTANT',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "minimumEvidence" INTEGER NOT NULL DEFAULT 0,
    "naAllowed" BOOLEAN NOT NULL DEFAULT true,
    "naReasonRequired" BOOLEAN NOT NULL DEFAULT true,
    "measurementUnit" TEXT,
    "minimumValue" DOUBLE PRECISION,
    "maximumValue" DOUBLE PRECISION,
    "regulationRef" TEXT,
    "applicabilityRule" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationChecklistSnapshot" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "checklistName" TEXT NOT NULL,
    "checklistVersion" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationChecklistSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationChecklistSnapshotItem" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemData" JSONB NOT NULL,
    CONSTRAINT "LocationChecklistSnapshotItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientChecklistVersion_programmeId_version_key" ON "ClientChecklistVersion"("programmeId", "version");
CREATE INDEX "ClientChecklistVersion_programmeId_status_idx" ON "ClientChecklistVersion"("programmeId", "status");
CREATE UNIQUE INDEX "ClientChecklistItem_versionId_questionCode_key" ON "ClientChecklistItem"("versionId", "questionCode");
CREATE INDEX "ClientChecklistItem_versionId_moduleCode_sortOrder_idx" ON "ClientChecklistItem"("versionId", "moduleCode", "sortOrder");
CREATE UNIQUE INDEX "LocationChecklistSnapshot_locationId_versionId_key" ON "LocationChecklistSnapshot"("locationId", "versionId");
CREATE INDEX "LocationChecklistSnapshot_locationId_generatedAt_idx" ON "LocationChecklistSnapshot"("locationId", "generatedAt");
CREATE UNIQUE INDEX "LocationChecklistSnapshotItem_snapshotId_sourceItemId_key" ON "LocationChecklistSnapshotItem"("snapshotId", "sourceItemId");
CREATE INDEX "LocationChecklistSnapshotItem_snapshotId_moduleCode_sortOrd_idx" ON "LocationChecklistSnapshotItem"("snapshotId", "moduleCode", "sortOrder");

ALTER TABLE "ClientChecklistVersion" ADD CONSTRAINT "ClientChecklistVersion_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "AuditProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientChecklistItem" ADD CONSTRAINT "ClientChecklistItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ClientChecklistVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationChecklistSnapshot" ADD CONSTRAINT "LocationChecklistSnapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "DealerLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationChecklistSnapshot" ADD CONSTRAINT "LocationChecklistSnapshot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ClientChecklistVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LocationChecklistSnapshotItem" ADD CONSTRAINT "LocationChecklistSnapshotItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LocationChecklistSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
