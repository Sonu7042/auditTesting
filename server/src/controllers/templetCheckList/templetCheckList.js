const XLSX = require("xlsx");
const multer = require("multer");
const prisma = require("../../config/prisma");
const uploadToCloudinary = require("../../utils/cloudinaryUpload");
const {
  ensureProjectChecklist,
  ensureProjectChecklistForAudit,
  syncTemplateToProjectChecklist,
  syncTemplateSectionToProjects,
  syncTemplateQuestionToProjects,
  addTemplateSectionToProjects,
  addTemplateQuestionToProjects,
} = require("../../utils/projectChecklist");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

const DOCUMENT_CREATOR_ROLES = [
  "SITE_USER",
  "SITE_INCHARGE",
  "CORPORATE_MANAGER",
  "REGIONAL_MANAGER",
];

const isAdmin = (req) => req.user?.role === "ADMIN";
const canManageDocuments = (req) => DOCUMENT_CREATOR_ROLES.includes(req.user?.role);
const isAuditorAddedProjectChecklistItem = (item) =>
  item?.addedByRole === "AUDITOR";

const getInitialProjectChecklistApprovalStatus = (req) =>
  req.user?.role === "AUDITOR" ? "Pending" : "Approved";

const requireAdmin = (req, res) => {
  if (isAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Only admin can review checklist additions",
  });
  return false;
};

const createAdminChecklistNotification = async ({
  req,
  auditId,
  section,
  question,
  itemType,
}) => {
  if (req.user?.role !== "AUDITOR") return;
  if (!auditId) return;

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: {
        select: {
          id: true,
          projectName: true,
        },
      },
    },
  });

  if (!audit) return;

  const auditor = req.user?.id
    ? await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          fullName: true,
          username: true,
        },
      })
    : null;
  const auditorName = auditor?.fullName || auditor?.username || "Auditor";
  const isQuestion = itemType === "question";
  const itemTitle = isQuestion ? question?.text : section?.title;

  await createNotification({
    title: isQuestion ? "New checklist question" : "New checklist subcategory",
    message: `${auditorName} added ${isQuestion ? "question" : "subcategory"} "${itemTitle}" in ${audit.project.projectName}. Approval required.`,
    type: isQuestion
      ? NOTIFICATION_TYPES.CHECKLIST_QUESTION_ADDED
      : NOTIFICATION_TYPES.CHECKLIST_SUBCATEGORY_ADDED,
    recipientRole: "ADMIN",
    projectId: audit.projectId,
    auditId: audit.id,
    sectionId: section?.id || question?.sectionId || null,
    questionId: question?.id || null,
    createdById: req.user?.id || null,
    link: `/admin-dashboard/project/${audit.projectId}/workspace/checklist?auditId=${audit.id}`,
  });
};

const requireDocumentCreator = (req, res) => {
  if (canManageDocuments(req)) return true;

  res.status(403).json({
    success: false,
    message: "You are not allowed to manage document approvals",
  });
  return false;
};

const getAuthorizedProject = async (req, projectId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      companyId: true,
      siteInchargeId: true,
      siteUserId: true,
    },
  });

  if (!project) return null;
  if (isAdmin(req)) return project;

  if (req.user?.role === "AUDITOR") {
    const assignment = await prisma.auditAuditor.findFirst({
      where: {
        userId: req.user.id,
        audit: {
          projectId,
        },
      },
      select: {
        id: true,
      },
    });

    return assignment ? project : null;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      companyId: true,
    },
  });

  if (!user?.companyId || user.companyId !== project.companyId) {
    return null;
  }

  if (req.user?.role === "SITE_INCHARGE" && project.siteInchargeId !== req.user.id) {
    return null;
  }

  if (req.user?.role === "SITE_USER" && project.siteUserId !== req.user.id) {
    return null;
  }

  return project;
};

const documentQuestionUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("Document upload only accepts image files"), false);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

exports.documentQuestionImageUpload = documentQuestionUpload.array(
  "documentImages",
);

exports.uploadTemplateFromExcel = async (req, res) => {
  try {
    const { name, auditType } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Checklist name required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let sections = [];
    let currentSection = null;

    let currentMainMenu = null;
    let currentMainMenuNumber = null;

    rows.forEach((row) => {
      const keys = Object.keys(row);

      const headerNumber = String(keys[0]).trim(); // "1.00"
      const rawNumber = row[keys[0]]; // 2, 1.01, 01.01.01
      const number = String(rawNumber).trim();
      const text = String(row[keys[1]]).trim();

      let dueDateText = null;

      // 🔥 dynamic column find
      const dueKey = Object.keys(row).find((k) =>
        k.toLowerCase().includes("due"),
      );

      if (dueKey && row[dueKey]) {
        dueDateText = String(row[dueKey]).trim(); //  simple text
      }

      if (!number || !text) return;

      // ✅ FIRST CATEGORY (use header → 1.00)
      if (!currentMainMenuNumber) {
        currentMainMenu = keys[1]; // "General Safety Audit"
        currentMainMenuNumber = headerNumber; //  "1.00"
      }

      // ✅ NEW CATEGORY (2, 3 → convert to 2.00, 3.00)
      if (/^\d+$/.test(number)) {
        currentMainMenu = text;
        currentMainMenuNumber = `${number}.00`;
        return;
      }

      //  SECTION (1.01)
      if (/^\d+\.\d+$/.test(number)) {
        currentSection = {
          title: text,
          mainMenu: currentMainMenu,
          mainMenuNumber: currentMainMenuNumber,
          sectionNumber: number,
          questions: [],
        };

        sections.push(currentSection);
      }

      // QUESTION (01.01.01)
      else if (/^\d+\.\d+\.\d+$/.test(number)) {
        if (currentSection) {
          currentSection.questions.push({
            text,
            dueDateText,
            questionNumber: number,
          });
        }
      }
    });

    const template = await prisma.checklistTemplate.create({
      data: {
        name,
        auditType,
        sections: {
          create: sections.map((sec) => ({
            title: sec.title,
            mainMenu: sec.mainMenu,
            mainMenuNumber: sec.mainMenuNumber,
            sectionNumber: sec.sectionNumber,
            questions: {
              create: sec.questions.map((q) => ({
                text: q.text,
                dueDateText: q.dueDateText,
                questionNumber: q.questionNumber,
              })),
            },
          })),
        },
      },
      include: {
        sections: {
          include: {
            questions: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: "Excel parsed & template saved",
      data: template,
    });
  } catch (error) {
     console.error("UPLOAD ERROR", error);

  res.status(500).json({ 
    error: error.message,   
  });
  }
};



exports.getChecklistTemplate = async (req, res) => {
  try {
    const template = await prisma.checklistTemplate.findMany({
      include: {
        sections: {
          include: {
            questions: true,
          },
          orderBy: {
            sectionNumber: "asc",
          },
        },
      },
    });
    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch template" });
  }
};

exports.getChecklistTemplateById = async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await prisma.checklistTemplate.findUnique({
      where: {
        id: templateId,
      },
      include: {
        sections: {
          include: {
            questions: {
              orderBy: {
                questionNumber: "asc",
              },
            },
          },
          orderBy: {
            sectionNumber: "asc",
          },
        },
      },
    });

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch template" });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;

    const existing = await prisma.checklistTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await prisma.checklistTemplate.delete({
      where: { id: templateId },
    });

    res.json({
      success: true,
      message: "Template deleted successfully ",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Delete failed" });
  }
};

const getNextSectionNumber = async (templateId, mainMenuNumber) => {
  const sections = await prisma.section.findMany({
    where: { templateId, mainMenuNumber },
    select: { sectionNumber: true },
  });

  const numbers = sections
    .map((s) => s.sectionNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[1])); // 1.01 → 01

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${parseInt(mainMenuNumber)}.${String(next).padStart(2, "0")}`;
};

const getNextMainMenuNumber = async (templateId) => {
  const sections = await prisma.section.findMany({
    where: { templateId },
    select: { mainMenuNumber: true },
  });

  const numbers = sections
    .map((s) => s.mainMenuNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[0]));

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${next}.00`;
};

const getNextQuestionNumber = async (sectionId, sectionNumber) => {
  const questions = await prisma.question.findMany({
    where: { sectionId },
    select: { questionNumber: true },
  });

  const numbers = questions
    .map((q) => q.questionNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[2])); // 1.01.01 → 01

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${sectionNumber}.${String(next).padStart(2, "0")}`;
};

const getNextProjectSectionNumber = async (projectId, checklistType, mainMenuNumber) => {
  const sections = await prisma.projectChecklistSection.findMany({
    where: { projectId, checklistType, mainMenuNumber },
    select: { sectionNumber: true },
  });

  const numbers = sections
    .map((s) => s.sectionNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[1]));

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${parseInt(mainMenuNumber)}.${String(next).padStart(2, "0")}`;
};

const getNextProjectMainMenuNumber = async (projectId, checklistType) => {
  const sections = await prisma.projectChecklistSection.findMany({
    where: { projectId, checklistType },
    select: { mainMenuNumber: true },
  });

  const numbers = sections
    .map((s) => s.mainMenuNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[0]));

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${next}.00`;
};

const getNextProjectQuestionNumber = async (sectionId, sectionNumber) => {
  const questions = await prisma.projectChecklistQuestion.findMany({
    where: { sectionId },
    select: { questionNumber: true },
  });

  const numbers = questions
    .map((q) => q.questionNumber)
    .filter(Boolean)
    .map((num) => parseInt(num.split(".")[2]));

  const next = numbers.length ? Math.max(...numbers) + 1 : 1;

  return `${sectionNumber}.${String(next).padStart(2, "0")}`;
};

exports.createSection = async (req, res) => {
  try {
    const { templateId, title, mainMenu } = req.body;

    // 🔥 Check if mainMenu already exists
    const existing = await prisma.section.findFirst({
      where: { templateId, mainMenu },
    });

    let mainMenuNumber;

    if (existing) {
      mainMenuNumber = existing.mainMenuNumber;
    } else {
      mainMenuNumber = await getNextMainMenuNumber(templateId);
    }

    const sectionNumber = await getNextSectionNumber(
      templateId,
      mainMenuNumber,
    );

    const section = await prisma.section.create({
      data: {
        title,
        mainMenu,
        mainMenuNumber,
        sectionNumber,
        templateId,
      },
    });

    await addTemplateSectionToProjects(prisma, section);

    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const { sectionId, text, dueDateText } = req.body;

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    const questionNumber = await getNextQuestionNumber(
      sectionId,
      section.sectionNumber,
    );

    const question = await prisma.question.create({
      data: {
        text,
       dueDateText: dueDateText || null,
        questionNumber,
        sectionId,
      },
    });

    await addTemplateQuestionToProjects(prisma, question);

    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const { sectionId, title, mainMenu } = req.body;

    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    //If mainMenu changed → update all sections with same mainMenuNumber
    if (mainMenu && mainMenu !== section.mainMenu) {
      await prisma.section.updateMany({
        where: {
          templateId: section.templateId,
          mainMenuNumber: section.mainMenuNumber,
        },
        data: {
          mainMenu,
        },
      });
    }

    // update title
    const updated = await prisma.section.update({
      where: { id: sectionId },
      data: {
        title: title || section.title,
      },
    });

    await syncTemplateSectionToProjects(prisma, updated);

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const { questionId, text, dueDateText } = req.body;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const updated = await prisma.question.update({
      where: { id: questionId },
      data: {
        text: text || question.text,
        dueDateText: dueDateText ?? question.dueDateText,
      },
    });

    await syncTemplateQuestionToProjects(prisma, updated);

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateMainMenu = async (req, res) => {
  try {
    const { templateId, mainMenuNumber, newName } = req.body;

    await prisma.section.updateMany({
      where: {
        templateId,
        mainMenuNumber,
      },
      data: {
        mainMenu: newName,
      },
    });

    const updatedSections = await prisma.section.findMany({
      where: {
        templateId,
        mainMenuNumber,
      },
    });

    for (const section of updatedSections) {
      await syncTemplateSectionToProjects(prisma, section);
    }

    res.json({
      success: true,
      message: "Main menu updated",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.categoryLock = async (req, res) => {
  const { templateId, mainMenuNumber } = req.body;

  const sections = await prisma.section.findMany({
    where: {
      templateId,
      mainMenuNumber,
    },
  });

  const isAnyUnlocked = sections.some((s) => !s.isLocked);

  // agar koi unlocked hai → sab lock kar do
  await prisma.section.updateMany({
    where: {
      templateId,
      mainMenuNumber,
    },
    data: {
      isLocked: isAnyUnlocked, // true => lock, false => unlock
    },
  });

  const updatedSections = await prisma.section.findMany({
    where: {
      templateId,
      mainMenuNumber,
    },
  });

  for (const section of updatedSections) {
    await syncTemplateSectionToProjects(prisma, section);
  }

  res.json({ success: true });
};

exports.sectionLock = async (req, res) => {
  const { sectionId } = req.body;

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
  });

  const updated = await prisma.section.update({
    where: { id: sectionId },
    data: {
      isLocked: !section.isLocked,
    },
  });

  await syncTemplateSectionToProjects(prisma, updated);

  res.json({ success: true, data: updated });
};

exports.questionsLock = async (req, res) => {
  const { questionId } = req.body;

  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: {
      isLocked: !question.isLocked,
    },
  });

  await syncTemplateQuestionToProjects(prisma, updated);

  res.json({ success: true, data: updated });
};


exports.getChecklistTemplateNames = async (req, res) => {
  try {
    const templates = await prisma.checklistTemplate.findMany({
      select: {
        id: true,
        name: true,
        auditType: true
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch template names" });
  }
};


exports.getProjectChecklist = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await getAuthorizedProject(req, projectId);
    if (!project) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this project",
      });
    }

    const audits = await prisma.audit.findMany({
      where: { projectId: projectId },
      include: {
        checklistTemplate: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    for (const audit of audits) {
      await ensureProjectChecklistForAudit(prisma, audit.id);
    }

    res.json({
      success: true,
      data: audits,
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getProjectChecklistByAudit = async (req, res) => {
  try {
    const { auditId } = req.params;

    const auditProject = await prisma.audit.findUnique({
      where: { id: auditId },
      select: {
        projectId: true,
      },
    });

    if (!auditProject) {
      return res.status(404).json({ error: "Audit not found" });
    }

    const project = await getAuthorizedProject(req, auditProject.projectId);
    if (!project) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this project",
      });
    }

    await ensureProjectChecklistForAudit(prisma, auditId);

    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        checklistTemplate: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }

    const projectChecklistSections = await prisma.projectChecklistSection.findMany({
      where: {
        projectId: audit.projectId,
        checklistType: audit.checklistType,
      },
      include: {
        questions: {
          include: {
            auditResponses: {
              where: {
                auditorId: req.user.id,
                auditId,
              },
              select: {
                id: true,
                responseType: true,
                observation: true,
                severity: true,
                preventivePlan: true,
                riskAssessment: true,
                description1: true,
                description2: true,
                evidence: true,
              },
            },
          },
          orderBy: {
            questionNumber: "asc",
          },
        },
      },
      orderBy: {
        sectionNumber: "asc",
      },
    });

    audit.projectChecklistSections = projectChecklistSections;

    const previousNcReviews = await prisma.previousNcReview.findMany({
      where: {
        currentAuditId: auditId,
        auditorId: req.user.id,
        currentStatus: "OPEN",
      },
      include: {
        closureEvidence: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const previousNcByQuestionNumber = new Map();
    for (const review of previousNcReviews) {
      const questionNumber = String(
        review.sourceSnapshot?.questionNumber || "",
      ).trim();
      if (questionNumber) {
        previousNcByQuestionNumber.set(questionNumber, review);
      }
    }

    const sections = audit.projectChecklistSections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => ({
        ...question,
        previousNcReview:
          previousNcByQuestionNumber.get(
            String(question.questionNumber || "").trim(),
          ) || null,
      })),
    }));

    res.json({
      success: true,
      data: {
        audit,
        sections,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

exports.createProjectSection = async (req, res) => {
  try {
    const { auditId, title, mainMenu } = req.body;

    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { id: true, projectId: true, checklistType: true },
    });

    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }

    const { projectId, checklistType } = audit;

    const existing = await prisma.projectChecklistSection.findFirst({
      where: { projectId, checklistType, mainMenu },
    });

    const mainMenuNumber = existing
      ? existing.mainMenuNumber
      : await getNextProjectMainMenuNumber(projectId, checklistType);

    const sectionNumber = await getNextProjectSectionNumber(
      projectId,
      checklistType,
      mainMenuNumber,
    );

    const section = await prisma.projectChecklistSection.create({
      data: {
        title,
        mainMenu,
        mainMenuNumber,
        sectionNumber,
        projectId,
        checklistType,
        isCustomized: true,
        addedByRole: req.user?.role || null,
        approvalStatus: getInitialProjectChecklistApprovalStatus(req),
      },
    });

    await createAdminChecklistNotification({
      req,
      auditId,
      section,
      itemType: "section",
    });

    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addProjectQuestion = async (req, res) => {
  try {
    const { sectionId, auditId, text, dueDateText } = req.body;
    const imageFile = req.files?.[0] || null;
    const documentDueDate = dueDateText ? new Date(dueDateText) : null;
    let uploadedImage = null;

    const section = await prisma.projectChecklistSection.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    if (auditId) {
      const audit = await prisma.audit.findUnique({
        where: { id: auditId },
        select: { projectId: true, checklistType: true },
      });

      if (
        !audit ||
        audit.projectId !== section.projectId ||
        audit.checklistType !== section.checklistType
      ) {
        return res.status(400).json({ error: "This section does not belong to the selected audit" });
      }
    }

    const questionNumber = await getNextProjectQuestionNumber(
      sectionId,
      section.sectionNumber,
    );

    if (documentDueDate && Number.isNaN(documentDueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Select a valid date",
      });
    }

    if (imageFile) {
      uploadedImage = await uploadToCloudinary(
        imageFile,
        "audit-portal/document-approvals/images",
      );
    }

    const question = await prisma.projectChecklistQuestion.create({
      data: {
        text,
        dueDateText: dueDateText || null,
        documentDueDate: documentDueDate || null,
        ...(uploadedImage
          ? {
              documentImageUrl: uploadedImage.secure_url,
              documentImagePublicId: uploadedImage.public_id,
              documentImageName: imageFile.originalname,
              documentImageType: imageFile.mimetype,
            }
          : {}),
        questionNumber,
        sectionId,
        isCustomized: true,
        addedByRole: req.user?.role || null,
        approvalStatus: getInitialProjectChecklistApprovalStatus(req),
      },
    });

    await createAdminChecklistNotification({
      req,
      auditId,
      section,
      question,
      itemType: "question",
    });

    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProjectSection = async (req, res) => {
  try {
    const { sectionId, title, mainMenu } = req.body;

    const section = await prisma.projectChecklistSection.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    if (mainMenu && mainMenu !== section.mainMenu) {
      await prisma.projectChecklistSection.updateMany({
        where: {
          projectId: section.projectId,
          checklistType: section.checklistType,
          mainMenuNumber: section.mainMenuNumber,
        },
        data: {
          mainMenu,
          isCustomized: true,
        },
      });
    }

    const updated = await prisma.projectChecklistSection.update({
      where: { id: sectionId },
      data: {
        title: title || section.title,
        isCustomized: true,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProjectQuestion = async (req, res) => {
  try {
    const { questionId, text, dueDateText } = req.body;

    const question = await prisma.projectChecklistQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const updated = await prisma.projectChecklistQuestion.update({
      where: { id: questionId },
      data: {
        text: text || question.text,
        dueDateText: dueDateText ?? question.dueDateText,
        isCustomized: true,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProjectMainMenu = async (req, res) => {
  try {
    const { auditId, mainMenuNumber, newName } = req.body;

    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { projectId: true, checklistType: true },
    });

    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }

    await prisma.projectChecklistSection.updateMany({
      where: {
        projectId: audit.projectId,
        checklistType: audit.checklistType,
        mainMenuNumber,
      },
      data: {
        mainMenu: newName,
        isCustomized: true,
      },
    });

    res.json({
      success: true,
      message: "Project main menu updated",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.projectCategoryLock = async (req, res) => {
  try {
    const { auditId, mainMenuNumber } = req.body;

    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { projectId: true, checklistType: true },
    });

    if (!audit) {
      return res.status(404).json({ error: "Audit not found" });
    }

    const sections = await prisma.projectChecklistSection.findMany({
      where: {
        projectId: audit.projectId,
        checklistType: audit.checklistType,
        mainMenuNumber,
      },
    });

    const isAnyUnlocked = sections.some((s) => !s.isLocked);

    await prisma.projectChecklistSection.updateMany({
      where: {
        projectId: audit.projectId,
        checklistType: audit.checklistType,
        mainMenuNumber,
      },
      data: {
        isLocked: isAnyUnlocked,
        isCustomized: true,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.projectSectionLock = async (req, res) => {
  try {
    const { sectionId } = req.body;

    const section = await prisma.projectChecklistSection.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    const updated = await prisma.projectChecklistSection.update({
      where: { id: sectionId },
      data: {
        isLocked: !section.isLocked,
        isCustomized: true,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.projectQuestionLock = async (req, res) => {
  try {
    const { questionId } = req.body;

    const question = await prisma.projectChecklistQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const updated = await prisma.projectChecklistQuestion.update({
      where: { id: questionId },
      data: {
        isLocked: !question.isLocked,
        isCustomized: true,
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProjectChecklistApprovalStatus = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { itemType, itemId, status, remark } = req.body;
    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!["section", "question"].includes(itemType) || !itemId) {
      return res.status(400).json({
        success: false,
        message: "Item type and item id are required",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Pending, Approved, or Rejected",
      });
    }

    const data = {
      approvalStatus: status,
      approvalRemark:
        status === "Rejected"
          ? remark?.trim() || "Rejected by admin"
          : null,
    };

    if (itemType === "section") {
      const section = await prisma.projectChecklistSection.findUnique({
        where: { id: itemId },
      });

      if (!section || !isAuditorAddedProjectChecklistItem(section)) {
        return res.status(404).json({
          success: false,
          message: "Auditor-added subcategory not found",
        });
      }

      const updated = await prisma.projectChecklistSection.update({
        where: { id: itemId },
        data,
        include: {
          questions: {
            include: {
              auditResponses: true,
            },
            orderBy: {
              questionNumber: "asc",
            },
          },
        },
      });

      return res.json({
        success: true,
        message: `Subcategory ${status.toLowerCase()} successfully`,
        data: updated,
      });
    }

    const question = await prisma.projectChecklistQuestion.findUnique({
      where: { id: itemId },
    });

    if (!question || !isAuditorAddedProjectChecklistItem(question)) {
      return res.status(404).json({
        success: false,
        message: "Auditor-added question not found",
      });
    }

    const updated = await prisma.projectChecklistQuestion.update({
      where: { id: itemId },
      data,
      include: {
        auditResponses: true,
      },
    });

    return res.json({
      success: true,
      message: `Question ${status.toLowerCase()} successfully`,
      data: updated,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const hasDueDateMarker = (question) => Boolean(question.dueDateText?.trim());
const isApprovedForDocumentFlow = (item) =>
  (item?.approvalStatus || "Approved") === "Approved";

const canViewChecklistApprovalState = (req) =>
  isAdmin(req) || req.user?.role === "AUDITOR";

const syncProjectChecklistFromTemplate = async (projectId, checklistType) => {
  if (!projectId || !checklistType) return;
  await ensureProjectChecklist(prisma, projectId, checklistType, checklistType);
  await syncTemplateToProjectChecklist(prisma, projectId, checklistType, checklistType);

  const projectSections = await prisma.projectChecklistSection.findMany({
    where: { projectId, checklistType },
    include: {
      questions: true,
    },
  });

  for (const section of projectSections) {
    for (const projectQuestion of section.questions) {
      if (projectQuestion.dueDateText?.trim() || !projectQuestion.sourceQuestionId) {
        continue;
      }

      const templateQuestion = await prisma.question.findUnique({
        where: { id: projectQuestion.sourceQuestionId },
        select: {
          dueDateText: true,
        },
      });

      if (!templateQuestion?.dueDateText?.trim()) continue;

      await prisma.projectChecklistQuestion.update({
        where: { id: projectQuestion.id },
        data: {
          dueDateText: templateQuestion.dueDateText,
        },
      });
    }
  }
};

const serializeDocumentQuestionGroups = (
  tracks,
  onlySubmitted = false,
  showPendingChecklistAdditions = false,
) =>
  tracks
    .map((track) => ({
      id: track.checklistType,
      auditType: track.auditType,
      checklistTemplate: track.checklistTemplate,
      sections: track.projectChecklistSections
        .filter(
          (section) =>
            showPendingChecklistAdditions ||
            isApprovedForDocumentFlow(section),
        )
        .map((section) => ({
          id: section.id,
          title: section.title,
          mainMenu: section.mainMenu,
          mainMenuNumber: section.mainMenuNumber,
          sectionNumber: section.sectionNumber,
          questions: section.questions.filter((question) => {
            if (!hasDueDateMarker(question)) return false;
            if (
              !showPendingChecklistAdditions &&
              !isApprovedForDocumentFlow(question)
            ) {
              return false;
            }
            return onlySubmitted ? question.documentSentToAdmin : true;
          }),
        }))
        .filter((section) => section.questions.length > 0),
    }))
    .filter((track) => track.sections.length > 0);

exports.getProjectDocumentQuestions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const onlySubmitted = req.query.submitted === "true";

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);
    if (!project) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this project",
      });
    }

    const audits = await prisma.audit.findMany({
      where: { projectId },
      select: {
        id: true,
        auditType: true,
        checklistType: true,
        checklistTemplate: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        auditType: "asc",
      },
    });

    // One "track" per distinct checklistType (audit type) the project runs -
    // a project's checklist/document data must exist once per track, shared
    // across every audit cycle of that track, not once per Audit row.
    const tracksByChecklistType = new Map();
    for (const audit of audits) {
      if (!tracksByChecklistType.has(audit.checklistType)) {
        tracksByChecklistType.set(audit.checklistType, {
          auditType: audit.auditType,
          checklistType: audit.checklistType,
          checklistTemplate: audit.checklistTemplate,
        });
      }
    }

    for (const track of tracksByChecklistType.values()) {
      await syncProjectChecklistFromTemplate(projectId, track.checklistType);
    }

    const tracks = await Promise.all(
      Array.from(tracksByChecklistType.values()).map(async (track) => ({
        ...track,
        projectChecklistSections: await prisma.projectChecklistSection.findMany({
          where: { projectId, checklistType: track.checklistType },
          include: {
            questions: {
              orderBy: {
                questionNumber: "asc",
              },
            },
          },
          orderBy: {
            sectionNumber: "asc",
          },
        }),
      })),
    );

    res.json({
      success: true,
      data: serializeDocumentQuestionGroups(
        tracks,
        onlySubmitted,
        canViewChecklistApprovalState(req),
      ),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitProjectDocumentQuestions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const isAuditorUpload = req.user?.role === "AUDITOR";
    const documents =
      typeof req.body.documents === "string"
        ? JSON.parse(req.body.documents)
        : req.body.documents;
    const imageQuestionIds = Array.isArray(req.body.documentImageQuestionIds)
      ? req.body.documentImageQuestionIds
      : req.body.documentImageQuestionIds
        ? [req.body.documentImageQuestionIds]
        : [];
    const imageByQuestionId = new Map(
      (req.files || []).map((file, index) => [imageQuestionIds[index], file]),
    );

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one due date before sending to admin",
      });
    }

    const submittedAt = new Date();
    const updatedQuestions = [];

    for (const item of documents) {
      const questionId = item.questionId;
      const dueDate = item.documentDueDate ? new Date(item.documentDueDate) : null;
      const imageFile = imageByQuestionId.get(questionId);
      let uploadedImage = null;

      if (!questionId || !dueDate || Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Each selected document needs a valid question and date",
        });
      }

      const question = await prisma.projectChecklistQuestion.findFirst({
        where: {
          id: questionId,
          section: {
            projectId,
          },
        },
        select: {
          id: true,
          dueDateText: true,
        },
      });

      if (!question || !hasDueDateMarker(question)) {
        return res.status(404).json({
          success: false,
          message: "Due-date question not found for this project",
        });
      }

      if (imageFile) {
        uploadedImage = await uploadToCloudinary(
          imageFile,
          "audit-portal/document-approvals/images",
        );
      }

      const updated = await prisma.projectChecklistQuestion.update({
        where: { id: questionId },
        data: {
          documentDueDate: dueDate,
          documentComment: item.documentComment?.trim() || null,
          ...(uploadedImage
            ? {
                documentImageUrl: uploadedImage.secure_url,
                documentImagePublicId: uploadedImage.public_id,
                documentImageName: imageFile.originalname,
                documentImageType: imageFile.mimetype,
              }
            : {}),
          documentSentToAdmin: !isAuditorUpload,
          documentSubmittedAt: submittedAt,
          documentSubmittedById: req.user?.id || null,
          documentStatus: isAuditorUpload ? "Approved" : "Pending",
          documentCorrectionComment: null,
          documentCorrectionRequestedAt: null,
        },
      });

      updatedQuestions.push(updated);
    }

    if (!isAuditorUpload && updatedQuestions.length > 0) {
      await createNotification({
        title: "Documents submitted for approval",
        message: "Documents have been submitted for approval.",
        type: NOTIFICATION_TYPES.DOCUMENT_SUBMITTED,
        recipientRole: "ADMIN",
        projectId,
        createdById: req.user?.id || null,
        link: `/admin-dashboard/project/${projectId}/workspace/documents`,
      });
    }

    res.json({
      success: true,
      message: "Documents sent to admin successfully",
      submittedCount: updatedQuestions.length,
      data: updatedQuestions,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProjectDocumentQuestionStatus = async (req, res) => {
  try {
    const { projectId, questionId } = req.params;
    const { status, rejectionRemark } = req.body;
    const allowedStatuses = ["Pending", "Approved", "Rejected", "Not Approved"];
    const needsRejectionRemark = ["Rejected", "Not Approved"].includes(status);

    if (!projectId || !questionId) {
      return res.status(400).json({
        success: false,
        message: "Project id and question id are required",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Pending, Approved, Rejected, or Not Approved",
      });
    }

    if (needsRejectionRemark && !rejectionRemark?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    const question = await prisma.projectChecklistQuestion.findFirst({
      where: {
        id: questionId,
        ...(req.user?.role === "AUDITOR"
          ? {}
          : { documentSentToAdmin: true }),
        section: {
          projectId,
        },
      },
      select: {
        id: true,
        dueDateText: true,
      },
    });

    if (!question || !hasDueDateMarker(question)) {
      return res.status(404).json({
        success: false,
        message: "Submitted document question not found for this project",
      });
    }

    const updatedQuestion = await prisma.projectChecklistQuestion.update({
      where: { id: questionId },
      data: {
        documentStatus: status,
        documentRejectionRemark: needsRejectionRemark
          ? rejectionRemark.trim()
          : null,
        documentCorrectionComment: null,
        documentCorrectionRequestedAt: null,
      },
    });

    if (
      updatedQuestion.documentSubmittedById &&
      req.user?.role !== "AUDITOR" &&
      (status === "Approved" || needsRejectionRemark)
    ) {
      const approved = status === "Approved";
      await createNotification({
        title: `Document ${status.toLowerCase()}`,
        message: approved
          ? "Your document has been approved."
          : "Your document has been rejected.",
        type: approved
          ? NOTIFICATION_TYPES.DOCUMENT_APPROVED
          : NOTIFICATION_TYPES.DOCUMENT_REJECTED,
        recipientId: updatedQuestion.documentSubmittedById,
        projectId,
        questionId,
        createdById: req.user?.id || null,
        link: `/user-dashboard/operation/document`,
      });
    }

    if (req.user?.role === "AUDITOR" && needsRejectionRemark) {
      await createNotification({
        title: "Document marked non-compliant",
        message: "An auditor marked an approved document as non-compliant. Review is required.",
        type: NOTIFICATION_TYPES.DOCUMENT_SUBMITTED,
        recipientRole: "ADMIN",
        projectId,
        questionId,
        createdById: req.user?.id || null,
        link: `/admin-dashboard/project/${projectId}/workspace/documents`,
      });
    }

    res.json({
      success: true,
      message: `Document ${status.toLowerCase()} successfully`,
      question: updatedQuestion,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.requestProjectDocumentQuestionCorrection = async (req, res) => {
  try {
    if (!requireDocumentCreator(req, res)) return;

    const { projectId, questionId } = req.params;
    const comment = req.body.comment?.trim();

    if (!projectId || !questionId) {
      return res.status(400).json({
        success: false,
        message: "Project id and question id are required",
      });
    }

    if (!comment) {
      return res.status(400).json({
        success: false,
        message: "Comment is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const question = await prisma.projectChecklistQuestion.findFirst({
      where: {
        id: questionId,
        documentStatus: "Approved",
        section: {
          projectId,
        },
      },
      select: {
        id: true,
        dueDateText: true,
      },
    });

    if (!question || !hasDueDateMarker(question)) {
      return res.status(404).json({
        success: false,
        message: "Approved document question not found for this project",
      });
    }

    const updatedQuestion = await prisma.projectChecklistQuestion.update({
      where: { id: questionId },
      data: {
        documentCorrectionComment: comment,
        documentCorrectionRequestedAt: new Date(),
        documentSentToAdmin: true,
        documentSubmittedAt: new Date(),
        documentSubmittedById: req.user?.id || null,
      },
    });

    await createNotification({
      title: "Document correction submitted",
      message: "Documents have been submitted for approval.",
      type: NOTIFICATION_TYPES.DOCUMENT_SUBMITTED,
      recipientRole: "ADMIN",
      projectId,
      questionId,
      createdById: req.user?.id || null,
      link: `/admin-dashboard/project/${projectId}/workspace/documents`,
    });

    res.json({
      success: true,
      message: "Correction comment sent to admin successfully",
      question: updatedQuestion,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
