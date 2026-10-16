const prisma = require("../config/prisma");

const COMPLETED_REPORT_STATUSES = ["Completed", "Closed"];

const getCompletedReport = (auditId, auditorId) =>
  prisma.auditReport.findFirst({
    where: {
      auditId,
      auditorId,
      status: { in: COMPLETED_REPORT_STATUSES },
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
    },
  });

const assertAuditEditable = async (auditId, auditorId) => {
  if (!auditId || !auditorId) {
    const error = new Error("Audit and auditor are required.");
    error.statusCode = 400;
    throw error;
  }

  const completedReport = await getCompletedReport(auditId, auditorId);

  if (completedReport) {
    const error = new Error(
      "This audit report is completed and all audit content is read-only.",
    );
    error.statusCode = 423;
    throw error;
  }
};

// Non-compliances (checklist, workforce, machinery, chemical) should only
// reach the user/admin NC trackers once the auditor has completed their
// audit report for that cycle - until then they're a live working draft.
// Returns null when no gating should apply (the auditor viewing their own
// in-progress drafts), otherwise a Set of "auditId:auditorId" keys that have
// a completed report, to be checked against each NC record's own
// (auditId, auditorId) pair.
const getCompletedReportKeys = async (user) => {
  if (user?.role === "AUDITOR") return null;

  const reportWhere = { status: { in: COMPLETED_REPORT_STATUSES } };

  if (user?.role !== "ADMIN") {
    const dbUser = await prisma.user.findUnique({
      where: { id: user?.id },
      select: { companyId: true },
    });

    if (!dbUser?.companyId) return new Set();

    const projectWhere = { companyId: dbUser.companyId };

    if (user?.role === "SITE_INCHARGE") {
      projectWhere.siteInchargeId = user.id;
    }

    if (user?.role === "SITE_USER") {
      projectWhere.siteUserId = user.id;
    }

    reportWhere.project = projectWhere;
  }

  const completedReports = await prisma.auditReport.findMany({
    where: reportWhere,
    select: { auditId: true, auditorId: true },
  });

  return new Set(
    completedReports.map((report) => `${report.auditId}:${report.auditorId}`),
  );
};

const getPreviousNcReviewSummary = async (auditId, auditorId) => {
  const [total, reviewed] = await Promise.all([
    prisma.previousNcReview.count({
      where: { currentAuditId: auditId, auditorId },
    }),
    prisma.previousNcReview.count({
      where: {
        currentAuditId: auditId,
        auditorId,
        reviewedAt: { not: null },
      },
    }),
  ]);

  return {
    total,
    reviewed,
    pending: Math.max(total - reviewed, 0),
    isComplete: total === reviewed,
  };
};

module.exports = {
  COMPLETED_REPORT_STATUSES,
  assertAuditEditable,
  getCompletedReport,
  getCompletedReportKeys,
  getPreviousNcReviewSummary,
};
