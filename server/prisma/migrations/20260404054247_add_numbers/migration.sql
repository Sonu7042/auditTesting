-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "questionNumber" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "mainMenuNumber" TEXT,
ADD COLUMN     "sectionNumber" TEXT;
