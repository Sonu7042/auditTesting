const multer = require("multer");
const prisma = require("../../config/prisma");
const uploadToCloudinary = require("../../utils/cloudinaryUpload");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

const MACHINERY_CREATOR_ROLES = [
  "SITE_USER",
  "SITE_INCHARGE",
  "CORPORATE_MANAGER",
  "REGIONAL_MANAGER",
];

const machineryUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const isInspectionDocument = file.fieldname === "inspectionDocument";
    const isMachineryImage = file.fieldname === "machineryImage";
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";
    const isAllowed =
      (isInspectionDocument && (isPdf || isImage)) ||
      (isMachineryImage && isImage);

    if (isAllowed) {
      cb(null, true);
    } else {
      cb(
        new Error(
          isMachineryImage
            ? "Upload image only accepts image files"
            : "Inspection document only accepts PDF documents and images"
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const isAdmin = (req) => req.user?.role === "ADMIN";
const canManageMachinery = (req) =>
  MACHINERY_CREATOR_ROLES.includes(req.user?.role);

const requireMachineryCreator = (req, res) => {
  if (canManageMachinery(req)) return true;

  res.status(403).json({
    success: false,
    message: "You are not allowed to manage machinery",
  });
  return false;
};

const requireAdmin = (req, res) => {
  if (isAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Only admin can approve or reject machinery",
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

const serializeMachinery = (machinery) => machinery;

const getMachineryById = async (machineryRecordId) => {
  return prisma.machinery.findUnique({
    where: { id: machineryRecordId },
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

const generateMachineryId = async (projectId) => {
  const lastMachinery = await prisma.machinery.findFirst({
    where: { projectId },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      machineryId: true,
    },
  });

  let nextNumber = 1;

  if (lastMachinery?.machineryId) {
    const lastNumber = Number(lastMachinery.machineryId.split("-").pop());

    if (!Number.isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  return `MCH-2026-${String(nextNumber).padStart(4, "0")}`;
};

exports.machineryDocumentUpload = machineryUpload.fields([
  { name: "inspectionDocument", maxCount: 1 },
  { name: "machineryImage", maxCount: 1 },
]);

exports.createMachinery = async (req, res) => {
  try {
    if (!requireMachineryCreator(req, res)) return;

    const { projectId } = req.params;
    const { machineryName } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    if (!machineryName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Machinery name is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const inspectionDocument = req.files?.inspectionDocument?.[0] || null;
    const machineryImage = req.files?.machineryImage?.[0] || null;
    let uploadedDocument = null;
    let uploadedImage = null;

    if (inspectionDocument) {
      uploadedDocument = await uploadToCloudinary(
        inspectionDocument,
        "audit-portal/machinery/documents"
      );
    }

    if (machineryImage) {
      uploadedImage = await uploadToCloudinary(
        machineryImage,
        "audit-portal/machinery/images"
      );
    }

    const machineryId = await generateMachineryId(projectId);

    const machinery = await prisma.machinery.create({
      data: {
        machineryName: machineryName.trim(),
        machineryId,
        inspectionDocumentUrl: uploadedDocument?.secure_url || null,
        inspectionDocumentPublicId: uploadedDocument?.public_id || null,
        inspectionDocumentName: inspectionDocument?.originalname || null,
        inspectionDocumentType: inspectionDocument?.mimetype || null,
        machineryImageUrl: uploadedImage?.secure_url || null,
        machineryImagePublicId: uploadedImage?.public_id || null,
        machineryImageName: machineryImage?.originalname || null,
        machineryImageType: machineryImage?.mimetype || null,
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
      message: "Machinery created successfully",
      machinery: serializeMachinery(machinery),
    });
  } catch (error) {
    console.log(error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Machinery ID already exists for this project",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.getMachineriesByProject = async (req, res) => {
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

    const machineries = await prisma.machinery.findMany({
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
      machineries: machineries.map(serializeMachinery),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.updateMachinery = async (req, res) => {
  try {
    if (!requireMachineryCreator(req, res)) return;

    const { projectId, machineryId } = req.params;
    const { machineryName } = req.body;

    if (!projectId || !machineryId) {
      return res.status(400).json({
        success: false,
        message: "Project id and machinery id are required",
      });
    }

    if (!machineryName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Machinery name is required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingMachinery = await prisma.machinery.findFirst({
      where: {
        id: machineryId,
        projectId,
      },
    });

    if (!existingMachinery) {
      return res.status(404).json({
        success: false,
        message: "Machinery not found for this project",
      });
    }

    if (existingMachinery.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved machinery cannot be edited",
      });
    }

    const inspectionDocument = req.files?.inspectionDocument?.[0] || null;
    const machineryImage = req.files?.machineryImage?.[0] || null;
    let uploadedDocument = null;
    let uploadedImage = null;

    if (inspectionDocument) {
      uploadedDocument = await uploadToCloudinary(
        inspectionDocument,
        "audit-portal/machinery/documents"
      );
    }

    if (machineryImage) {
      uploadedImage = await uploadToCloudinary(
        machineryImage,
        "audit-portal/machinery/images"
      );
    }

    await prisma.machinery.update({
      where: { id: machineryId },
      data: {
        machineryName: machineryName.trim(),
        ...(uploadedDocument
          ? {
              inspectionDocumentUrl: uploadedDocument.secure_url,
              inspectionDocumentPublicId: uploadedDocument.public_id,
              inspectionDocumentName: inspectionDocument.originalname,
              inspectionDocumentType: inspectionDocument.mimetype,
            }
          : {}),
        ...(uploadedImage
          ? {
              machineryImageUrl: uploadedImage.secure_url,
              machineryImagePublicId: uploadedImage.public_id,
              machineryImageName: machineryImage.originalname,
              machineryImageType: machineryImage.mimetype,
            }
          : {}),
        status: "Pending",
        rejectionRemark: null,
        sentToAdmin: existingMachinery.sentToAdmin,
        submittedAt: existingMachinery.sentToAdmin ? new Date() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });

    const machinery = await getMachineryById(machineryId);

    res.status(200).json({
      success: true,
      message: "Machinery updated successfully",
      machinery: serializeMachinery(machinery),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.updateMachineryStatus = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { projectId, machineryId } = req.params;
    const { status, rejectionRemark } = req.body;
    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!projectId || !machineryId) {
      return res.status(400).json({
        success: false,
        message: "Project id and machinery id are required",
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

    const existingMachinery = await prisma.machinery.findFirst({
      where: {
        id: machineryId,
        projectId,
        sentToAdmin: true,
      },
      select: { id: true },
    });

    if (!existingMachinery) {
      return res.status(404).json({
        success: false,
        message: "Machinery not found for this project",
      });
    }

    await prisma.machinery.update({
      where: { id: machineryId },
      data: {
        status,
        rejectionRemark: status === "Rejected" ? rejectionRemark.trim() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });

    const machinery = await getMachineryById(machineryId);

    if (machinery?.createdById && status !== "Pending") {
      await createNotification({
        title: `Machinery ${status.toLowerCase()}`,
        message:
          status === "Approved"
            ? "Your Machinery has been approved."
            : "Your Machinery has been rejected.",
        type:
          status === "Approved"
            ? NOTIFICATION_TYPES.MACHINERY_APPROVED
            : NOTIFICATION_TYPES.MACHINERY_REJECTED,
        recipientId: machinery.createdById,
        projectId,
        createdById: req.user?.id || null,
        link: `/user-dashboard/operation/machinery`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Machinery ${status.toLowerCase()} successfully`,
      machinery: serializeMachinery(machinery),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.deleteMachinery = async (req, res) => {
  try {
    if (!requireMachineryCreator(req, res)) return;

    const { projectId, machineryId } = req.params;

    if (!projectId || !machineryId) {
      return res.status(400).json({
        success: false,
        message: "Project id and machinery id are required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingMachinery = await prisma.machinery.findFirst({
      where: {
        id: machineryId,
        projectId,
      },
      select: { id: true, status: true },
    });

    if (!existingMachinery) {
      return res.status(404).json({
        success: false,
        message: "Machinery not found for this project",
      });
    }

    if (existingMachinery.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved machinery cannot be deleted",
      });
    }

    await prisma.machinery.delete({
      where: { id: machineryId },
    });

    res.status(200).json({
      success: true,
      message: "Machinery deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.submitMachineriesToAdmin = async (req, res) => {
  try {
    if (!requireMachineryCreator(req, res)) return;

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

    const result = await prisma.machinery.updateMany({
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
    const machineries = await prisma.machinery.findMany({
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
        title: "Machinery submitted for approval",
        message: "New Machinery has been submitted for approval.",
        type: NOTIFICATION_TYPES.MACHINERY_SUBMITTED,
        recipientRole: "ADMIN",
        projectId,
        createdById: req.user?.id || null,
        link: `/admin-dashboard/project/${projectId}/workspace/machinery`,
      });
    }

    res.status(200).json({
      success: true,
      message:
        result.count > 0
          ? "Machinery sent to admin successfully"
          : "No new machinery to send",
      submittedCount: result.count,
      machineries: machineries.map(serializeMachinery),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.requestMachineryCorrection = async (req, res) => {
  try {
    if (!requireMachineryCreator(req, res)) return;

    const { projectId, machineryId } = req.params;
    const comment = req.body.comment?.trim();

    if (!projectId || !machineryId) {
      return res.status(400).json({
        success: false,
        message: "Project id and machinery id are required",
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

    const existingMachinery = await prisma.machinery.findFirst({
      where: {
        id: machineryId,
        projectId,
        status: "Approved",
      },
      select: { id: true },
    });

    if (!existingMachinery) {
      return res.status(404).json({
        success: false,
        message: "Approved machinery not found for this project",
      });
    }

    await prisma.machinery.update({
      where: { id: machineryId },
      data: {
        correctionComment: comment,
        correctionRequestedAt: new Date(),
        sentToAdmin: true,
        submittedAt: new Date(),
      },
    });

    const machinery = await getMachineryById(machineryId);

    await createNotification({
      title: "Machinery correction submitted",
      message: "New Machinery has been submitted for approval.",
      type: NOTIFICATION_TYPES.MACHINERY_SUBMITTED,
      recipientRole: "ADMIN",
      projectId,
      createdById: req.user?.id || null,
      link: `/admin-dashboard/project/${projectId}/workspace/machinery`,
    });

    res.status(200).json({
      success: true,
      message: "Correction comment sent to admin successfully",
      machinery: serializeMachinery(machinery),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
