-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AUDITOR', 'CORPORATE_MANAGER', 'SITE_INCHARGE', 'SITE_USER', 'REGIONAL_MANAGER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AuditType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAuditType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditTypeId" TEXT NOT NULL,

    CONSTRAINT "UserAuditType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AuditType_name_key" ON "AuditType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserAuditType_userId_auditTypeId_key" ON "UserAuditType"("userId", "auditTypeId");

-- AddForeignKey
ALTER TABLE "UserAuditType" ADD CONSTRAINT "UserAuditType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAuditType" ADD CONSTRAINT "UserAuditType_auditTypeId_fkey" FOREIGN KEY ("auditTypeId") REFERENCES "AuditType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
