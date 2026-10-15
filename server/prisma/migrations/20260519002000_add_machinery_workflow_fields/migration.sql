ALTER TABLE "Machinery" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE "Machinery" ADD COLUMN "rejectionRemark" TEXT;
ALTER TABLE "Machinery" ADD COLUMN "sentToAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Machinery" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Machinery" ADD COLUMN "correctionComment" TEXT;
ALTER TABLE "Machinery" ADD COLUMN "correctionRequestedAt" TIMESTAMP(3);
