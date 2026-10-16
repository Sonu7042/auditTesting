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
      return;
    }

    cb(new Error("Only image files are allowed"), false);
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 20,
  },
});

const workforceNonComplianceUpload = imageUpload.array("images", 20);

const fileToDataUrl = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

const parseImageTypes = (rawValue, fileCount) => {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed : Array(fileCount).fill("evidence");
  } catch {
    return Array(fileCount).fill("evidence");
  }
};

const uploadEvidenceImage = async (file) => {
  try {
    const uploadedImage = await uploadToCloudinary(
      file,
      "audit-portal/workforce-non-compliance/images",
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

const getProjectAccessWhere = async (user, projectId) => {
  if (user?.role === "ADMIN") return { id: projectId };

  if (user?.role === "AUDITOR") {
    return {
      id: projectId,
      audits: {
        some: {
          auditors: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user?.id },
    select: { companyId: true },
  });

  return {
    id: projectId,
    companyId: dbUser?.companyId || "__none__",
  };
};

const createWorkforceNonCompliance = async (req, res) => {
  try {
    const {
      projectId,
      auditId,
      subcontractedCompany,
      workforce,
      workforceRole,
      phoneNumber,
      description1,
      description2,
    } = req.body;
    const auditorId = req.user?.id;

    if (!auditorId) {
      return res.status(401).json({ message: "Auditor login is required." });
    }

    if (
      !projectId ||
      !auditId ||
      !subcontractedCompany?.trim() ||
      !workforce?.trim() ||
      !workforceRole?.trim() ||
      !phoneNumber?.trim() ||
      !description1?.trim()
    ) {
      return res.status(400).json({
        message: "Project, subcontracted company, workforce, role, phone number and issue description are required.",
      });
    }

    const imageTypes = parseImageTypes(req.body.imageTypes, req.files?.length || 0);

    const project = await prisma.project.findFirst({
      where: await getProjectAccessWhere(req.user, projectId),
      select: {
        id: true,
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found for this auditor.",
      });
    }

    await assertAuditEditable(auditId, auditorId);

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

    const nonCompliance = await prisma.workforceNonCompliance.create({
      data: {
        projectId,
        auditId,
        auditorId,
        subcontractedCompany: subcontractedCompany.trim(),
        workforce: workforce.trim(),
        workforceRole: workforceRole.trim(),
        phoneNumber: phoneNumber.trim(),
        description1: description1.trim(),
        description2: description2?.trim() || null,
        evidence: {
          create: uploadedImages,
        },
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
        project: {
          include: {
            company: true,
          },
        },
        evidence: true,
      },
    });

    await createNotification({
      title: "Non-compliance raised",
      message: "A new non-compliance has been raised.",
      type: NOTIFICATION_TYPES.NC_RAISED,
      recipientRole: "ADMIN",
      projectId,
      auditId,
      createdById: auditorId,
      link: `/admin-dashboard/ncTracker`,
    });

    res.status(201).json({
      success: true,
      message: "Workforce non-conformity saved successfully.",
      data: nonCompliance,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save workforce non-conformity.",
    });
  }
};

const getWorkforceNonCompliances = async (req, res) => {
  try {
    const { projectId, auditId } = req.query;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required.",
      });
    }

    const project = await prisma.project.findFirst({
      where: await getProjectAccessWhere(req.user, projectId),
      select: {
        id: true,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found for this auditor.",
      });
    }

    const records = await prisma.workforceNonCompliance.findMany({
      where: {
        projectId,
        ...(auditId ? { auditId } : {}),
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
        project: {
          include: {
            company: true,
          },
        },
        evidence: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const completedReportKeys = await getCompletedReportKeys(req.user);
    const visibleRecords = completedReportKeys
      ? records.filter((record) =>
          completedReportKeys.has(`${record.auditId}:${record.auditorId}`),
        )
      : records;

    res.json({
      success: true,
      data: visibleRecords,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Unable to load workforce non-conformities.",
    });
  }
};

const addWorkforceNonComplianceActionEvidence = async (req, res) => {
  try {
    const { recordId } = req.params;
    const auditorId = req.user?.id;

    if (!auditorId) {
      return res.status(401).json({ message: "Auditor login is required." });
    }

    if (!req.files?.length) {
      return res.status(400).json({
        message: "Upload at least one corrective-action image.",
      });
    }

    const record = await prisma.workforceNonCompliance.findFirst({
      where: {
        id: recordId,
        auditorId,
      },
      select: {
        id: true,
        auditId: true,
      },
    });

    if (!record) {
      return res.status(404).json({
        message: "Workforce non-conformity not found.",
      });
    }

    await assertAuditEditable(record.auditId, auditorId);

    const uploadedImages = [];

    for (const file of req.files || []) {
      const uploadedImage = await uploadEvidenceImage(file);

      uploadedImages.push({
        nonComplianceId: record.id,
        evidenceType: "action",
        imageUrl: uploadedImage.imageUrl,
        imagePublicId: uploadedImage.imagePublicId,
        imageName: file.originalname,
        imageType: file.mimetype,
      });
    }

    await prisma.workforceNonComplianceEvidence.createMany({
      data: uploadedImages,
    });

    const updatedRecord = await prisma.workforceNonCompliance.findUnique({
      where: { id: record.id },
      include: {
        auditor: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
          },
        },
        project: {
          include: {
            company: true,
          },
        },
        evidence: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    res.json({
      success: true,
      message: "Corrective-action image uploaded successfully.",
      data: updatedRecord,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to upload corrective-action image.",
    });
  }
};

module.exports = {
  workforceNonComplianceUpload,
  createWorkforceNonCompliance,
  getWorkforceNonCompliances,
  addWorkforceNonComplianceActionEvidence,
};
