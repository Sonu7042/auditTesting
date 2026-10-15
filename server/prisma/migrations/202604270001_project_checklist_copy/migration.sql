-- CreateTable
CREATE TABLE "ProjectChecklistSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mainMenu" TEXT,
    "mainMenuNumber" TEXT,
    "sectionNumber" TEXT,
    "sourceSectionId" TEXT,
    "auditId" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectChecklistSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklistQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "dueDateText" TEXT,
    "questionNumber" TEXT,
    "sourceQuestionId" TEXT,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "ProjectChecklistQuestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProjectChecklistSection" ADD CONSTRAINT "ProjectChecklistSection_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistQuestion" ADD CONSTRAINT "ProjectChecklistQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProjectChecklistSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
