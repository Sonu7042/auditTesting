CREATE TABLE "Machinery" (
    "id" TEXT NOT NULL,
    "machineryName" TEXT NOT NULL,
    "machineryId" TEXT NOT NULL,
    "inspectionDocumentUrl" TEXT,
    "inspectionDocumentPublicId" TEXT,
    "inspectionDocumentName" TEXT,
    "inspectionDocumentType" TEXT,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machinery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Machinery_projectId_machineryId_key" ON "Machinery"("projectId", "machineryId");

ALTER TABLE "Machinery" ADD CONSTRAINT "Machinery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Machinery" ADD CONSTRAINT "Machinery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
