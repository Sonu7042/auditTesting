CREATE TABLE "ClientAuditCompletion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "finalRemarks" TEXT NOT NULL,
    "declarationAccepted" BOOLEAN NOT NULL,
    "signatureUrl" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAuditCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientAuditCompletion_sessionId_key" ON "ClientAuditCompletion"("sessionId");
ALTER TABLE "ClientAuditCompletion" ADD CONSTRAINT "ClientAuditCompletion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClientAuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
