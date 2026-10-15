CREATE TABLE "ClientAuditReportCorrection" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "snapshotItemId" TEXT,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "instruction" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "correctedResult" TEXT,
  "correctedObservation" TEXT,
  "correctedMeasurementValue" DOUBLE PRECISION,
  "correctedNaReason" TEXT,
  "raisedById" TEXT NOT NULL,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewRemarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientAuditReportCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientAuditReportCorrectionEvidence" (
  "id" TEXT NOT NULL,
  "correctionId" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "publicId" TEXT,
  "imageName" TEXT,
  "mimeType" TEXT,
  "fileHash" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientAuditReportCorrectionEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientAuditReportCorrection_reportId_status_idx" ON "ClientAuditReportCorrection"("reportId", "status");
CREATE INDEX "ClientAuditReportCorrection_snapshotItemId_idx" ON "ClientAuditReportCorrection"("snapshotItemId");
CREATE INDEX "ClientAuditReportCorrectionEvidence_correctionId_createdAt_idx" ON "ClientAuditReportCorrectionEvidence"("correctionId", "createdAt");

ALTER TABLE "ClientAuditReportCorrection" ADD CONSTRAINT "ClientAuditReportCorrection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ClientAuditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAuditReportCorrection" ADD CONSTRAINT "ClientAuditReportCorrection_snapshotItemId_fkey" FOREIGN KEY ("snapshotItemId") REFERENCES "LocationChecklistSnapshotItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientAuditReportCorrectionEvidence" ADD CONSTRAINT "ClientAuditReportCorrectionEvidence_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "ClientAuditReportCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
