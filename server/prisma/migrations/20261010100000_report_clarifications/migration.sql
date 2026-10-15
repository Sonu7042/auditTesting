-- CreateTable
CREATE TABLE "ReportClarification" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "revisionRaised" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "snapshotItemId" TEXT,
    "message" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedInRevision" INTEGER,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportClarification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportClarification_reportId_status_idx" ON "ReportClarification"("reportId", "status");

