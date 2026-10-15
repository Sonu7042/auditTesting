-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false;
