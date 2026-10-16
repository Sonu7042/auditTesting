const prisma = require("../../config/prisma");
const { sendEmail } = require("../../utils/sendEmail");
const { ensureProjectChecklist } = require("../../utils/projectChecklist");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

const PROJECT_STATUSES = [
  "Draft",
  "Setup",
  "Audit Ready",
  "Completed",
  "Locked",
];

const getDashboardUrl = (dashboardPath) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL;

  if (!clientUrl) return null;

  return `${clientUrl.replace(/\/+$/, "")}/${dashboardPath.replace(/^\/+/, "")}`;
};

const getProjectAccessEmail = (project, user, dashboardPath) => {
  const dashboardUrl = getDashboardUrl(dashboardPath);
  const loginInstruction = dashboardUrl
    ? `\nDashboard: ${dashboardUrl}`
    : "";

  return `Hello ${user.fullName},

You have been assigned to the project "${project.projectName}" in the Audit Portal.

Username: ${user.username}
Password: ${user.password}${loginInstruction}

Please keep these credentials secure and do not share them with anyone.

Regards,
Audit Portal`;
};

const getDealerAuditReadyEmail = (project) => {
  const auditors = [
    ...new Map(
      project.audits
        .flatMap((audit) => audit.auditors)
        .filter((assignment) => assignment.user)
        .map((assignment) => [assignment.user.id, assignment.user]),
    ).values(),
  ];
  const auditorDetails = auditors.length
    ? auditors
        .map(
          (auditor, index) =>
            `${index + 1}. ${auditor.fullName}${auditor.email ? ` (${auditor.email})` : ""}`,
        )
        .join("\n")
    : "Auditor details are not available.";
  const auditTypes = [...new Set(project.audits.map((audit) => audit.auditType))]
    .filter(Boolean)
    .join(", ");

  return `Hello ${project.dealerName || "Dealer"},

The following project is ready for audit.

Project: ${project.projectName}
Site address: ${project.siteAddress}
PO number: ${project.poNumber || "Not provided"}
PO issue date: ${project.issueDate ? new Date(project.issueDate).toLocaleDateString("en-IN") : "Not provided"}
Audit type(s): ${auditTypes || "Not provided"}

Assigned auditor(s):
${auditorDetails}

Regards,
Audit Portal`;
};

const getDealerDetails = ({ dealerName, dealerPhone, dealerEmail }) => ({
  dealerName: dealerName?.trim() || null,
  dealerPhone: dealerPhone?.trim() || null,
  dealerEmail: dealerEmail?.trim().toLowerCase() || null,
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidDealerPhone = (phone) => /^[6-9]\d{9}$/.test(phone);

const validateSingleSiteAssignment = async ({
  companyId,
  siteInchargeId,
  siteUserId,
  excludeProjectId,
}) => {
  if (siteInchargeId) {
    const existingSiteInchargeProject = await prisma.project.findFirst({
      where: {
        companyId,
        siteInchargeId,
        ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
      },
      select: {
        projectName: true,
      },
    });

    if (existingSiteInchargeProject) {
      return `Selected site incharge is already assigned to project "${existingSiteInchargeProject.projectName}".`;
    }
  }

  if (siteUserId) {
    const existingSiteUserProject = await prisma.project.findFirst({
      where: {
        companyId,
        siteUserId,
        ...(excludeProjectId ? { id: { not: excludeProjectId } } : {}),
      },
      select: {
        projectName: true,
      },
    });

    if (existingSiteUserProject) {
      return `Selected site user is already assigned to project "${existingSiteUserProject.projectName}".`;
    }
  }

  return null;
};

exports.createProject = async (req, res) => {
  try {
    const {
      companyId,
      projectName,
      siteAddress,
      poNumber,
      issueDate,
      corporateManagerId,
      regionalManagerId,
      siteInchargeId,
      siteUserId,
      dealerName,
      dealerPhone,
      dealerEmail,
      audits,
    } = req.body;

    const dealerDetails = getDealerDetails({ dealerName, dealerPhone, dealerEmail });
    if (!dealerDetails.dealerName || !dealerDetails.dealerPhone || !dealerDetails.dealerEmail) {
      return res.status(400).json({ success: false, message: "Dealer name, phone number, and email are required" });
    }
    if (!isValidDealerPhone(dealerDetails.dealerPhone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit dealer mobile number starting with 6, 7, 8, or 9" });
    }
    if (!isValidEmail(dealerDetails.dealerEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid dealer email" });
    }

    const assignmentError = await validateSingleSiteAssignment({
      companyId,
      siteInchargeId,
      siteUserId,
    });

    if (assignmentError) {
      return res.status(400).json({
        success: false,
        message: assignmentError,
      });
    }

    const project = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          companyId,
          projectName,
          siteAddress,
          poNumber,
          issueDate: issueDate ? new Date(issueDate) : null,
          corporateManagerId: corporateManagerId || null,
          regionalManagerId: regionalManagerId || null,
          siteInchargeId: siteInchargeId || null,
          siteUserId: siteUserId || null,
          ...dealerDetails,

          audits: {
            create: audits.map((audit) => ({
              auditType: audit.auditType,
              checklistType: audit.checklistType,
              frequency: audit.frequency,
              numberOfAudits: Number(audit.numberOfAudits),

              auditors: {
                create: audit.auditors.map((userId) => ({
                  userId,
                })),
              },
            })),
          },
        },
        include: {
          audits: {
            include: {
              auditors: true,
            },
          },
        },
      });

      for (const audit of createdProject.audits) {
        await ensureProjectChecklist(
          tx,
          createdProject.id,
          audit.checklistType,
          audit.checklistType,
        );
      }

      return createdProject;
    });

    res.status(201).json({
      success: true,
      project,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Project creation failed",
    });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    const {
      companyId,
      projectName,
      siteAddress,
      poNumber,
      issueDate,
      corporateManagerId,
      regionalManagerId,
      siteInchargeId,
      siteUserId,
      dealerName,
      dealerPhone,
      dealerEmail,
      audits,
    } = req.body;

    const dealerDetails = getDealerDetails({ dealerName, dealerPhone, dealerEmail });
    if (!dealerDetails.dealerName || !dealerDetails.dealerPhone || !dealerDetails.dealerEmail) {
      return res.status(400).json({ success: false, message: "Dealer name, phone number, and email are required" });
    }
    if (!isValidDealerPhone(dealerDetails.dealerPhone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid 10-digit dealer mobile number starting with 6, 7, 8, or 9" });
    }
    if (!isValidEmail(dealerDetails.dealerEmail)) {
      return res.status(400).json({ success: false, message: "Please enter a valid dealer email" });
    }

    console.log(req.body, projectId, "updated");

    const assignmentError = await validateSingleSiteAssignment({
      companyId,
      siteInchargeId,
      siteUserId,
      excludeProjectId: projectId,
    });

    if (assignmentError) {
      return res.status(400).json({
        success: false,
        message: assignmentError,
      });
    }

    const updatedProject = await prisma.$transaction(async (tx) => {
      await tx.audit.deleteMany({
        where: { projectId },
      });

      const project = await tx.project.update({
        where: { id: projectId },

        data: {
          companyId,
          projectName,
          siteAddress,
          poNumber,
          issueDate: issueDate ? new Date(issueDate) : null,
          corporateManagerId: corporateManagerId || null,
          regionalManagerId: regionalManagerId || null,
          siteInchargeId: siteInchargeId || null,
          siteUserId: siteUserId || null,
          ...dealerDetails,

          audits: {
            create: audits.map((audit) => ({
              auditType: audit.auditType,
              checklistType: audit.checklistType,
              frequency: audit.frequency,
              numberOfAudits: Number(audit.numberOfAudits),

              auditors: {
                create: audit.auditors.map((userId) => ({
                  userId,
                })),
              },
            })),
          },
        },

        include: {
          audits: {
            include: {
              auditors: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      for (const audit of project.audits) {
        await ensureProjectChecklist(
          tx,
          projectId,
          audit.checklistType,
          audit.checklistType,
        );
      }

      return project;
    });

    res.status(200).json({
      success: true,
      project: updatedProject,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Project update failed",
    });
  }
};




exports.updateStatus = async (req, res) => {
  const projectId = req.params.projectId;
  const { status } = req.body;

  try {
    const requestedStatusIndex = PROJECT_STATUSES.indexOf(status);

    if (requestedStatusIndex === -1) {
      return res.status(400).json({ error: "Invalid project status" });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        corporateManager: true,
        regionalManager: true,
        siteIncharge: true,
        siteUser: true,
        audits: {
          include: {
            auditors: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (existingProject.status === status) {
      return res.json(existingProject);
    }

    const currentStatusIndex = PROJECT_STATUSES.indexOf(existingProject.status);

    if (
      currentStatusIndex !== -1 &&
      requestedStatusIndex < currentStatusIndex
    ) {
      return res.status(409).json({
        error: `Project status cannot move back from "${existingProject.status}" to "${status}"`,
      });
    }

    // =====================================================
    // 🔥 Setup → (optional same as before)
    // =====================================================
    if (status === "Setup") {
      const users = [
        existingProject.corporateManager,
        existingProject.regionalManager,
        existingProject.siteIncharge,
        existingProject.siteUser,
      ].filter(Boolean);

      const uniqueUsers = [
        ...new Map(users.map((u) => [u.id, u])).values(),
      ];

      for (const user of uniqueUsers) {
        if (!user.email) continue;

        await sendEmail(
          [user.email],
          `Audit Portal access for ${existingProject.projectName}`,
          getProjectAccessEmail(existingProject, user, "/user-dashboard"),
          { throwOnError: true }
        );
      }
    }

    // =====================================================
    // 🔥 Audit Ready → ONLY NEW AUDITORS (100% CORRECT)
    // =====================================================
    if (status === "Audit Ready") {
      if (!existingProject.dealerEmail) {
        return res.status(400).json({
          error: "Add dealer details by editing the project before marking it Audit Ready",
        });
      }
      await sendEmail(
        [existingProject.dealerEmail],
        `Project ready for audit: ${existingProject.projectName}`,
        getDealerAuditReadyEmail(existingProject),
        { throwOnError: true },
      );

      // 👉 ONLY THOSE WHO ARE NOT NOTIFIED
      const newAuditorAssignments = existingProject.audits
        .flatMap((a) => a.auditors)
        .filter((aud) => !aud.isNotified);

      const assignmentsByAuditor = newAuditorAssignments.reduce(
        (auditors, assignment) => {
          if (!assignment.user) return auditors;

          const auditor = auditors.get(assignment.user.id) || {
            user: assignment.user,
            assignmentIds: [],
          };

          auditor.assignmentIds.push(assignment.id);
          auditors.set(assignment.user.id, auditor);
          return auditors;
        },
        new Map()
      );

      for (const { user, assignmentIds } of assignmentsByAuditor.values()) {
        if (user.email) {
          await sendEmail(
            [user.email],
            `Audit ready: ${existingProject.projectName}`,
            getProjectAccessEmail(existingProject, user, "/auditor-dashboard"),
            { throwOnError: true }
          );
        }

        await createNotification({
          title: "Project ready for audit",
          message: `You have been assigned to ${existingProject.projectName}.`,
          type: NOTIFICATION_TYPES.AUDITOR_ASSIGNED,
          recipientId: user.id,
          projectId,
          link: `/auditor-dashboard/projectSelection`,
        });

        // 🔥 MARK AS NOTIFIED
        await prisma.auditAuditor.updateMany({
          where: { id: { in: assignmentIds } },
          data: { isNotified: true },
        });
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: { status },
    });

    res.json(updatedProject);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Error updating status" });
  }
};
