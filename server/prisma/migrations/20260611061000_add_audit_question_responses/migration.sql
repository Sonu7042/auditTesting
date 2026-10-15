-- CreateTable
CREATE TABLE "AuditQuestionResponse" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "responseType" TEXT NOT NULL,
    "observation" TEXT,
    "severity" TEXT,
    "preventivePlan" TEXT,
    "riskAssessment" TEXT,
    "description1" TEXT,
    "description2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditQuestionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditQuestionEvidence" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "imageName" TEXT,
    "imageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditQuestionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditQuestionResponse_questionId_auditorId_key" ON "AuditQuestionResponse"("questionId", "auditorId");

-- AddForeignKey
ALTER TABLE "AuditQuestionResponse" ADD CONSTRAINT "AuditQuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ProjectChecklistQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditQuestionResponse" ADD CONSTRAINT "AuditQuestionResponse_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditQuestionEvidence" ADD CONSTRAINT "AuditQuestionEvidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "AuditQuestionResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
