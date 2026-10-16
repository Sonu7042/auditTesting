const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");

const AUDIT_DURATION_MS = 24 * 60 * 60 * 1000;

const getElapsedMs = (timer) => {
  if (timer?.stoppedAt) return 0;
  if (!timer?.startedAt) return timer?.elapsedMs || 0;

  return Math.min(Date.now() - new Date(timer.startedAt).getTime(), AUDIT_DURATION_MS);
};

const closeReportIfTimerExpired = async ({ projectId, auditId, auditorId }) => {
  const timer = await prisma.auditTimer.findUnique({
    where: {
      projectId_auditId_auditorId: {
        projectId,
        auditId,
        auditorId,
      },
    },
  });

  if (!timer || getElapsedMs(timer) < AUDIT_DURATION_MS) return timer;

  await prisma.auditReport.updateMany({
    where: {
      projectId,
      auditId,
      auditorId,
      status: "Open",
    },
    data: {
      status: "Completed",
      completedAt: new Date(),
    },
  });

  return prisma.auditTimer.update({
    where: {
      projectId_auditId_auditorId: {
        projectId,
        auditId,
        auditorId,
      },
    },
    data: {
      elapsedMs: 0,
      stoppedAt: new Date(),
    },
  });
};

const serializeTimer = (timer) => {
  if (!timer) return timer;

  const elapsedMs = getElapsedMs(timer);
  const isStopped = Boolean(timer.stoppedAt);

  return {
    ...timer,
    elapsedMs,
    remainingMs: isStopped ? 0 : Math.max(AUDIT_DURATION_MS - elapsedMs, 0),
    isExpired: isStopped || elapsedMs >= AUDIT_DURATION_MS,
    isStopped,
  };
};

const getTimerWhere = (req) => ({
  projectId_auditId_auditorId: {
    projectId: req.params.projectId,
    auditId: req.params.auditId,
    auditorId: req.user.id,
  },
});

exports.getAuditTimer = async (req, res) => {
  try {
    const timer = await closeReportIfTimerExpired({
      projectId: req.params.projectId,
      auditId: req.params.auditId,
      auditorId: req.user.id,
    });

    res.json({
      success: true,
      data: serializeTimer(timer) || {
        projectId: req.params.projectId,
        auditId: req.params.auditId,
        auditorId: req.user.id,
        elapsedMs: 0,
        remainingMs: AUDIT_DURATION_MS,
        isExpired: false,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error fetching audit timer" });
  }
};

exports.startAuditTimer = async (req, res) => {
  try {
    const existingTimer = await prisma.auditTimer.findUnique({
      where: getTimerWhere(req),
      select: { auditorId: true },
    });

    await prisma.auditTimer.upsert({
      where: getTimerWhere(req),
      create: {
        projectId: req.params.projectId,
        auditId: req.params.auditId,
        auditorId: req.user.id,
        elapsedMs: 0,
        startedAt: new Date(),
      },
      update: {},
    });

    if (!existingTimer) {
      await createNotification({
        title: "Audit started",
        message: "An audit has started.",
        type: NOTIFICATION_TYPES.AUDIT_STARTED,
        recipientRole: "ADMIN",
        projectId: req.params.projectId,
        auditId: req.params.auditId,
        createdById: req.user.id,
        link: `/admin-dashboard/project/${req.params.projectId}`,
      });
    }

    const timer = await closeReportIfTimerExpired({
      projectId: req.params.projectId,
      auditId: req.params.auditId,
      auditorId: req.user.id,
    });

    res.json({
      success: true,
      data: serializeTimer(timer),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error starting audit timer" });
  }
};

exports.updateAuditTimer = async (req, res) => {
  try {
    await prisma.auditTimer.upsert({
      where: getTimerWhere(req),
      create: {
        projectId: req.params.projectId,
        auditId: req.params.auditId,
        auditorId: req.user.id,
        elapsedMs: 0,
        startedAt: new Date(),
      },
      update: {},
    });
    const timer = await closeReportIfTimerExpired({
      projectId: req.params.projectId,
      auditId: req.params.auditId,
      auditorId: req.user.id,
    });

    res.json({
      success: true,
      data: serializeTimer(timer),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error updating audit timer" });
  }
};
