-- CreateTable
CREATE TABLE "SiteChangeRequest" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionRemarks" TEXT,
    "previousValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteChangeRequest_locationId_status_idx" ON "SiteChangeRequest"("locationId", "status");

-- CreateIndex
CREATE INDEX "SiteChangeRequest_requestedById_idx" ON "SiteChangeRequest"("requestedById");

