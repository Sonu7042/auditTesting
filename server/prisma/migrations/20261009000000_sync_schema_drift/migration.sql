-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ZONAL_MANAGER';

-- AlterTable
ALTER TABLE "ClientAuditJob" ADD COLUMN     "facilityType" TEXT,
ADD COLUMN     "includesShared" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visitGroup" TEXT;

-- AlterTable
ALTER TABLE "ClientAuditJobAssignment" ADD COLUMN     "track" TEXT NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "ClientAuditQuestionResponse" ADD COLUMN     "closedOnSpot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "correctionComment" TEXT;

-- AlterTable
ALTER TABLE "ClientAuditReport" ADD COLUMN     "anomalies" JSONB,
ADD COLUMN     "debriefNotes" TEXT,
ADD COLUMN     "qcBreakdown" JSONB,
ADD COLUMN     "qcScore" DOUBLE PRECISION,
ADD COLUMN     "scoreSnapshot" JSONB,
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedByDesignation" TEXT,
ADD COLUMN     "signedByName" TEXT;

-- AlterTable
ALTER TABLE "ClientAuditResponseEvidence" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ISSUE';

-- AlterTable
ALTER TABLE "ClientChecklistItem" ADD COLUMN     "discipline" TEXT NOT NULL DEFAULT 'INFRASTRUCTURE';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "DealerLocation" ADD COLUMN     "category" TEXT,
ADD COLUMN     "cityClassification" TEXT,
ADD COLUMN     "madbCode" TEXT,
ADD COLUMN     "parentCode" TEXT,
ADD COLUMN     "profile" JSONB,
ADD COLUMN     "retailFormat" TEXT,
ADD COLUMN     "sapCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientAuditReportRevision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "reason" TEXT,
    "openedById" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAuditReportRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetupRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "data" JSONB NOT NULL,
    "readiness" INTEGER NOT NULL DEFAULT 0,
    "reviewRemarks" TEXT,
    "createdById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "phone" TEXT,
    "baseLocation" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "emergencyContact" TEXT,
    "notes" TEXT,
    "videoProgress" INTEGER NOT NULL DEFAULT 0,
    "quizScore" DOUBLE PRECISION,
    "quizAttempts" INTEGER NOT NULL DEFAULT 0,
    "quizAnswers" JSONB,
    "demoAnswers" JSONB,
    "trainingSubmittedAt" TIMESTAMP(3),
    "demoScore" DOUBLE PRECISION,
    "reviewScore" DOUBLE PRECISION,
    "reviewRemarks" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvalRemarks" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "credentialsSentAt" TIMESTAMP(3),
    "photoUrl" TEXT,
    "auditorCode" TEXT,
    "idIssuedAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditorOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingContent" (
    "id" TEXT NOT NULL,
    "videoUrl" TEXT,
    "passMark" INTEGER NOT NULL DEFAULT 80,
    "quiz" JSONB NOT NULL,
    "demo" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAuditNotice" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "recipient" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAuditNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistProposal" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "jobId" TEXT,
    "moduleCode" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "reach" TEXT NOT NULL DEFAULT 'TIER_FACILITY',
    "reachData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN',
    "adminById" TEXT,
    "adminAt" TIMESTAMP(3),
    "adminRemarks" TEXT,
    "sgsById" TEXT,
    "sgsAt" TIMESTAMP(3),
    "sgsRemarks" TEXT,
    "createdItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "zone" TEXT,
    "regionalOffice" TEXT,
    "locationId" TEXT,

    CONSTRAINT "UserScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUARTER',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "topN" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "snapshot" JSONB,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "companyName" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT[],
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGuideProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guideKey" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGuideProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "audience" TEXT[],
    "contentType" TEXT NOT NULL DEFAULT 'ARTICLE',
    "videoUrl" TEXT,
    "body" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 5,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportId" TEXT,
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAuditReportRevision_reportId_revision_key" ON "ClientAuditReportRevision"("reportId", "revision");

-- CreateIndex
CREATE INDEX "SiteSetupRequest_companyId_status_idx" ON "SiteSetupRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "AuditorChangeRequest_userId_status_idx" ON "AuditorChangeRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorOnboarding_userId_key" ON "AuditorOnboarding"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditorOnboarding_auditorCode_key" ON "AuditorOnboarding"("auditorCode");

-- CreateIndex
CREATE INDEX "AuditorScore_userId_source_createdAt_idx" ON "AuditorScore"("userId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "ClientAuditNotice_status_dueAt_idx" ON "ClientAuditNotice"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAuditNotice_jobId_kind_key" ON "ClientAuditNotice"("jobId", "kind");

-- CreateIndex
CREATE INDEX "ChecklistProposal_status_createdAt_idx" ON "ChecklistProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserScope_userId_idx" ON "UserScope"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_code_key" ON "Certificate"("code");

-- CreateIndex
CREATE INDEX "Certificate_periodId_level_metric_idx" ON "Certificate"("periodId", "level", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_key_key" ON "Policy"("key");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_policyId_version_idx" ON "PolicyAcknowledgement"("policyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgement_userId_policyId_version_key" ON "PolicyAcknowledgement"("userId", "policyId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "UserGuideProgress_userId_guideKey_key" ON "UserGuideProgress"("userId", "guideKey");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_moduleId_userId_key" ON "TrainingProgress"("moduleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SiteSetupRequest" ADD CONSTRAINT "SiteSetupRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorOnboarding" ADD CONSTRAINT "AuditorOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorScore" ADD CONSTRAINT "AuditorScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAuditNotice" ADD CONSTRAINT "ClientAuditNotice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClientAuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserScope" ADD CONSTRAINT "UserScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AwardPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

