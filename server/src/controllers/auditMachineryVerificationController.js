const prisma = require("../config/prisma");
const { assertAuditEditable } = require("../utils/auditLifecycle");

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

const getAuditMachineryVerification = async (req, res) => {
  try {
    const { projectId, auditId } = req.query;

    if (!projectId || !auditId) {
      return res.status(400).json({
        success: false,
        message: "Project id and audit id are required.",
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

    const verification = await prisma.auditMachineryVerification.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
    });

    res.json({
      success: true,
      data: verification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Unable to load machinery verification.",
    });
  }
};

const saveAuditMachineryVerification = async (req, res) => {
  try {
    const { projectId, auditId, checkedMachineries = [] } = req.body;
    const auditorId = req.user?.id;

    if (!projectId || !auditId) {
      return res.status(400).json({
        success: false,
        message: "Project id and audit id are required.",
      });
    }

    if (!auditorId) {
      return res.status(401).json({
        success: false,
        message: "Auditor login is required.",
      });
    }

    if (!Array.isArray(checkedMachineries) || checkedMachineries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Check at least one machinery before saving.",
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

    await assertAuditEditable(auditId, auditorId);

    const machineryIds = checkedMachineries.map((item) => item.id).filter(Boolean);
    const approvedMachineries = await prisma.machinery.findMany({
      where: {
        id: { in: machineryIds },
        projectId,
        status: "Approved",
      },
      select: {
        id: true,
        machineryName: true,
        machineryId: true,
        inspectionDocumentName: true,
        inspectionDocumentUrl: true,
        inspectionDocumentType: true,
        machineryImageName: true,
        machineryImageUrl: true,
        machineryImageType: true,
        status: true,
      },
    });

    if (approvedMachineries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No approved machinery was found to save.",
      });
    }

    const verification = await prisma.auditMachineryVerification.upsert({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId,
        },
      },
      update: {
        checkedMachineries: approvedMachineries,
        checkedMachineryCount: approvedMachineries.length,
      },
      create: {
        projectId,
        auditId,
        auditorId,
        checkedMachineries: approvedMachineries,
        checkedMachineryCount: approvedMachineries.length,
      },
    });

    res.json({
      success: true,
      message: "Machinery verification saved successfully.",
      data: verification,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save machinery verification.",
    });
  }
};

module.exports = {
  getAuditMachineryVerification,
  saveAuditMachineryVerification,
};
