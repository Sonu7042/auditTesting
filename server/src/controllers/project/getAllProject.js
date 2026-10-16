const prisma = require("../../config/prisma");

exports.getAllProjects = async (req, res) => {
  try {
    let where = {};

    if (req.user?.role === "AUDITOR") {
      where = {
        audits: {
          some: {
            auditors: {
              some: {
                userId: req.user.id,
              },
            },
          },
        },
      };
    } else if (req.user?.role !== "ADMIN") {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          companyId: true,
        },
      });

      if (!user?.companyId) {
        where = { id: "__none__" };
      } else if (
        req.user?.role === "CORPORATE_MANAGER" ||
        req.user?.role === "REGIONAL_MANAGER"
      ) {
        where = { companyId: user.companyId };
      } else if (req.user?.role === "SITE_INCHARGE") {
        where = {
          companyId: user.companyId,
          siteInchargeId: req.user.id,
        };
      } else if (req.user?.role === "SITE_USER") {
        where = {
          companyId: user.companyId,
          siteUserId: req.user.id,
        };
      } else {
        where = { id: "__none__" };
      }
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        company: true,
        workers: {
          select: {
            id: true,
            status: true,
            sentToAdmin: true,
          },
        },
        machineries: {
          select: {
            id: true,
            status: true,
            sentToAdmin: true,
          },
        },
        chemicals: {
          select: {
            id: true,
            status: true,
            sentToAdmin: true,
          },
        },
        projectChecklistSections: {
          select: {
            id: true,
            checklistType: true,
            questions: {
              select: {
                id: true,
                documentStatus: true,
                documentSentToAdmin: true,
              },
            },
          },
        },
        audits: {
          include: {
            checklistTemplate: {
              select: {
                id: true,
                name: true,
                auditType: true,
              },
            },
            schedules: {
              select: {
                id: true,
              },
            },
            auditors: {
              select: {
                id: true,
                auditId: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    username: true,
                    role: true,
                    status: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      projects,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
    });
  }
};

exports.AuditorsAccordingAuditType = async (req, res) => {
  try {
    const { type } = req.params;
    const auditTypes = await prisma.auditType.findUnique({
      where: {
        name: type,
      },
    });

    const userAuditTypes = await prisma.userAuditType.findMany({
      where: {
        auditTypeId: auditTypes.id,
      },
      include: {
        user:{
          select:{
            id:true,
            fullName:true,
            email:true,
            username:true,
            role:true,
            status:true,
            createdAt:true,
            companyId:true
          }
        }
      },
    });
    res.json({
      success: true,
      userAuditTypes,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


