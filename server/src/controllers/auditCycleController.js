const multer = require("multer");
const prisma = require("../config/prisma");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const { ensureProjectChecklist } = require("../utils/projectChecklist");
const {
  COMPLETED_REPORT_STATUSES,
  assertAuditEditable,
} = require("../utils/auditLifecycle");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");

const reviewUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files are allowed"), false);
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 10,
  },
}).array("closureEvidence", 10);

const fileToDataUrl = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

const uploadClosureEvidence = async (file) => {
  try {
    const uploaded = await uploadToCloudinary(
      file,
      "audit-portal/previous-nc-closure-evidence",
    );
    return {
      imageUrl: uploaded.secure_url,
      imagePublicId: uploaded.public_id,
    };
  } catch {
    return {
      imageUrl: fileToDataUrl(file),
      imagePublicId: null,
    };
  }
};

const getAssignedAudit = async (auditId, auditorId) =>
  prisma.audit.findFirst({
    where: {
      id: auditId,
      auditors: {
        some: { userId: auditorId },
      },
    },
    include: {
      auditors: true,
      checklistTemplate: true,
      project: {
        include: { company: true },
      },
    },
  });

const NEXT_AUDIT_UPDATE_TYPES = new Set([
  "WORKFORCE",
  "MACHINERY",
  "CHEMICAL",
  "DOCUMENT",
]);

const buildPreviousNcSnapshots = async (sourceAudit, auditorId) => {
  const projectId = sourceAudit.projectId;
  const [
    checklist,
    workforce,
    machinery,
    chemical,
    carriedReviews,
    queuedUpdates,
  ] =
    await Promise.all([
    prisma.auditQuestionResponse.findMany({
      where: {
        auditorId,
        auditId: sourceAudit.id,
        responseType: "NON_COMPLIANCE",
        evidence: { none: { evidenceType: "action" } },
      },
      include: {
        evidence: true,
        question: { include: { section: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workforceNonCompliance.findMany({
      where: {
        projectId,
        auditorId,
        evidence: { none: { evidenceType: "action" } },
        ...(sourceAudit.cycleNumber <= 1
          ? { OR: [{ auditId: sourceAudit.id }, { auditId: null }] }
          : { auditId: sourceAudit.id }),
      },
      include: { evidence: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.machineryNonCompliance.findMany({
      where: {
        projectId,
        auditorId,
        evidence: { none: { evidenceType: "action" } },
        ...(sourceAudit.cycleNumber <= 1
          ? { OR: [{ auditId: sourceAudit.id }, { auditId: null }] }
          : { auditId: sourceAudit.id }),
      },
      include: { evidence: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chemicalNonCompliance.findMany({
      where: {
        projectId,
        auditorId,
        evidence: { none: { evidenceType: "action" } },
        ...(sourceAudit.cycleNumber <= 1
          ? { OR: [{ auditId: sourceAudit.id }, { auditId: null }] }
          : { auditId: sourceAudit.id }),
      },
      include: { evidence: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.previousNcReview.findMany({
      where: {
        currentAuditId: sourceAudit.id,
        auditorId,
        currentStatus: { in: ["OPEN", "PARTIALLY_CLOSED"] },
      },
      include: {
        closureEvidence: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.nextAuditUpdateSelection.findMany({
      where: {
        sourceAuditId: sourceAudit.id,
        auditorId,
        selectionStatus: "QUEUED",
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return [
    ...queuedUpdates.map((item) => ({
      sourceType: `UPDATE_${item.sourceType}`,
      sourceId: item.sourceId,
      sourceSnapshot: {
        ...(item.sourceSnapshot || {}),
        category:
          item.sourceSnapshot?.category ||
          `${item.sourceType.toLowerCase()} update`,
        previousObservation:
          item.sourceSnapshot?.previousObservation ||
          "Admin-approved project update selected for the next audit cycle.",
        queuedForNextAudit: true,
      },
    })),
    ...carriedReviews.map((item) => ({
      sourceType: item.sourceType.startsWith("CARRIED_")
        ? item.sourceType
        : `CARRIED_${item.sourceType}`,
      sourceId: item.id,
      sourceSnapshot: {
        ...(item.sourceSnapshot || {}),
        title:
          item.sourceSnapshot?.title ||
          "Carried previous audit non-compliance",
        previousObservation:
          item.closureRemarks ||
          item.auditorRemarks ||
          item.sourceSnapshot?.previousObservation,
        previousRecommendation:
          item.actionRequired ||
          item.correctiveActionsTaken ||
          item.sourceSnapshot?.previousRecommendation,
        preventiveManagement: {
          rootCauseAnalysis: item.rootCauseAnalysis,
          correctiveActionsTaken: item.correctiveActionsTaken,
          responsiblePerson: item.responsiblePerson,
          completionDate: item.managementCompletionDate,
        },
        preventiveActionPlan: {
          actionRequired: item.actionRequired,
          owner: item.actionOwner,
          targetDate: item.targetDate,
          currentProgress: item.currentProgress,
        },
        previousStatus: item.currentStatus,
        evidence: [
          ...(item.sourceSnapshot?.evidence || []),
          ...item.closureEvidence,
        ],
      },
    })),
    ...checklist.map((item) => ({
      sourceType: "CHECKLIST",
      sourceId: item.id,
      sourceSnapshot: {
        title: item.question?.text || "Checklist non-compliance",
        questionNumber: item.question?.questionNumber,
        category: item.question?.section?.mainMenu,
        subcategory: item.question?.section?.title,
        sectionCategory: item.question?.dueDateText?.trim()
          ? "RECORDS_DOCUMENTS"
          : "CONTROL_MEASURES",
        previousObservation: item.description1 || item.observation,
        previousRecommendation: item.description2 || item.preventivePlan,
        preventiveManagement: item.riskAssessment,
        preventiveActionPlan: item.preventivePlan,
        severity: item.severity,
        evidence: item.evidence,
      },
    })),
    ...workforce.map((item) => ({
      sourceType: "WORKFORCE",
      sourceId: item.id,
      sourceSnapshot: {
        title: item.workforce,
        category: "Workforce",
        subcategory: item.subcontractedCompany,
        previousObservation: item.description1,
        previousRecommendation: item.description2,
        evidence: item.evidence,
      },
    })),
    ...machinery.map((item) => ({
      sourceType: "MACHINERY",
      sourceId: item.id,
      sourceSnapshot: {
        title: item.machineryName,
        category: "Machinery",
        previousObservation: item.description1,
        previousRecommendation: item.description2,
        evidence: item.evidence,
      },
    })),
    ...chemical.map((item) => ({
      sourceType: "CHEMICAL",
      sourceId: item.id,
      sourceSnapshot: {
        title: item.chemicalName,
        category: "Chemical",
        previousObservation: item.description1,
        previousRecommendation: item.description2,
        evidence: item.evidence,
      },
    })),
  ];
};

exports.startNewAuditCycle = async (req, res) => {
  try {
    const sourceAudit = await getAssignedAudit(
      req.params.auditId,
      req.user.id,
    );

    if (!sourceAudit) {
      return res.status(404).json({
        message: "The completed audit was not found for this auditor.",
      });
    }

    const completedReport = await prisma.auditReport.findFirst({
      where: {
        auditId: sourceAudit.id,
        auditorId: req.user.id,
        status: { in: COMPLETED_REPORT_STATUSES },
      },
    });

    if (!completedReport) {
      return res.status(409).json({
        message: "Complete the previous audit report before starting a re-audit.",
      });
    }

    const existingNextAudit = await prisma.audit.findFirst({
      where: {
        previousAuditId: sourceAudit.id,
        auditors: { some: { userId: req.user.id } },
      },
      include: {
        checklistTemplate: true,
        auditors: { include: { user: true } },
        project: { include: { company: true } },
      },
    });

    if (existingNextAudit) {
      const existingSnapshots = await buildPreviousNcSnapshots(
        sourceAudit,
        req.user.id,
      );
      if (existingSnapshots.length > 0) {
        await prisma.previousNcReview.createMany({
          data: existingSnapshots.map((snapshot) => ({
            currentAuditId: existingNextAudit.id,
            sourceAuditId: sourceAudit.id,
            auditorId: req.user.id,
            ...snapshot,
          })),
          skipDuplicates: true,
        });
      }
      await prisma.nextAuditUpdateSelection.deleteMany({
        where: {
          sourceAuditId: sourceAudit.id,
          auditorId: req.user.id,
        },
      });

      return res.json({
        success: true,
        message: "The next audit cycle already exists.",
        data: existingNextAudit,
      });
    }

    const snapshots = await buildPreviousNcSnapshots(sourceAudit, req.user.id);

    const newAudit = await prisma.$transaction(async (tx) => {
      const createdAudit = await tx.audit.create({
        data: {
          projectId: sourceAudit.projectId,
          auditType: sourceAudit.auditType,
          checklistType: sourceAudit.checklistType,
          frequency: sourceAudit.frequency,
          numberOfAudits: sourceAudit.numberOfAudits,
          cycleNumber: (sourceAudit.cycleNumber || 1) + 1,
          previousAuditId: sourceAudit.id,
          auditors: {
            create: sourceAudit.auditors.map((assignment) => ({
              userId: assignment.userId,
            })),
          },
        },
      });

      await ensureProjectChecklist(
        tx,
        sourceAudit.projectId,
        sourceAudit.checklistType,
        sourceAudit.checklistType,
      );

      if (snapshots.length > 0) {
        await tx.previousNcReview.createMany({
          data: snapshots.map((snapshot) => ({
            currentAuditId: createdAudit.id,
            sourceAuditId: sourceAudit.id,
            auditorId: req.user.id,
            ...snapshot,
          })),
        });
      }

      await tx.nextAuditUpdateSelection.deleteMany({
        where: {
          sourceAuditId: sourceAudit.id,
          auditorId: req.user.id,
        },
      });

      return tx.audit.findUnique({
        where: { id: createdAudit.id },
        include: {
          checklistTemplate: true,
          auditors: { include: { user: true } },
          project: { include: { company: true } },
        },
      });
    });

    for (const assignment of newAudit.auditors) {
      if (!assignment.user) continue;

      await createNotification({
        title: "New audit cycle started",
        message: `A new audit cycle has started for ${newAudit.project?.projectName || "your project"}.`,
        type: NOTIFICATION_TYPES.AUDIT_CYCLE_STARTED,
        recipientId: assignment.user.id,
        projectId: newAudit.projectId,
        auditId: newAudit.id,
        createdById: req.user?.id || null,
        link: `/auditor-dashboard/projectSelection`,
      });
    }

    res.status(201).json({
      success: true,
      message:
        "New audit cycle started. Previous non-compliances are available for optional follow-up.",
      data: newAudit,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to start a new audit cycle.",
    });
  }
};

exports.getNextAuditUpdateSelections = async (req, res) => {
  try {
    const audit = await getAssignedAudit(req.params.auditId, req.user.id);

    if (!audit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    const selections = await prisma.nextAuditUpdateSelection.findMany({
      where: {
        sourceAuditId: audit.id,
        auditorId: req.user.id,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: selections });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Unable to load next audit updates.",
    });
  }
};

exports.queueNextAuditUpdate = async (req, res) => {
  try {
    const audit = await getAssignedAudit(req.params.auditId, req.user.id);

    if (!audit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    const { sourceType, sourceId, sourceSnapshot } = req.body;

    if (
      !NEXT_AUDIT_UPDATE_TYPES.has(sourceType) ||
      !sourceId ||
      !sourceSnapshot ||
      typeof sourceSnapshot !== "object"
    ) {
      return res.status(400).json({
        message: "A valid approved update is required.",
      });
    }

    const selection = await prisma.nextAuditUpdateSelection.upsert({
      where: {
        sourceAuditId_auditorId_sourceType_sourceId: {
          sourceAuditId: audit.id,
          auditorId: req.user.id,
          sourceType,
          sourceId,
        },
      },
      create: {
        sourceAuditId: audit.id,
        auditorId: req.user.id,
        sourceType,
        sourceId,
        sourceSnapshot,
      },
      update: {
        sourceSnapshot,
        selectionStatus: "QUEUED",
      },
    });

    res.status(201).json({
      success: true,
      message: "Update queued for the next audit cycle.",
      data: selection,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Unable to queue the update.",
    });
  }
};

exports.removeNextAuditUpdate = async (req, res) => {
  try {
    const audit = await getAssignedAudit(req.params.auditId, req.user.id);

    if (!audit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    const selection = await prisma.nextAuditUpdateSelection.findFirst({
      where: {
        sourceAuditId: audit.id,
        auditorId: req.user.id,
        id: req.params.selectionId,
      },
    });

    if (!selection) {
      return res.status(404).json({
        message: "Queued update not found.",
      });
    }

    await prisma.nextAuditUpdateSelection.update({
      where: { id: selection.id },
      data: { selectionStatus: "DISMISSED" },
    });

    res.json({
      success: true,
      message: "Update dismissed and removed from the next audit report.",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Unable to remove the queued update.",
    });
  }
};

exports.getPreviousNcReviews = async (req, res) => {
  try {
    const audit = await getAssignedAudit(req.params.auditId, req.user.id);

    if (!audit) {
      return res.status(404).json({ message: "Audit not found." });
    }

    const reviews = await prisma.previousNcReview.findMany({
      where: {
        currentAuditId: audit.id,
        auditorId: req.user.id,
        currentStatus: { in: ["OPEN", "PARTIALLY_CLOSED"] },
      },
      include: {
        closureEvidence: {
          orderBy: { createdAt: "asc" },
        },
        sourceAudit: {
          select: {
            cycleNumber: true,
            schedules: { select: { date: true }, take: 1 },
            auditReports: {
              where: {
                auditorId: req.user.id,
                status: { in: COMPLETED_REPORT_STATUSES },
              },
              select: { completedAt: true },
              orderBy: { completedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ reviewedAt: "asc" }, { createdAt: "asc" }],
    });

    res.json({
      success: true,
      data: reviews,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Unable to load previous non-compliances.",
    });
  }
};

exports.updatePreviousNcReview = async (req, res) => {
  try {
    const review = await prisma.previousNcReview.findFirst({
      where: {
        id: req.params.reviewId,
        currentAuditId: req.params.auditId,
        auditorId: req.user.id,
      },
      include: { closureEvidence: true },
    });

    if (!review) {
      return res.status(404).json({ message: "Previous NC review not found." });
    }

    await assertAuditEditable(review.currentAuditId, req.user.id);

    const uploadedEvidence = [];
    for (const file of req.files || []) {
      const uploaded = await uploadClosureEvidence(file);
      uploadedEvidence.push({
        imageUrl: uploaded.imageUrl,
        imagePublicId: uploaded.imagePublicId,
        imageName: file.originalname,
        imageType: file.mimetype,
      });
    }

    if (uploadedEvidence.length === 0 && review.closureEvidence.length === 0) {
      return res.status(400).json({
        message: "Upload at least one closure image to close this non-compliance.",
      });
    }

    const updated = await prisma.previousNcReview.update({
      where: { id: review.id },
      data: {
        currentStatus: "CLOSED",
        closureDate: new Date(),
        reviewedAt: new Date(),
        closureEvidence: {
          create: uploadedEvidence,
        },
      },
      include: { closureEvidence: true },
    });

    res.json({
      success: true,
      message: "Non-compliance closed.",
      data: updated,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to close this non-compliance.",
    });
  }
};

module.exports.reviewUpload = reviewUpload;
