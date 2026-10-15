CREATE TABLE "AuditorQualification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" JSONB NOT NULL,
    "supportedRegions" JSONB NOT NULL,
    "calibrationScore" DOUBLE PRECISION NOT NULL,
    "backgroundVerified" BOOLEAN NOT NULL DEFAULT false,
    "platformCertified" BOOLEAN NOT NULL DEFAULT false,
    "shadowAuditsCompleted" INTEGER NOT NULL DEFAULT 0,
    "authorityLetterNumber" TEXT,
    "certificationExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuditorQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditJob" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "auditCycle" TEXT NOT NULL,
    "auditType" TEXT NOT NULL DEFAULT 'PERIODIC',
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "requiredSkills" JSONB NOT NULL,
    "readiness" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "dealerNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientAuditJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditJobAssignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "assignedSkills" JSONB NOT NULL,
    "assignmentRole" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAuditJobAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditorQualification_userId_key" ON "AuditorQualification"("userId");
CREATE INDEX "ClientAuditJob_locationId_scheduledStart_idx" ON "ClientAuditJob"("locationId", "scheduledStart");
CREATE INDEX "ClientAuditJob_status_scheduledStart_idx" ON "ClientAuditJob"("status", "scheduledStart");
CREATE UNIQUE INDEX "ClientAuditJobAssignment_jobId_auditorId_key" ON "ClientAuditJobAssignment"("jobId", "auditorId");
CREATE INDEX "ClientAuditJobAssignment_auditorId_status_idx" ON "ClientAuditJobAssignment"("auditorId", "status");

ALTER TABLE "AuditorQualification" ADD CONSTRAINT "AuditorQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditJob" ADD CONSTRAINT "ClientAuditJob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "DealerLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditJob" ADD CONSTRAINT "ClientAuditJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LocationChecklistSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAuditJob" ADD CONSTRAINT "ClientAuditJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAuditJobAssignment" ADD CONSTRAINT "ClientAuditJobAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClientAuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditJobAssignment" ADD CONSTRAINT "ClientAuditJobAssignment_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
