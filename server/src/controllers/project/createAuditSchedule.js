
const prisma = require("../../config/prisma");
const { ensureProjectChecklist } = require("../../utils/projectChecklist");
const { createNotification, NOTIFICATION_TYPES } = require("../../utils/notificationService");

exports.createAuditSchedule = async (req, res) => {
  const { projectId, auditId, date, auditors } = req.body;

  try {
    if (!projectId || !auditId || !date || !Array.isArray(auditors)) {
      return res.status(400).json({ error: "Invalid audit schedule details" });
    }

    const requestedAudit = await prisma.audit.findFirst({
      where: { id: auditId, projectId },
      include: { auditors: true },
    });

    if (!requestedAudit) {
      return res.status(404).json({ error: "Audit configuration not found" });
    }

    const schedule = await prisma.$transaction(async (tx) => {
      const latestAudit = await tx.audit.findFirst({
        where: {
          projectId,
          auditType: requestedAudit.auditType,
          checklistType: requestedAudit.checklistType,
        },
        include: {
          auditors: true,
          schedules: { select: { id: true } },
        },
        orderBy: [{ cycleNumber: "desc" }, { id: "desc" }],
      });

      let scheduledAudit = latestAudit;

      // A schedule is an audit occurrence. Never attach two occurrences to the
      // same audit record because reports, timers, responses and NCs use auditId.
      if (latestAudit.schedules.length > 0) {
        const assignedAuditorIds = auditors.length
          ? [...new Set(auditors)]
          : latestAudit.auditors.map((assignment) => assignment.userId);

        scheduledAudit = await tx.audit.create({
          data: {
            projectId,
            auditType: latestAudit.auditType,
            checklistType: latestAudit.checklistType,
            frequency: latestAudit.frequency,
            numberOfAudits: latestAudit.numberOfAudits,
            cycleNumber: (latestAudit.cycleNumber || 1) + 1,
            previousAuditId: latestAudit.id,
            auditors: {
              create: assignedAuditorIds.map((userId) => ({ userId })),
            },
          },
        });

        await ensureProjectChecklist(
          tx,
          projectId,
          scheduledAudit.checklistType,
          scheduledAudit.checklistType,
        );
      }

      return tx.auditSchedule.create({
        data: {
          projectId,
          auditId: scheduledAudit.id,
          date: new Date(date),
          auditors: {
            create: auditors.map((userId) => ({ userId })),
          },
        },
        include: {
          auditors: { include: { user: true } },
          audit: true,
          project: true,
        },
      });
    });

    const notifiedAuditorIds = new Set();
    for (const assignment of schedule.auditors) {
      if (!assignment.user || notifiedAuditorIds.has(assignment.user.id)) continue;
      notifiedAuditorIds.add(assignment.user.id);

      await createNotification({
        title: "Audit scheduled",
        message: `Audit has been scheduled for ${schedule.project?.projectName || "your project"}.`,
        type: NOTIFICATION_TYPES.AUDIT_SCHEDULED,
        recipientId: assignment.user.id,
        projectId,
        auditId: schedule.auditId,
        link: `/auditor-dashboard/schedule`,
      });
    }

    res.json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};




exports.getAuditScheduleCount = async (req, res) => {
  const { projectId , auditId } = req.query;

  try {
    const audit = await prisma.audit.findFirst({
      where: { id: auditId, projectId },
      select: { auditType: true, checklistType: true },
    });

    if (!audit) return res.json({ count: 0 });

    const count = await prisma.auditSchedule.count({
      where: {
        projectId,
        audit: {
          auditType: audit.auditType,
          checklistType: audit.checklistType,
        },
      },
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: "Error fetching count" });
  }
};

exports.getAuditSchedules = async (req, res) => {
  const { projectId, auditId } = req.query;

  try {
    let accessWhere = {};
    let scheduleAccess = {};
    if (req.user.role === "AUDITOR") {
      scheduleAccess = { auditors: { some: { userId: req.user.id } } };
    } else if (req.user.role !== "ADMIN") {
      const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { companyId: true } });
      if (!user?.companyId) accessWhere = { id: "__none__" };
      else if (req.user.role === "SITE_INCHARGE") accessWhere = { companyId: user.companyId, siteInchargeId: req.user.id };
      else if (req.user.role === "SITE_USER") accessWhere = { companyId: user.companyId, siteUserId: req.user.id };
      else accessWhere = { companyId: user.companyId };
    }

    const schedules = await prisma.auditSchedule.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(auditId ? { auditId } : {}),
        ...scheduleAccess,
        project: accessWhere,
      },
      include: {
        audit: true,
        project: true,
        history: {
          orderBy: { createdAt: "desc" },
          include: { rescheduledBy: { select: { id: true, fullName: true } } },
        },
        auditors: {
          include: {
            user: {
              select: { id: true, fullName: true },
            },
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    res.json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error fetching audit schedules" });
  }
};

exports.rescheduleAudit = async (req, res) => {
  const { scheduleId } = req.params;
  const { date, auditors, reason } = req.body;

  try {
    const newDate = new Date(date);
    if (!date || Number.isNaN(newDate.getTime()) || !reason?.trim() || !Array.isArray(auditors) || auditors.length === 0) {
      return res.status(400).json({ error: "New date, reason, and at least one auditor are required" });
    }

    const existing = await prisma.auditSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        project: true,
        audit: { include: { auditReports: true, auditTimers: true } },
        auditors: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Audit schedule not found" });
    if (existing.date.getTime() === newDate.getTime()) {
      return res.status(400).json({ error: "Please select a different date for rescheduling" });
    }
    if (existing.audit.auditReports.some((report) => report.status === "Completed") || existing.audit.auditTimers.length > 0) {
      return res.status(409).json({ error: "An audit that has started or completed cannot be rescheduled" });
    }

    const auditorIds = [...new Set(auditors.filter(Boolean))];
    const validAuditors = await prisma.user.count({
      where: { id: { in: auditorIds }, role: "AUDITOR", status: true },
    });
    if (validAuditors !== auditorIds.length) return res.status(400).json({ error: "One or more selected auditors are invalid" });

    const schedule = await prisma.$transaction(async (tx) => {
      await tx.auditScheduleHistory.create({ data: {
        scheduleId, previousDate: existing.date, newDate, reason: reason.trim(), rescheduledById: req.user.id,
      }});
      await tx.scheduledAuditor.deleteMany({ where: { scheduleId } });
      return tx.auditSchedule.update({
        where: { id: scheduleId },
        data: { date: newDate, auditors: { create: auditorIds.map((userId) => ({ userId })) } },
        include: { project: true, audit: true, auditors: { include: { user: true } }, history: { orderBy: { createdAt: "desc" } } },
      });
    });

    for (const userId of new Set([...existing.auditors.map((item) => item.userId), ...auditorIds])) {
      await createNotification({
        title: "Audit rescheduled",
        message: `${schedule.audit.auditType} audit for ${schedule.project.projectName} was moved to ${newDate.toLocaleDateString("en-GB")}. Reason: ${reason.trim()}`,
        type: NOTIFICATION_TYPES.AUDIT_RESCHEDULED,
        recipientId: userId, projectId: schedule.projectId, auditId: schedule.auditId,
        createdById: req.user.id, link: "/auditor-dashboard/schedule",
      });
    }

    res.json({ success: true, message: "Audit rescheduled successfully", data: schedule });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Unable to reschedule audit" });
  }
};
