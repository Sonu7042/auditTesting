CREATE TABLE "NextAuditUpdateSelection" (
    "id" TEXT NOT NULL,
    "sourceAuditId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NextAuditUpdateSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NextAuditUpdateSelection_sourceAuditId_auditorId_sourceType_sourceId_key"
ON "NextAuditUpdateSelection"("sourceAuditId", "auditorId", "sourceType", "sourceId");

CREATE INDEX "NextAuditUpdateSelection_sourceAuditId_auditorId_idx"
ON "NextAuditUpdateSelection"("sourceAuditId", "auditorId");

ALTER TABLE "NextAuditUpdateSelection"
ADD CONSTRAINT "NextAuditUpdateSelection_sourceAuditId_fkey"
FOREIGN KEY ("sourceAuditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NextAuditUpdateSelection"
ADD CONSTRAINT "NextAuditUpdateSelection_auditorId_fkey"
FOREIGN KEY ("auditorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
