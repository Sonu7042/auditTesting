/*
  Warnings:

  - You are about to drop the column `name` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `poFile` on the `Company` table. All the data in the column will be lost.
  - Added the required column `companyName` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Company" DROP COLUMN "name",
DROP COLUMN "poFile",
ADD COLUMN     "companyName" TEXT NOT NULL,
ADD COLUMN     "po_no" TEXT;
