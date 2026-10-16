const multer = require("multer");
const prisma = require("../config/prisma");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const {
  assertAuditEditable,
  getCompletedReportKeys,
} = require("../utils/auditLifecycle");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");

const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 20,
  },
});

const auditQuestionImageUpload = imageUpload.array("images", 20);

const getProjectScopeWhere = async (user) => {
  if (user?.role === "ADMIN") return {};

  if (user?.role === "AUDITOR") {
    return {
      auditorId: user.id,
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user?.id },
    select: { companyId: true },
  });

  if (!dbUser?.companyId) {
    return {
      audit: {
        projectId: "__none__",
      },
    };
  }

  const projectWhere = {
    companyId: dbUser.companyId,
  };

  if (user?.role === "SITE_INCHARGE") {
    projectWhere.siteInchargeId = user.id;
  }

  if (user?.role === "SITE_USER") {
    projectWhere.siteUserId = user.id;
  }

  return {
    audit: {
      project: projectWhere,
    },
  };
};

const parseImageTypes = (rawValue, fileCount) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed : Array(fileCount).fill("evidence");
  } catch {
    return Array(fileCount).fill("evidence");
  }
};

const parseKeepEvidenceIds = (rawValue) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const fileToDataUrl = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

const uploadEvidenceImage = async (file) => {
  try {
    const uploadedImage = await uploadToCloudinary(
      file,
      "audit-portal/audit-question-evidence/images",
    );

    return {
      imageUrl: uploadedImage.secure_url,
      imagePublicId: uploadedImage.public_id,
    };
  } catch {
    return {
      imageUrl: fileToDataUrl(file),
      imagePublicId: null,
    };
  }
};

const saveAuditQuestionResponse = async (req, res) => {
  try {
    const {
      questionId,
      auditId,
      responseType,
      observation,
      severity,
      preventivePlan,
      riskAssessment,
      description1,
      description2,
    } = req.body;

    if (!questionId || !responseType || !auditId) {
      return res.status(400).json({
        message: "Audit, question and response type are required.",
      });
    }

    if (!["COMPLIANCE", "NON_COMPLIANCE", "NOT_APPLICABLE"].includes(responseType)) {
      return res.status(400).json({
        message: "Response type must be COMPLIANCE, NON_COMPLIANCE, or NOT_APPLICABLE.",
      });
    }

    const auditorId = req.user?.id;

    if (!auditorId) {
      return res.status(401).json({
        message: "Auditor login is required.",
      });
    }

    const [question, audit] = await Promise.all([
      prisma.projectChecklistQuestion.findUnique({
        where: { id: questionId },
        select: {
          id: true,
          approvalStatus: true,
          section: {
            select: {
              projectId: true,
              checklistType: true,
            },
          },
        },
      }),
      prisma.audit.findUnique({
        where: { id: auditId },
        select: { id: true, projectId: true, checklistType: true },
      }),
    ]);

    if (!question) {
      return res.status(404).json({
        message: "Checklist question not found.",
      });
    }

    if (!audit) {
      return res.status(404).json({
        message: "Audit not found.",
      });
    }

    if (
      question.section.projectId !== audit.projectId ||
      question.section.checklistType !== audit.checklistType
    ) {
      return res.status(400).json({
        message: "This question does not belong to the selected audit.",
      });
    }

    if ((question.approvalStatus || "Approved") !== "Approved") {
      return res.status(403).json({
        message: "Admin approval is required before uploading this response.",
      });
    }

    await assertAuditEditable(auditId, auditorId);

    const imageTypes = parseImageTypes(req.body.imageTypes, req.files?.length || 0);
    const keepEvidenceIds = parseKeepEvidenceIds(req.body.keepEvidenceIds);
    const uploadedImages = [];

    for (const [index, file] of (req.files || []).entries()) {
      const uploadedImage = await uploadEvidenceImage(file);

      uploadedImages.push({
        evidenceType: imageTypes[index] || "evidence",
        imageUrl: uploadedImage.imageUrl,
        imagePublicId: uploadedImage.imagePublicId,
        imageName: file.originalname,
        imageType: file.mimetype,
      });
    }

    let isNewNc = false;

    const response = await prisma.$transaction(async (tx) => {
      const existingResponse = await tx.auditQuestionResponse.findUnique({
        where: {
          questionId_auditorId_auditId: {
            questionId,
            auditorId,
            auditId,
          },
        },
        select: {
          id: true,
          responseType: true,
        },
      });
      const responseTypeChanged =
        existingResponse && existingResponse.responseType !== responseType;

      isNewNc =
        responseType === "NON_COMPLIANCE" &&
        (!existingResponse || responseTypeChanged);
      const effectiveKeepEvidenceIds = responseTypeChanged
        ? []
        : keepEvidenceIds;
      const responseData =
        ["COMPLIANCE", "NOT_APPLICABLE"].includes(responseType)
          ? {
              responseType,
              observation: observation || null,
              severity: null,
              preventivePlan: null,
              riskAssessment: null,
              description1: null,
              description2: null,
            }
          : {
              responseType,
              observation: null,
              severity: severity || null,
              preventivePlan: preventivePlan || null,
              riskAssessment: riskAssessment || null,
              description1: description1 || null,
              description2: description2 || null,
            };

      const savedResponse = await tx.auditQuestionResponse.upsert({
        where: {
          questionId_auditorId_auditId: {
            questionId,
            auditorId,
            auditId,
          },
        },
        update: responseData,
        create: {
          questionId,
          auditorId,
          auditId,
          ...responseData,
        },
      });

      if (
        responseTypeChanged ||
        uploadedImages.length > 0 ||
        req.body.keepEvidenceIds
      ) {
        await tx.auditQuestionEvidence.deleteMany({
          where: {
            responseId: savedResponse.id,
            ...(effectiveKeepEvidenceIds.length > 0
              ? { id: { notIn: effectiveKeepEvidenceIds } }
              : {}),
          },
        });
      }

      if (uploadedImages.length > 0) {
        await tx.auditQuestionEvidence.createMany({
          data: uploadedImages.map((image) => ({
            ...image,
            responseId: savedResponse.id,
          })),
        });
      }

      return tx.auditQuestionResponse.findUnique({
        where: { id: savedResponse.id },
        include: { evidence: true },
      });
    });

    if (isNewNc) {
      await createNotification({
        title: "Non-compliance raised",
        message: "A new non-compliance has been raised.",
        type: NOTIFICATION_TYPES.NC_RAISED,
        recipientRole: "ADMIN",
        projectId: audit.projectId,
        auditId,
        questionId,
        createdById: auditorId,
        link: `/admin-dashboard/ncTracker`,
      });
    }

    res.status(200).json({
      message: "Audit response saved successfully.",
      data: response,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to save audit response.",
    });
  }
};

const getNonComplianceResponses = async (req, res) => {
  try {
    const scopedWhere = await getProjectScopeWhere(req.user);

    const responses = await prisma.auditQuestionResponse.findMany({
      where: {
        responseType: "NON_COMPLIANCE",
        ...scopedWhere,
      },
      include: {
        auditor: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
          },
        },
        evidence: true,
        question: {
          include: {
            section: true,
          },
        },
        audit: {
          include: {
            checklistTemplate: {
              select: {
                id: true,
                name: true,
                auditType: true,
              },
            },
            project: {
              include: {
                company: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const completedReportKeys = await getCompletedReportKeys(req.user);
    const visibleResponses = completedReportKeys
      ? responses.filter((response) =>
          completedReportKeys.has(`${response.auditId}:${response.auditorId}`),
        )
      : responses;

    const data = visibleResponses.map((response) => {
      const question = response.question;
      const section = question?.section;
      const audit = response.audit;
      const project = audit?.project;
      const hasActionEvidence = response.evidence.some(
        (item) => item.evidenceType === "action",
      );

      return {
        id: response.id,
        responseType: response.responseType,
        severity: response.severity,
        preventivePlan: response.preventivePlan,
        riskAssessment: response.riskAssessment,
        description1: response.description1,
        description2: response.description2,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
        status: hasActionEvidence ? "CLOSED" : "OPEN",
        auditor: response.auditor,
        evidence: response.evidence,
        question: question
          ? {
              id: question.id,
              questionNumber: question.questionNumber,
              text: question.text,
            }
          : null,
        subcategory: section
          ? {
              id: section.id,
              sectionNumber: section.sectionNumber,
              title: section.title,
              mainMenu: section.mainMenu,
              mainMenuNumber: section.mainMenuNumber,
            }
          : null,
        audit: audit
          ? {
              id: audit.id,
              auditType: audit.auditType,
              frequency: audit.frequency,
              checklistTemplate: audit.checklistTemplate,
            }
          : null,
        project: project
          ? {
              id: project.id,
              projectName: project.projectName,
              siteAddress: project.siteAddress,
              companyName: project.company?.companyName,
            }
          : null,
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Unable to load non-compliance records.",
    });
  }
};

module.exports = {
  auditQuestionImageUpload,
  saveAuditQuestionResponse,
  getNonComplianceResponses,
};
