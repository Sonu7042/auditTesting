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

const machineryNonComplianceUpload = imageUpload.array("images", 20);

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
      "audit-portal/machinery-non-compliance/images",
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

const createMachineryNonCompliance = async (req, res) => {
  try {
    const { projectId, auditId, machineryName, description1, description2 } = req.body;
    const auditorId = req.user?.id;

    if (!auditorId) {
      return res.status(401).json({ message: "Auditor login is required." });
    }

    if (
      !projectId ||
      !auditId ||
      !machineryName?.trim() ||
      !description1?.trim() ||
      !description2?.trim()
    ) {
      return res.status(400).json({
        message:
          "Project, machinery, issue description and solution description are required.",
      });
    }

    if (!req.files?.length) {
      return res.status(400).json({
        message: "Add at least one non-compliance evidence image.",
      });
    }

    const imageTypes = parseImageTypes(req.body.imageTypes, req.files.length);
    if (!imageTypes.includes("evidence")) {
      return res.status(400).json({
        message: "Add at least one evidence image.",
      });
    }

    const project = await prisma.project.findFirst({
      where: await getProjectAccessWhere(req.user, projectId),
      select: { id: true },
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
        evidenceType: imageTypes[index] === "action" ? "action" : "evidence",
        imageUrl: uploadedImage.imageUrl,
        imagePublicId: uploadedImage.imagePublicId,
        imageName: file.originalname,
        imageType: file.mimetype,
      });
    }

    const nonCompliance = await prisma.machineryNonCompliance.create({
      data: {
        projectId,
        auditId,
        auditorId,
        machineryName: machineryName.trim(),
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
      message: "Machinery non-conformity saved successfully.",
      data: nonCompliance,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save machinery non-conformity.",
    });
  }
};

const getMachineryNonCompliances = async (req, res) => {
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
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found for this auditor.",
      });
    }

    const records = await prisma.machineryNonCompliance.findMany({
      where: { projectId, ...(auditId ? { auditId } : {}) },
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
      message: error.message || "Unable to load machinery non-conformities.",
    });
  }
};

const addMachineryNonComplianceActionEvidence = async (req, res) => {
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

    const record = await prisma.machineryNonCompliance.findFirst({
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
        message: "Machinery non-conformity not found.",
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

    await prisma.machineryNonComplianceEvidence.createMany({
      data: uploadedImages,
    });

    const updatedRecord = await prisma.machineryNonCompliance.findUnique({
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
  machineryNonComplianceUpload,
  createMachineryNonCompliance,
  getMachineryNonCompliances,
  addMachineryNonComplianceActionEvidence,
};
