-- CreateTable
CREATE TABLE "AuditProgramme" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "programmeType" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuditProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerLocation" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "projectId" TEXT,
    "zone" TEXT NOT NULL,
    "regionalOffice" TEXT NOT NULL,
    "dealerName" TEXT NOT NULL,
    "dealerCode" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 200,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "electricalSupplyType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SETUP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealerLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "facilityType" TEXT NOT NULL,
    "displayName" TEXT,
    "tier" TEXT,
    "ciLevel" TEXT,
    "format" TEXT,
    "workshopType" TEXT,
    "stockyardType" TEXT,
    "sellsPv" BOOLEAN NOT NULL DEFAULT false,
    "sellsBev" BOOLEAN NOT NULL DEFAULT false,
    "sellsCv" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedFacilityMapping" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "facilityCode" TEXT NOT NULL,
    "description" TEXT,
    "arrangement" TEXT NOT NULL DEFAULT 'SHARED',
    "usedBy" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "auditAtSite" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SharedFacilityMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditProgramme_companyId_code_key" ON "AuditProgramme"("companyId", "code");
CREATE INDEX "AuditProgramme_companyId_programmeType_status_idx" ON "AuditProgramme"("companyId", "programmeType", "status");
CREATE UNIQUE INDEX "DealerLocation_projectId_key" ON "DealerLocation"("projectId");
CREATE UNIQUE INDEX "DealerLocation_programmeId_locationCode_key" ON "DealerLocation"("programmeId", "locationCode");
CREATE INDEX "DealerLocation_programmeId_zone_regionalOffice_idx" ON "DealerLocation"("programmeId", "zone", "regionalOffice");
CREATE INDEX "DealerLocation_dealerCode_idx" ON "DealerLocation"("dealerCode");
CREATE UNIQUE INDEX "Facility_locationId_facilityType_key" ON "Facility"("locationId", "facilityType");
CREATE INDEX "Facility_facilityType_ciLevel_idx" ON "Facility"("facilityType", "ciLevel");
CREATE UNIQUE INDEX "SharedFacilityMapping_locationId_facilityCode_key" ON "SharedFacilityMapping"("locationId", "facilityCode");

ALTER TABLE "AuditProgramme" ADD CONSTRAINT "AuditProgramme_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerLocation" ADD CONSTRAINT "DealerLocation_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "AuditProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealerLocation" ADD CONSTRAINT "DealerLocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "DealerLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedFacilityMapping" ADD CONSTRAINT "SharedFacilityMapping_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "DealerLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
