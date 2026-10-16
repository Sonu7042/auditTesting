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

const getAuditChemicalVerification = async (req, res) => {
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

    const verification = await prisma.auditChemicalVerification.findUnique({
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
      message: error.message || "Unable to load chemical verification.",
    });
  }
};

const saveAuditChemicalVerification = async (req, res) => {
  try {
    const { projectId, auditId, checkedChemicals = [] } = req.body;
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

    if (!Array.isArray(checkedChemicals) || checkedChemicals.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Check at least one chemical before saving.",
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

    const chemicalIds = checkedChemicals.map((item) => item.id).filter(Boolean);
    const approvedChemicals = await prisma.chemical.findMany({
      where: {
        id: { in: chemicalIds },
        projectId,
        status: "Approved",
      },
      select: {
        id: true,
        chemicalName: true,
        chemicalId: true,
        safetyDataSheetName: true,
        safetyDataSheetUrl: true,
        safetyDataSheetType: true,
        chemicalImageName: true,
        chemicalImageUrl: true,
        chemicalImageType: true,
        status: true,
      },
    });

    if (approvedChemicals.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No approved chemical was found to save.",
      });
    }

    const verification = await prisma.auditChemicalVerification.upsert({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId,
        },
      },
      update: {
        checkedChemicals: approvedChemicals,
        checkedChemicalCount: approvedChemicals.length,
      },
      create: {
        projectId,
        auditId,
        auditorId,
        checkedChemicals: approvedChemicals,
        checkedChemicalCount: approvedChemicals.length,
      },
    });

    res.json({
      success: true,
      message: "Chemical verification saved successfully.",
      data: verification,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to save chemical verification.",
    });
  }
};

module.exports = {
  getAuditChemicalVerification,
  saveAuditChemicalVerification,
};
