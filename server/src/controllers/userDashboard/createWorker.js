const prisma = require("../../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

const DEFAULT_WORKER_ROLES = ["Welder", "Engineer", "Supervisor"];
const WORKER_CREATOR_ROLES = [
  "SITE_USER",
  "SITE_INCHARGE",
  "CORPORATE_MANAGER",
  "REGIONAL_MANAGER",
];

const isAdmin = (req) => req.user?.role === "ADMIN";
const canManageWorkers = (req) => WORKER_CREATOR_ROLES.includes(req.user?.role);

const requireWorkerCreator = (req, res) => {
  if (canManageWorkers(req)) return true;

  res.status(403).json({
    success: false,
    message: "You are not allowed to manage workers",
  });
  return false;
};

const requireAdmin = (req, res) => {
  if (isAdmin(req)) return true;

  res.status(403).json({
    success: false,
    message: "Only admin can approve or reject workers",
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

const getWorkerById = async (workerId) => {
  return prisma.worker.findUnique({
    where: { id: workerId },
    select: {
      id: true,
      fullName: true,
      workerId: true,
      phoneNumber: true,
      workerRole: true,
      status: true,
      rejectionRemark: true,
      sentToAdmin: true,
      submittedAt: true,
      correctionComment: true,
      correctionRequestedAt: true,
      projectId: true,
      createdById: true,
      createdAt: true,
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

const ensureDefaultWorkerRoles = async () => {
  await Promise.all(
    DEFAULT_WORKER_ROLES.map((name) =>
      prisma.workerRole.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
};

exports.getWorkerRoles = async (req, res) => {
  try {
    await ensureDefaultWorkerRoles();

    const roles = await prisma.workerRole.findMany({
      orderBy: {
        name: "asc",
      },
    });

    res.status(200).json({
      success: true,
      roles,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.createWorkerRole = async (req, res) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Role name is required",
      });
    }

    const existingRole = await prisma.workerRole.findFirst({
      where: {
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
    });

    if (existingRole) {
      return res.status(409).json({
        success: false,
        message: "Role already exists",
        role: existingRole,
      });
    }

    const role = await prisma.workerRole.create({
      data: { name },
    });

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      role,
    });
  } catch (error) {
    console.log(error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Role already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};



exports.createWorker = async (req, res) => {
  try {
    if (!requireWorkerCreator(req, res)) return;

    const { fullName, phoneNumber, workerRole } = req.body;

    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project id is required",
      });
    }

    if (!fullName || !workerRole) {
      return res.status(400).json({
        success: false,
        message: "Full name and worker role are required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }


    // Get Last Worker
    const lastWorker = await prisma.worker.findFirst({
      orderBy: {
        createdAt: "desc",
      },
    });

    // Generate Worker ID
    let nextNumber = 1;

    if (lastWorker?.workerId) {
      const splitId = lastWorker.workerId.split("-");

      const lastNumber = parseInt(splitId[2]);

      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    const workerId = `WRK-2026-${String(nextNumber).padStart(4, "0")}`;

    // Create Worker
    const createdWorker = await prisma.worker.create({
      data: {
        fullName: fullName.trim(),
        workerId,
        phoneNumber: phoneNumber?.trim() || null,
        workerRole: workerRole.trim(),
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
    const worker = await getWorkerById(createdWorker.id);

    res.status(201).json({
      success: true,
      message: "Worker created successfully",
      worker,
    });

  } catch (error) {
    console.log(error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Worker ID already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
exports.getWorkersByProject = async (req, res) => {
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

    const workers = await prisma.worker.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        fullName: true,
        workerId: true,
        phoneNumber: true,
        workerRole: true,
        status: true,
        rejectionRemark: true,
        sentToAdmin: true,
        submittedAt: true,
        correctionComment: true,
        correctionRequestedAt: true,
        projectId: true,
        createdById: true,
        createdAt: true,
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
      workers,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.updateWorker = async (req, res) => {
  try {
    if (!requireWorkerCreator(req, res)) return;

    const { projectId, workerId } = req.params;
    const { fullName, phoneNumber, workerRole } = req.body;

    if (!projectId || !workerId) {
      return res.status(400).json({
        success: false,
        message: "Project id and worker id are required",
      });
    }

    if (!fullName || !workerRole) {
      return res.status(400).json({
        success: false,
        message: "Full name and worker role are required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingWorker = await prisma.worker.findFirst({
      where: {
        id: workerId,
        projectId,
      },
    });

    if (!existingWorker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found for this project",
      });
    }

    if (existingWorker.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved workers cannot be edited",
      });
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber?.trim() || null,
        workerRole: workerRole.trim(),
        status: "Pending",
        rejectionRemark: null,
        sentToAdmin: existingWorker.sentToAdmin,
        submittedAt: existingWorker.sentToAdmin ? new Date() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });
    const worker = await getWorkerById(workerId);

    res.status(200).json({
      success: true,
      message: "Worker updated successfully",
      worker,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.updateWorkerStatus = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { projectId, workerId } = req.params;
    const { status, rejectionRemark } = req.body;
    const allowedStatuses = ["Pending", "Approved", "Rejected"];

    if (!projectId || !workerId) {
      return res.status(400).json({
        success: false,
        message: "Project id and worker id are required",
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

    const existingWorker = await prisma.worker.findFirst({
      where: {
        id: workerId,
        projectId,
        sentToAdmin: true,
      },
      select: { id: true },
    });

    if (!existingWorker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found for this project",
      });
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status,
        rejectionRemark:
          status === "Rejected" ? rejectionRemark.trim() : null,
        correctionComment: null,
        correctionRequestedAt: null,
      },
    });
    const worker = await getWorkerById(workerId);

    if (worker?.createdById && status !== "Pending") {
      await createNotification({
        title: `Workforce ${status.toLowerCase()}`,
        message:
          status === "Approved"
            ? "Your Workforce has been approved."
            : "Your Workforce has been rejected.",
        type:
          status === "Approved"
            ? NOTIFICATION_TYPES.WORKFORCE_APPROVED
            : NOTIFICATION_TYPES.WORKFORCE_REJECTED,
        recipientId: worker.createdById,
        projectId,
        createdById: req.user?.id || null,
        link: `/user-dashboard/operation/workforce`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Worker ${status.toLowerCase()} successfully`,
      worker,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.deleteWorker = async (req, res) => {
  try {
    if (!requireWorkerCreator(req, res)) return;

    const { projectId, workerId } = req.params;

    if (!projectId || !workerId) {
      return res.status(400).json({
        success: false,
        message: "Project id and worker id are required",
      });
    }

    const project = await getAuthorizedProject(req, projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const existingWorker = await prisma.worker.findFirst({
      where: {
        id: workerId,
        projectId,
      },
      select: { id: true, status: true },
    });

    if (!existingWorker) {
      return res.status(404).json({
        success: false,
        message: "Worker not found for this project",
      });
    }

    if (existingWorker.status === "Approved") {
      return res.status(403).json({
        success: false,
        message: "Approved workers cannot be deleted",
      });
    }

    await prisma.worker.delete({
      where: { id: workerId },
    });

    res.status(200).json({
      success: true,
      message: "Worker deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.submitWorkersToAdmin = async (req, res) => {
  try {
    if (!requireWorkerCreator(req, res)) return;

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

    const result = await prisma.worker.updateMany({
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

    if (result.count > 0) {
      await createNotification({
        title: "Workforce submitted for approval",
        message: "New Workforce has been submitted for approval.",
        type: NOTIFICATION_TYPES.WORKFORCE_SUBMITTED,
        recipientRole: "ADMIN",
        projectId,
        createdById: req.user?.id || null,
        link: `/admin-dashboard/project/${projectId}/workspace/workforce`,
      });
    }

    res.status(200).json({
      success: true,
      message:
        result.count > 0
          ? "Workers sent to admin successfully"
          : "No new workers to send",
      submittedCount: result.count,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.requestWorkerCorrection = async (req, res) => {
  try {
    if (!requireWorkerCreator(req, res)) return;

    const { projectId, workerId } = req.params;
    const comment = req.body.comment?.trim();

    if (!projectId || !workerId) {
      return res.status(400).json({
        success: false,
        message: "Project id and worker id are required",
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

    const existingWorker = await prisma.worker.findFirst({
      where: {
        id: workerId,
        projectId,
        status: "Approved",
      },
      select: { id: true },
    });

    if (!existingWorker) {
      return res.status(404).json({
        success: false,
        message: "Approved worker not found for this project",
      });
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        correctionComment: comment,
        correctionRequestedAt: new Date(),
        sentToAdmin: true,
        submittedAt: new Date(),
      },
    });

    const worker = await getWorkerById(workerId);

    await createNotification({
      title: "Workforce correction submitted",
      message: "New Workforce has been submitted for approval.",
      type: NOTIFICATION_TYPES.WORKFORCE_SUBMITTED,
      recipientRole: "ADMIN",
      projectId,
      createdById: req.user?.id || null,
      link: `/admin-dashboard/project/${projectId}/workspace/workforce`,
    });

    res.status(200).json({
      success: true,
      message: "Correction comment sent to admin successfully",
      worker,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
