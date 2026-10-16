const prisma = require("../config/prisma");
const { buildAuditReportDocx } = require("../utils/auditReportDocx");
const { buildAuditReportWorkbook } = require("../utils/auditReportWorkbook");
const { buildOpenNcReportDocx } = require("../utils/openNcReportDocx");
const { getOpenNcReportData, OPEN_NC_FILTER } = require("../utils/openNcReportData");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const {
  COMPLETED_REPORT_STATUSES,
  getPreviousNcReviewSummary,
} = require("../utils/auditLifecycle");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");

const AUDIT_DURATION_MS = 24 * 60 * 60 * 1000;

const decodeSignature = (dataUrl) => {
  const match = /^data:(image\/[^;]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!match) return null;
  return { mimetype: match[1], buffer: Buffer.from(match[2], "base64") };
};

const getReportInclude = {
  project: {
    include: {
      company: {
        include: {
          users: {
            where: {
              role: "SITE_INCHARGE",
              status: true,
            },
            select: {
              fullName: true,
              username: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
      corporateManager: {
        select: { fullName: true },
      },
      regionalManager: {
        select: { fullName: true },
      },
      siteIncharge: {
        select: { fullName: true, username: true },
      },
      siteUser: {
        select: { fullName: true },
      },
    },
  },
  audit: {
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
          date: true,
        },
      },
      previousAudit: {
        select: {
          id: true,
          cycleNumber: true,
        },
      },
      auditTimers: {
        select: {
          id: true,
          projectId: true,
          auditId: true,
          auditorId: true,
          startedAt: true,
          stoppedAt: true,
        },
      },
    },
  },
  auditor: {
    select: {
      id: true,
      fullName: true,
      email: true,
      username: true,
    },
  },
};

const normalizeVisitedSections = (visitedSections) => {
  if (!Array.isArray(visitedSections)) return [];

  return visitedSections;
};

const isTimerExpired = (timer) => {
  if (!timer?.startedAt) return false;

  return new Date(timer.startedAt).getTime() <= Date.now() - AUDIT_DURATION_MS;
};

const getReportScope = async (user) => {
  if (user?.role === "ADMIN") return {};
  if (user?.role === "AUDITOR") return { auditorId: user.id };

  const dbUser = await prisma.user.findUnique({
    where: { id: user?.id },
    select: { companyId: true },
  });

  if (!dbUser?.companyId) return { id: "__none__" };

  const project = { companyId: dbUser.companyId };
  if (user.role === "SITE_INCHARGE") project.siteInchargeId = user.id;
  if (user.role === "SITE_USER") project.siteUserId = user.id;

  return { project };
};

const getNonComplianceCount = async (report) => {
  const commonWhere = {
    projectId: report.projectId,
    auditorId: report.auditorId,
    ...(report.audit?.cycleNumber <= 1
      ? { OR: [{ auditId: report.auditId }, { auditId: null }] }
      : { auditId: report.auditId }),
  };
  const [checklist, workforce, machinery, chemical] = await Promise.all([
    prisma.auditQuestionResponse.count({
      where: {
        auditorId: report.auditorId,
        auditId: report.auditId,
        responseType: "NON_COMPLIANCE",
      },
    }),
    prisma.workforceNonCompliance.count({ where: commonWhere }),
    prisma.machineryNonCompliance.count({ where: commonWhere }),
    prisma.chemicalNonCompliance.count({ where: commonWhere }),
  ]);

  return checklist + workforce + machinery + chemical;
};

const getOpenNonComplianceCount = async (report) => {
  const where = {
    projectId: report.projectId,
    auditorId: report.auditorId,
    ...(report.audit?.cycleNumber <= 1
      ? { OR: [{ auditId: report.auditId }, { auditId: null }] }
      : { auditId: report.auditId }),
    ...OPEN_NC_FILTER,
  };
  const [checklist, documents, workforce, machinery, chemical] =
    await Promise.all([
      prisma.auditQuestionResponse.count({
        where: {
          auditId: report.auditId,
          auditorId: report.auditorId,
          responseType: "NON_COMPLIANCE",
          ...OPEN_NC_FILTER,
        },
      }),
      prisma.projectChecklistQuestion.count({
        where: {
          approvalStatus: "Approved",
          documentStatus: "Not Approved",
          section: {
            projectId: report.projectId,
            checklistType: report.audit.checklistType,
            approvalStatus: "Approved",
          },
        },
      }),
      prisma.workforceNonCompliance.count({ where }),
      prisma.machineryNonCompliance.count({ where }),
      prisma.chemicalNonCompliance.count({ where }),
    ]);
  return checklist + documents + workforce + machinery + chemical;
};

const getReportGenerationData = async (report) => {
  const moduleWhere = {
    projectId: report.projectId,
    auditorId: report.auditorId,
    ...(report.audit?.cycleNumber <= 1
      ? { OR: [{ auditId: report.auditId }, { auditId: null }] }
      : { auditId: report.auditId }),
  };
  const [
    responses,
    workforceNonCompliances,
    machineryNonCompliances,
    chemicalNonCompliances,
  ] = await Promise.all([
    prisma.auditQuestionResponse.findMany({
      where: {
        auditorId: report.auditorId,
        auditId: report.auditId,
      },
      include: {
        evidence: true,
        question: { include: { section: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workforceNonCompliance.findMany({
      where: moduleWhere,
      include: {
        evidence: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.machineryNonCompliance.findMany({
      where: moduleWhere,
      include: {
        evidence: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chemicalNonCompliance.findMany({
      where: moduleWhere,
      include: {
        evidence: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  report.audit.projectChecklistSections = await prisma.projectChecklistSection.findMany({
    where: {
      projectId: report.projectId,
      checklistType: report.audit.checklistType,
      approvalStatus: "Approved",
    },
    select: {
      title: true,
      mainMenu: true,
      mainMenuNumber: true,
      sectionNumber: true,
      questions: {
        where: {
          approvalStatus: "Approved",
        },
        select: {
          id: true,
        },
      },
    },
  });

  return {
    report,
    responses,
    workforceNonCompliances,
    machineryNonCompliances,
    chemicalNonCompliances,
  };
};

const getClosedReportForRequest = async (req, res) => {
  const scope = await getReportScope(req.user);
  const report = await prisma.auditReport.findFirst({
    where: { id: req.params.reportId, ...scope },
    include: getReportInclude,
  });

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return null;
  }

  if (!COMPLETED_REPORT_STATUSES.includes(report.status)) {
    res.status(409).json({
      error: "Complete the audit report before downloading it",
    });
    return null;
  }

  return report;
};

const getAuditReportFileName = (report, extension) =>
  `${report.project.projectName}-${report.audit.auditType}-cycle-${report.audit.cycleNumber || 1}-audit-report.${extension}`
    .replace(/[^a-z0-9_.-]+/gi, "-")
    .replace(/-+/g, "-");

const closeExpiredReportsForAuditor = async (auditorId) => {
  const expiredTimers = await prisma.auditTimer.findMany({
    where: {
      auditorId,
      stoppedAt: null,
      startedAt: {
        lte: new Date(Date.now() - AUDIT_DURATION_MS),
      },
    },
    select: {
      projectId: true,
      auditId: true,
    },
  });

  if (expiredTimers.length === 0) return;

  await Promise.all(
    expiredTimers.map((timer) =>
      prisma.auditReport.updateMany({
        where: {
          projectId: timer.projectId,
          auditId: timer.auditId,
          auditorId,
          status: "Open",
        },
        data: {
          status: "Completed",
          completedAt: new Date(),
        },
      }),
    ),
  );

  await Promise.all(
    expiredTimers.map((timer) =>
      prisma.auditTimer.update({
        where: {
          projectId_auditId_auditorId: {
            projectId: timer.projectId,
            auditId: timer.auditId,
            auditorId,
          },
        },
        data: {
          elapsedMs: 0,
          stoppedAt: new Date(),
        },
      }),
    ),
  );
};

exports.getAuditReports = async (req, res) => {
  try {
    await closeExpiredReportsForAuditor(req.user.id);
    const where = await getReportScope(req.user);

    const reports = await prisma.auditReport.findMany({
      where,
      include: getReportInclude,
      orderBy: {
        updatedAt: "desc",
      },
    });

    const data = await Promise.all(
      reports.map(async (report) => {
        const item = {
          ...report,
          nonComplianceCount: await getNonComplianceCount(report),
          openNonComplianceCount: await getOpenNonComplianceCount(report),
          previousNcReviewSummary: await getPreviousNcReviewSummary(
            report.auditId,
            report.auditorId,
          ),
        };
        if (!["ADMIN", "AUDITOR"].includes(req.user.role)) {
          delete item.auditorSignatureUrl;
        }
        return item;
      }),
    );

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error fetching audit reports" });
  }
};

const getAssignedAssessmentAudit = (projectId, auditId, auditorId) =>
  prisma.audit.findFirst({
    where: {
      id: auditId,
      projectId,
      auditors: {
        some: {
          userId: auditorId,
        },
      },
    },
    select: { id: true },
  });

exports.getAuditAssessmentProgress = async (req, res) => {
  try {
    const { projectId, auditId } = req.params;
    const assignedAudit = await getAssignedAssessmentAudit(
      projectId,
      auditId,
      req.user.id,
    );

    if (!assignedAudit) {
      return res.status(403).json({
        error: "This audit is not assigned to the current auditor.",
      });
    }

    const progress = await prisma.auditAssessmentProgress.findUnique({
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
      data: {
        visitedSections: normalizeVisitedSections(progress?.visitedSections),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unable to load assessment progress.",
    });
  }
};

exports.updateAuditAssessmentProgress = async (req, res) => {
  try {
    const { projectId, auditId } = req.params;
    const visitedSections = normalizeVisitedSections(req.body.visitedSections);
    const assignedAudit = await getAssignedAssessmentAudit(
      projectId,
      auditId,
      req.user.id,
    );

    if (!assignedAudit) {
      return res.status(403).json({
        error: "This audit is not assigned to the current auditor.",
      });
    }

    const completedReport = await prisma.auditReport.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
      select: { status: true },
    });

    if (
      completedReport &&
      COMPLETED_REPORT_STATUSES.includes(completedReport.status)
    ) {
      return res.status(403).json({
        error: "Completed assessments cannot be changed.",
      });
    }

    const progress = await prisma.auditAssessmentProgress.upsert({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
      create: {
        projectId,
        auditId,
        auditorId: req.user.id,
        visitedSections,
      },
      update: {
        visitedSections,
      },
    });

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unable to update assessment progress.",
    });
  }
};

exports.downloadAuditReport = async (req, res) => {
  try {
    const report = await getClosedReportForRequest(req, res);
    if (!report) return;

    const workbook = buildAuditReportWorkbook(
      await getReportGenerationData(report),
    );
    const fileName = getAuditReportFileName(report, "xlsx");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );
    return res.send(workbook);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Error generating audit report" });
  }
};

exports.downloadAuditReportWord = async (req, res) => {
  try {
    const report = await getClosedReportForRequest(req, res);
    if (!report) return;

    const docx = await buildAuditReportDocx(
      await getReportGenerationData(report),
    );
    const fileName = getAuditReportFileName(report, "docx");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`,
    );
    return res.send(docx);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Error generating Word audit report" });
  }
};

exports.downloadOpenNcReport = async (req, res) => {
  try {
    const report = await getClosedReportForRequest(req, res);
    if (!report) return;
    const data = await getOpenNcReportData(report);
    if (!data.totalOpenNcCount) {
      return res.status(400).json({ error: "This audit has no open non-compliances" });
    }
    if (!data.auditorSignatureUrl) {
      return res.status(409).json({ error: "The Visit Sheet has no auditor signature" });
    }

    const docx = await buildOpenNcReportDocx(data);
    const fileName = getAuditReportFileName(report, "docx").replace(
      "audit-report",
      "open-nc-report",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(docx);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Error generating Open NC report" });
  }
};

exports.saveAuditReport = async (req, res) => {
  const {
    projectId,
    auditId,
    technicalDescription,
    observations,
    subcontractors,
    visitedSections,
    status,
  } = req.body;

  if (!projectId || !auditId) {
    return res.status(400).json({ error: "Project and audit are required" });
  }

  if (!technicalDescription?.trim() || !observations?.trim()) {
    return res.status(400).json({ error: "Report details are required" });
  }

  try {
    await closeExpiredReportsForAuditor(req.user.id);

    const existingReport = await prisma.auditReport.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
    });

    if (
      existingReport &&
      COMPLETED_REPORT_STATUSES.includes(existingReport.status)
    ) {
      return res.status(403).json({
        error: "Completed reports are view-only and cannot be changed",
      });
    }

    const timer = await prisma.auditTimer.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
    });
    const nextStatus = isTimerExpired(timer) ? "Completed" : status || "Open";

    const assignedAudit = await prisma.audit.findFirst({
      where: {
        id: auditId,
        projectId,
        auditors: {
          some: {
            userId: req.user.id,
          },
        },
      },
      select: { id: true },
    });

    if (!assignedAudit) {
      return res.status(403).json({
        error: "This audit is not assigned to the current auditor.",
      });
    }

    const report = await prisma.auditReport.upsert({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
      create: {
        projectId,
        auditId,
        auditorId: req.user.id,
        technicalDescription: technicalDescription.trim(),
        observations: observations.trim(),
        subcontractors: subcontractors?.trim() || null,
        visitedSections: normalizeVisitedSections(visitedSections),
        status: nextStatus,
        completedAt: nextStatus === "Completed" ? new Date() : null,
      },
      update: {
        technicalDescription: technicalDescription.trim(),
        observations: observations.trim(),
        subcontractors: subcontractors?.trim() || null,
        visitedSections: normalizeVisitedSections(visitedSections),
        status: nextStatus,
        completedAt: nextStatus === "Completed" ? new Date() : null,
      },
      include: getReportInclude,
    });

    if (nextStatus === "Completed" && timer) {
      await prisma.auditTimer.update({
        where: {
          projectId_auditId_auditorId: {
            projectId,
            auditId,
            auditorId: req.user.id,
          },
        },
        data: {
          elapsedMs: 0,
          stoppedAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      message: "Report saved successfully",
      data: report,
    });
  } catch (error) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      error: error.message || "Error saving audit report",
    });
  }
};

exports.saveAuditorSignature = async (req, res) => {
  const { projectId, auditId, signature } = req.body;
  const image = decodeSignature(signature);
  if (!projectId || !auditId || !image) {
    return res.status(400).json({ error: "Project, audit and signature are required" });
  }

  try {
    const existing = await prisma.auditReport.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
    });
    if (!existing) {
      return res.status(409).json({ error: "Save the report details before signing" });
    }
    if (COMPLETED_REPORT_STATUSES.includes(existing.status)) {
      return res.status(403).json({ error: "Completed reports cannot be changed" });
    }

    let auditorSignatureUrl = signature;
    try {
      const uploaded = await uploadToCloudinary(
        {
          buffer: image.buffer,
          mimetype: image.mimetype,
          originalname: "auditor-signature.png",
        },
        "audit-portal/signatures",
      );
      auditorSignatureUrl = uploaded.secure_url;
    } catch {
      // A data URL keeps the signature available if external storage is offline.
    }

    const report = await prisma.auditReport.update({
      where: { id: existing.id },
      data: { auditorSignatureUrl },
      include: getReportInclude,
    });
    return res.json({ success: true, message: "Signature saved", data: report });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Error saving signature" });
  }
};

exports.clearAuditorSignature = async (req, res) => {
  const { projectId, auditId } = req.body;
  try {
    const existing = await prisma.auditReport.findUnique({
      where: {
        projectId_auditId_auditorId: {
          projectId,
          auditId,
          auditorId: req.user.id,
        },
      },
    });
    if (!existing) return res.status(404).json({ error: "Report not found" });
    if (COMPLETED_REPORT_STATUSES.includes(existing.status)) {
      return res.status(403).json({ error: "Completed reports cannot be changed" });
    }
    const report = await prisma.auditReport.update({
      where: { id: existing.id },
      data: { auditorSignatureUrl: null },
      include: getReportInclude,
    });
    return res.json({ success: true, data: report });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Error clearing signature" });
  }
};

exports.completeAuditReport = async (req, res) => {
  try {
    const existingReport = await prisma.auditReport.findFirst({
      where: {
        id: req.params.reportId,
        auditorId: req.user.id,
      },
    });

    if (!existingReport) {
      return res.status(404).json({ error: "Report not found" });
    }

    if (COMPLETED_REPORT_STATUSES.includes(existingReport.status)) {
      return res.status(409).json({ error: "Report is already completed" });
    }

    if (!existingReport.auditorSignatureUrl) {
      return res.status(409).json({
        error: "Save the auditor signature on the Visit Sheet before completing the report",
      });
    }

    const [report] = await prisma.$transaction([
      prisma.auditReport.update({
        where: {
          id: existingReport.id,
        },
        data: {
          status: "Completed",
          completedAt: new Date(),
        },
        include: getReportInclude,
      }),
      prisma.auditTimer.upsert({
        where: {
          projectId_auditId_auditorId: {
            projectId: existingReport.projectId,
            auditId: existingReport.auditId,
            auditorId: req.user.id,
          },
        },
        create: {
          projectId: existingReport.projectId,
          auditId: existingReport.auditId,
          auditorId: req.user.id,
          elapsedMs: 0,
          stoppedAt: new Date(),
        },
        update: {
          elapsedMs: 0,
          stoppedAt: new Date(),
        },
      }),
    ]);

    const project = await prisma.project.findUnique({
      where: { id: existingReport.projectId },
      select: { projectName: true, siteUserId: true, siteInchargeId: true },
    });
    const userRecipientIds = [
      ...new Set(
        [project?.siteUserId, project?.siteInchargeId].filter(Boolean),
      ),
    ];

    await createNotification({
      title: "Audit report completed",
      message: "Audit report has been completed.",
      type: NOTIFICATION_TYPES.AUDIT_REPORT_COMPLETED,
      recipientRole: "ADMIN",
      projectId: existingReport.projectId,
      auditId: existingReport.auditId,
      createdById: req.user.id,
      link: `/admin-dashboard/project/${existingReport.projectId}`,
    });

    for (const recipientId of userRecipientIds) {
      await createNotification({
        title: "Audit report completed",
        message: "Audit report has been completed. Please review the audit findings.",
        type: NOTIFICATION_TYPES.AUDIT_REPORT_COMPLETED,
        recipientId,
        projectId: existingReport.projectId,
        auditId: existingReport.auditId,
        createdById: req.user.id,
        link: `/user-dashboard/ncTracker`,
      });
    }

    const openNcWhere = {
      projectId: existingReport.projectId,
      auditId: existingReport.auditId,
      auditorId: req.user.id,
      evidence: { none: { evidenceType: "action" } },
    };

    const [checklistNcCount, workforceNcCount, machineryNcCount, chemicalNcCount] =
      await Promise.all([
        prisma.auditQuestionResponse.count({
          where: {
            auditId: existingReport.auditId,
            auditorId: req.user.id,
            responseType: "NON_COMPLIANCE",
            evidence: { none: { evidenceType: "action" } },
          },
        }),
        prisma.workforceNonCompliance.count({ where: openNcWhere }),
        prisma.machineryNonCompliance.count({ where: openNcWhere }),
        prisma.chemicalNonCompliance.count({ where: openNcWhere }),
      ]);

    const openNcCount =
      checklistNcCount + workforceNcCount + machineryNcCount + chemicalNcCount;

    if (openNcCount > 0) {
      const ncMessage = `${openNcCount} new non-compliance${openNcCount === 1 ? "" : "s"} published.`;

      await createNotification({
        title: "Non-compliances published",
        message: ncMessage,
        type: NOTIFICATION_TYPES.NC_PUBLISHED,
        recipientRole: "ADMIN",
        projectId: existingReport.projectId,
        auditId: existingReport.auditId,
        createdById: req.user.id,
        link: `/admin-dashboard/ncTracker`,
      });

      for (const recipientId of userRecipientIds) {
        await createNotification({
          title: "Non-compliances published",
          message: ncMessage,
          type: NOTIFICATION_TYPES.NC_PUBLISHED,
          recipientId,
          projectId: existingReport.projectId,
          auditId: existingReport.auditId,
          createdById: req.user.id,
          link: `/user-dashboard/ncTracker`,
        });
      }
    }

    res.json({
      success: true,
      message: "Report completed successfully",
      data: report,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error completing audit report" });
  }
};
