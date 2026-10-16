const multer = require("multer");
const prisma = require("../../config/prisma");
const uploadToCloudinary = require("../../utils/cloudinaryUpload");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

const CHEMICAL_CREATOR_ROLES = [
  "SITE_USER",
  "SITE_INCHARGE",
  "CORPORATE_MANAGER",
  "REGIONAL_MANAGER",
];

const chemicalUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const isSafetyDataSheet = file.fieldname === "safetyDataSheet";
    const isChemicalImage = file.fieldname === "chemicalImage";
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";
    const isAllowed =
      (isSafetyDataSheet && (isPdf || isImage)) ||
      (isChemicalImage && isImage);

    if (isAllowed) {
      cb(null, true);
      return;
    }

    cb(
      new Error(
        isChemicalImage
          ? "Chemical image only accepts image files"
          : "Safety Data Sheet only accepts PDF documents and images"
      ),
      false
    );
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const isAdmin = (req) => req.user?.role === "ADMIN";
const canManageChemicals = (req) =>
  CHEMICAL_CREATOR_ROLES.includes(req.user?.role);

const requireChemicalCreator = (req, res) => {
  if (canManageChemicals(req)) return true;

  res.status(403).json({
    success: false,
    message: "You are not allowed to manage chemicals",
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
    const assignedProject = await prisma.project.findFirst({
      where: {
        id: projectId,
        audits: {
          some: {
            auditors: {
              some: {
                userId: req.user.id,
              },
            },
          },
        },
      },
      select: {
        id: true,
        companyId: true,
        siteInchargeId: true,
        siteUserId: true,
      },
    });

    return assignedProject;
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

const requireAdmin = (req, res) => {
  if (isAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Only admin can approve or reject chemicals",
  });
  return false;
};

const serializeChemical = (chemical) => chemical;

const getChemicalById = async (chemicalRecordId) => {
  return prisma.chemical.findUnique({
    where: { id: chemicalRecordId },
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          username: true,
          role: true,
        },
      },
    },
  });
};

const generateChemicalId = async (projectId) => {
  const lastChemical = await prisma.chemical.findFirst({
    where: { projectId },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      chemicalId: true,
    },
  });

  let nextNumber = 1;

  if (lastChemical?.chemicalId) {
    const lastNumber = Number(lastChemical.chemicalId.split("-").pop());

    if (!Number.isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  return `CHM-2026-${String(nextNumber).padStart(4, "0")}`;
};

exports.chemicalDocumentUpload = chemicalUpload.fields([
  { name: "safetyDataSheet", maxCount: 1 },
  { name: "chemicalImage", maxCount: 1 },
]);

exports.createChemical = async (req, res) => {
  try {
    if (!requireChemicalCreator(req, res)) return;

    const { projectId } = req.params;
    const { chemicalName } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    if (!chemicalName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Chemical name is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const safetyDataSheet = req.files?.safetyDataSheet?.[0] || null;
    const chemicalImage = req.files?.chemicalImage?.[0] || null;
    let uploadedSheet = null;
    let uploadedImage = null;

    if (safetyDataSheet) {
      uploadedSheet = await uploadToCloudinary(
        safetyDataSheet,
        "audit-portal/chemicals/documents"
      );
    }

    if (chemicalImage) {
      uploadedImage = await uploadToCloudinary(
        chemicalImage,
        "audit-portal/chemicals/images"
      );
    }

    const chemicalId = await generateChemicalId(projectId);

    const chemical = await prisma.chemical.create({
      data: {
        chemicalName: chemicalName.trim(),
        chemicalId,
        safetyDataSheetUrl: uploadedSheet?.secure_url || null,
        safetyDataSheetPublicId: uploadedSheet?.public_id || null,
        safetyDataSheetName: safetyDataSheet?.originalname || null,
        safetyDataSheetType: safetyDataSheet?.mimetype || null,
        chemicalImageUrl: uploadedImage?.secure_url || null,
        chemicalImagePublicId: uploadedImage?.public_id || null,
        chemicalImageName: chemicalImage?.originalname || null,
        chemicalImageType: chemicalImage?.mimetype || null,
        status: "Pending",
        rejectionRemark: null,
        sentToAdmin: false,
        submittedAt: null,
        correctionComment: null,
        correctionRequestedAt: null,
        projectId,
        createdById: req.user.id,
      },
    });

    res.status(201).json({
      success: true,
      message: "Chemical created successfully",
      chemical,
    });
  } catch (error) {
    console.log(error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Chemical ID already exists for this project",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.updateChemical = async (req, res) => {
  try {
    if (!requireChemicalCreator(req, res)) return;

    const { projectId, chemicalId } = req.params;
    const { chemicalName } = req.body;

    if (!projectId || !chemicalId) {
      return res.status(400).json({
        success: false,
        message: "Project id and chemical id are required",
      });
    }

    if (!chemicalName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Chemical name is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingChemical = await prisma.chemical.findFirst({
      where: {
        id: chemicalId,
        projectId,
      },
    });

    if (!existingChemical) {
      return res.status(404).json({
        success: false,
        message: "Chemical not found for this project",
      });
    }

    if (existingChemical.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved chemical cannot be edited",
      });
    }

    const safetyDataSheet = req.files?.safetyDataSheet?.[0] || null;
    const chemicalImage = req.files?.chemicalImage?.[0] || null;
    let uploadedSheet = null;
    let uploadedImage = null;

    if (safetyDataSheet) {
      uploadedSheet = await uploadToCloudinary(
        safetyDataSheet,
        "audit-portal/chemicals/documents"
      );
    }

    if (chemicalImage) {
      uploadedImage = await uploadToCloudinary(
        chemicalImage,
        "audit-portal/chemicals/images"
      );
    }

    await prisma.chemical.update({
      where: { id: chemicalId },
      data: {
        chemicalName: chemicalName.trim(),
        ...(uploadedSheet
          ? {
              safetyDataSheetUrl: uploadedSheet.secure_url,
              safetyDataSheetPublicId: uploadedSheet.public_id,
              safetyDataSheetName: safetyDataSheet.originalname,
              safetyDataSheetType: safetyDataSheet.mimetype,
            }
          : {}),
        ...(uploadedImage
          ? {
              chemicalImageUrl: uploadedImage.secure_url,
              chemicalImagePublicId: uploadedImage.public_id,
              chemicalImageName: chemicalImage.originalname,
              chemicalImageType: chemicalImage.mimetype,
            }
          : {}),
        status: "Pending",
        rejectionRemark: null,
        sentToAdmin: existingChemical.sentToAdmin,
        submittedAt: existingChemical.sentToAdmin ? new Date() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });

    const chemical = await getChemicalById(chemicalId);

    res.status(200).json({
      success: true,
      message: "Chemical updated successfully",
      chemical: serializeChemical(chemical),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.updateChemicalStatus = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { projectId, chemicalId } = req.params;
    const { status, rejectionRemark } = req.body;
    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!projectId || !chemicalId) {
      return res.status(400).json({
        success: false,
        message: "Project id and chemical id are required",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Pending, Approved, or Rejected",
      });
    }

    if (status === "Rejected" && !rejectionRemark?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection remark is required",
      });
    }

    const existingChemical = await prisma.chemical.findFirst({
      where: {
        id: chemicalId,
        projectId,
        sentToAdmin: true,
      },
      select: { id: true },
    });

    if (!existingChemical) {
      return res.status(404).json({
        success: false,
        message: "Chemical not found for this project",
      });
    }

    await prisma.chemical.update({
      where: { id: chemicalId },
      data: {
        status,
        rejectionRemark: status === "Rejected" ? rejectionRemark.trim() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });

    const chemical = await getChemicalById(chemicalId);

    if (chemical?.createdById && status !== "Pending") {
      await createNotification({
        title: `Chemical ${status.toLowerCase()}`,
        message:
          status === "Approved"
            ? "Your Chemical Products have been approved."
            : "Your Chemical Products have been rejected.",
        type:
          status === "Approved"
            ? NOTIFICATION_TYPES.CHEMICAL_APPROVED
            : NOTIFICATION_TYPES.CHEMICAL_REJECTED,
        recipientId: chemical.createdById,
        projectId,
        createdById: req.user?.id || null,
        link: `/user-dashboard/operation/chemical`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Chemical ${status.toLowerCase()} successfully`,
      chemical: serializeChemical(chemical),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.requestChemicalCorrection = async (req, res) => {
  try {
    if (!requireChemicalCreator(req, res)) return;

    const { projectId, chemicalId } = req.params;
    const comment = req.body.comment?.trim();

    if (!projectId || !chemicalId) {
      return res.status(400).json({
        success: false,
        message: "Project id and chemical id are required",
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

    const existingChemical = await prisma.chemical.findFirst({
      where: {
        id: chemicalId,
        projectId,
        status: "Approved",
      },
      select: { id: true },
    });

    if (!existingChemical) {
      return res.status(404).json({
        success: false,
        message: "Approved chemical not found for this project",
      });
    }

    await prisma.chemical.update({
      where: { id: chemicalId },
      data: {
        correctionComment: comment,
        correctionRequestedAt: new Date(),
        sentToAdmin: true,
        submittedAt: new Date(),
      },
    });

    const chemical = await getChemicalById(chemicalId);

    await createNotification({
      title: "Chemical correction submitted",
      message: "New Chemical Products have been submitted for approval.",
      type: NOTIFICATION_TYPES.CHEMICAL_SUBMITTED,
      recipientRole: "ADMIN",
      projectId,
      createdById: req.user?.id || null,
      link: `/admin-dashboard/project/${projectId}/workspace/chemical`,
    });

    res.status(200).json({
      success: true,
      message: "Correction comment sent to admin successfully",
      chemical: serializeChemical(chemical),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getChemicalsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const where = isAdmin(req) ? { projectId, sentToAdmin: true } : { projectId };

    const chemicals = await prisma.chemical.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
            role: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      chemicals,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.submitChemicalsToAdmin = async (req, res) => {
  try {
    if (!requireChemicalCreator(req, res)) return;

    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const result = await prisma.chemical.updateMany({
      where: {
        projectId,
        sentToAdmin: false,
        status: {
          not: "Approved",
        },
      },
      data: {
        sentToAdmin: true,
        submittedAt: new Date(),
        status: "Pending",
        rejectionRemark: null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });
    const chemicals = await prisma.chemical.findMany({
      where: {
        projectId,
        sentToAdmin: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true,
            role: true,
          },
        },
      },
    });

    if (result.count > 0) {
      await createNotification({
        title: "Chemical Products submitted for approval",
        message: "New Chemical Products have been submitted for approval.",
        type: NOTIFICATION_TYPES.CHEMICAL_SUBMITTED,
        recipientRole: "ADMIN",
        projectId,
        createdById: req.user?.id || null,
        link: `/admin-dashboard/project/${projectId}/workspace/chemical`,
      });
    }

    res.status(200).json({
      success: true,
      message:
        result.count > 0
          ? "Chemicals sent to admin successfully"
          : "No new chemicals to send",
      submittedCount: result.count,
      chemicals,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.deleteChemical = async (req, res) => {
  try {
    if (!requireChemicalCreator(req, res)) return;

    const { projectId, chemicalId } = req.params;

    if (!projectId || !chemicalId) {
      return res.status(400).json({
        success: false,
        message: "Project id and chemical id are required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingChemical = await prisma.chemical.findFirst({
      where: {
        id: chemicalId,
        projectId,
      },
      select: { id: true, status: true },
    });

    if (!existingChemical) {
      return res.status(404).json({
        success: false,
        message: "Chemical not found for this project",
      });
    }

    if (existingChemical.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved chemicals cannot be deleted",
      });
    }

    await prisma.chemical.delete({
      where: { id: chemicalId },
    });

    res.status(200).json({
      success: true,
      message: "Chemical deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
