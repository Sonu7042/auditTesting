const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { sendEmail } = require("../utils/sendEmail");
const { itemsInJobScope, itemsForTrack, requiredSkillsForItems } = require("../utils/auditScope");
const { scheduleNotices } = require("../utils/auditNotices");

const SKILLS = ["INFRASTRUCTURE", "ELECTRICAL", "FIRE_SAFETY", "THERMOGRAPHY"];
const ACTIVE_JOB_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];
const badRequest = (message) => { const error = new Error(message); error.statusCode = 400; return error; };
const notFound = (message) => { const error = new Error(message); error.statusCode = 404; return error; };
const cleanArray = (value) => Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim().toUpperCase()).filter(Boolean))] : [];

const jobInclude = {
  location: { include: { programme: { select: { id: true, name: true, code: true, companyId: true, company: { select: { companyName: true } } } }, facilities: true } },
  snapshot: { select: { id: true, checklistName: true, checklistVersion: true, itemCount: true, configuration: true } },
  assignments: {
    include: {
      auditor: { select: { id: true, fullName: true, email: true, username: true, status: true, auditorQualification: true } },
    },
  },
  createdBy: { select: { id: true, fullName: true } },
  notices: { orderBy: { dueAt: "asc" } },
  sessions: {
    select: { id: true, auditorId: true, status: true, checkedInAt: true, endedAt: true, distanceFromSiteM: true, gpsAccuracy: true },
    orderBy: { checkedInAt: "desc" },
  },
};

const requiredSkillsFromSnapshot = (snapshot) => {
  const modules = Array.isArray(snapshot.configuration?.applicableModules)
    ? snapshot.configuration.applicableModules
    : [];
  const required = new Set();
  if (modules.some((module) => ["SITE_SHARED", "SR_SHOWROOM", "WS_WORKSHOP", "SY_STOCKYARD", "TOOLS_REGISTER", "MANPOWER_SALES", "MANPOWER_SERVICE", "MANPOWER_YARD"].includes(module))) required.add("INFRASTRUCTURE");
  if (modules.includes("EFS_SAFETY")) { required.add("ELECTRICAL"); required.add("FIRE_SAFETY"); }
  if (modules.includes("THERMOGRAPHY")) required.add("THERMOGRAPHY");
  return [...required];
};

const qualificationIssues = (user, start, location) => {
  const q = user.auditorQualification;
  const issues = [];
  if (!user.status) issues.push("User account is inactive");
  if (!q) return ["Qualification profile is missing"];
  if (q.status !== "ACTIVE") issues.push("Qualification status is not active");
  if (q.calibrationScore < 80) issues.push("Calibration score is below 80%");
  if (!q.backgroundVerified) issues.push("Background verification is incomplete");
  if (!q.platformCertified) issues.push("Platform certification is incomplete");
  if (q.shadowAuditsCompleted < 1) issues.push("At least one shadow audit is required");
  if (q.certificationExpiresAt && q.certificationExpiresAt < start) issues.push("Certification expires before the audit date");
  const regions = cleanArray(q.supportedRegions);
  const matchesRegion = !regions.length || regions.includes("ALL_INDIA") || [location.zone, location.regionalOffice, location.state].filter(Boolean).some((value) => regions.includes(String(value).toUpperCase()));
  if (!matchesRegion) issues.push("Auditor does not support this location region");
  return issues;
};

const calculateReadiness = async ({ snapshotId, scheduledStart, scheduledEnd, auditorIds, assignments, facilityType, includesShared = true, isDemo = false }) => {
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  if (!snapshotId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw badRequest("Valid snapshot, start and end time are required.");
  const snapshot = await prisma.locationChecklistSnapshot.findUnique({ where: { id: snapshotId }, include: { location: true, items: true } });
  if (!snapshot) throw notFound("Checklist snapshot was not found.");
  const scopeJob = { facilityType: facilityType || null, includesShared: includesShared !== false };
  const scopedItems = itemsInJobScope(snapshot.items, scopeJob);
  if (!scopedItems.length) throw badRequest("No checklist questions apply to the selected facility.");
  const requiredSkills = requiredSkillsForItems(scopedItems);
  const plan = (Array.isArray(assignments) && assignments.length ? assignments : (auditorIds || []).map((auditorId) => ({ auditorId, track: "ALL" })))
    .filter((entry) => entry?.auditorId)
    .map((entry) => ({ auditorId: entry.auditorId, track: ["A", "B", "ALL"].includes(entry.track) ? entry.track : "ALL" }));
  const ids = [...new Set(plan.map((entry) => entry.auditorId))];
  const auditors = ids.length ? await prisma.user.findMany({
    where: { id: { in: ids }, role: "AUDITOR" },
    include: { auditorQualification: true },
  }) : [];
  const conflicts = ids.length ? await prisma.clientAuditJobAssignment.findMany({
    where: {
      auditorId: { in: ids },
      job: { status: { in: ACTIVE_JOB_STATUSES }, scheduledStart: { lt: end }, scheduledEnd: { gt: start } },
    },
    include: { job: { include: { location: { select: { dealerName: true, locationName: true } } } } },
  }) : [];
  const conflictByAuditor = new Map(conflicts.map((item) => [item.auditorId, item.job]));
  const auditorChecks = auditors.map((user) => {
    const issues = isDemo ? [] : qualificationIssues(user, start, snapshot.location);
    if (!isDemo && conflictByAuditor.has(user.id)) issues.push(`Schedule conflict with ${conflictByAuditor.get(user.id).location.dealerName}`);
    const track = plan.find((entry) => entry.auditorId === user.id)?.track || "ALL";
    const skills = cleanArray(user.auditorQualification?.skills);
    const trackSkills = requiredSkillsForItems(itemsForTrack(snapshot.items, scopeJob, track));
    const missingForTrack = isDemo ? [] : trackSkills.filter((skill) => !skills.includes(skill));
    if (missingForTrack.length) issues.push(`Track ${track} needs skill: ${missingForTrack.join(", ")}`);
    return { id: user.id, fullName: user.fullName, track, skills, issues, eligible: issues.length === 0 };
  });
  const tracks = new Set(plan.map((entry) => entry.track));
  const needA = itemsForTrack(snapshot.items, scopeJob, "A").length > 0;
  const needB = itemsForTrack(snapshot.items, scopeJob, "B").length > 0;
  const blockers = [];
  if (!ids.length) blockers.push("Select at least one auditor");
  if (auditors.length !== ids.length) blockers.push("One or more selected users are not auditors");
  if (auditorChecks.some((item) => !item.eligible)) blockers.push("One or more selected auditors are not eligible");
  if (!tracks.has("ALL")) {
    if (needA && !tracks.has("A")) blockers.push("Track A (Infrastructure + Fire) has no auditor");
    if (needB && !tracks.has("B")) blockers.push("Track B (Electrical + Thermography) has no auditor");
  }
  const configuredNoticeDays = Number(process.env.CLIENT_AUDIT_MIN_NOTICE_DAYS ?? 7);
  const minimumNoticeDays = Number.isFinite(configuredNoticeDays) && configuredNoticeDays >= 0 ? configuredNoticeDays : 7;
  const minimumNoticeDate = new Date(Date.now() + minimumNoticeDays * 24 * 60 * 60 * 1000);
  if (!isDemo && start < minimumNoticeDate) blockers.push(`Dealer must receive at least ${minimumNoticeDays} days advance notice`);
  return { ready: blockers.length === 0, blockers, requiredSkills, missingSkills: [], auditorChecks, plan, scopeJob, itemCount: scopedItems.length, needA, needB, snapshot };
};

exports.getOptions = async (req, res, next) => {
  try {
    const [auditors, snapshots] = await Promise.all([
      prisma.user.findMany({ where: { role: "AUDITOR" }, select: { id: true, fullName: true, email: true, status: true, auditorQualification: true }, orderBy: { fullName: "asc" } }),
      prisma.locationChecklistSnapshot.findMany({
        include: { location: { include: { programme: { select: { id: true, name: true } }, facilities: true } } },
        orderBy: { generatedAt: "desc" },
      }),
    ]);
    res.json({ success: true, auditors, snapshots, skills: SKILLS });
  } catch (error) { next(error); }
};

exports.upsertQualification = async (req, res, next) => {
  try {
    const userId = req.params.auditorId;
    const user = await prisma.user.findFirst({ where: { id: userId, role: "AUDITOR" } });
    if (!user) throw notFound("Auditor was not found.");
    const skills = cleanArray(req.body.skills);
    if (skills.some((skill) => !SKILLS.includes(skill))) throw badRequest("Invalid auditor skill.");
    const calibrationScore = Number(req.body.calibrationScore);
    if (!Number.isFinite(calibrationScore) || calibrationScore < 0 || calibrationScore > 100) throw badRequest("Calibration score must be between 0 and 100.");
    const data = {
      skills,
      supportedRegions: cleanArray(req.body.supportedRegions),
      calibrationScore,
      backgroundVerified: Boolean(req.body.backgroundVerified),
      platformCertified: Boolean(req.body.platformCertified),
      shadowAuditsCompleted: Math.max(0, Number(req.body.shadowAuditsCompleted || 0)),
      authorityLetterNumber: req.body.authorityLetterNumber?.trim() || null,
      certificationExpiresAt: req.body.certificationExpiresAt ? new Date(req.body.certificationExpiresAt) : null,
      status: req.body.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    };
    const qualification = await prisma.auditorQualification.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    res.json({ success: true, message: "Auditor qualification saved successfully.", qualification });
  } catch (error) { next(error); }
};

exports.checkReadiness = async (req, res, next) => {
  try {
    const result = await calculateReadiness(req.body);
    res.json({ success: true, readiness: { ...result, snapshot: undefined } });
  } catch (error) { next(error); }
};

exports.createJob = async (req, res, next) => {
  try {
    const readiness = await calculateReadiness(req.body);
    if (!readiness.ready) throw badRequest(`Audit is not ready: ${readiness.blockers.join("; ")}`);
    const checkMap = new Map(readiness.auditorChecks.map((item) => [item.id, item]));
    const job = await prisma.clientAuditJob.create({
      data: {
        locationId: readiness.snapshot.locationId,
        snapshotId: readiness.snapshot.id,
        createdById: req.user.id,
        auditCycle: req.body.auditCycle?.trim() || readiness.snapshot.location.programmeId,
        auditType: req.body.auditType?.trim().toUpperCase() || "PERIODIC",
        scheduledStart: new Date(req.body.scheduledStart),
        scheduledEnd: new Date(req.body.scheduledEnd),
        facilityType: readiness.scopeJob.facilityType,
        includesShared: readiness.scopeJob.includesShared,
        isDemo: req.body.isDemo === true,
        visitGroup: req.body.visitGroup?.trim() || null,
        requiredSkills: readiness.requiredSkills,
        readiness: { checkedAt: new Date().toISOString(), requiredSkills: readiness.requiredSkills, auditorChecks: readiness.auditorChecks },
        status: "SCHEDULED",
        notes: req.body.notes?.trim() || null,
        assignments: {
          create: readiness.plan.map((entry, index) => ({
            auditorId: entry.auditorId,
            track: entry.track,
            assignedSkills: (checkMap.get(entry.auditorId)?.skills || []).filter((skill) => readiness.requiredSkills.includes(skill)),
            assignmentRole: index === 0 ? "LEAD" : "MEMBER",
            notifiedAt: new Date(),
          })),
        },
      },
      include: jobInclude,
    });
    await scheduleNotices(job);
    for (const assignment of job.assignments) {
      await createNotification({
        title: "Client audit assigned",
        message: `${job.auditType} audit for ${job.location.dealerName} - ${job.location.locationName}${job.facilityType ? ` (${job.facilityType.toLowerCase()})` : ""} is scheduled for ${job.scheduledStart.toLocaleString("en-IN")}.`,
        type: NOTIFICATION_TYPES.AUDIT_SCHEDULED,
        recipientId: assignment.auditorId,
        createdById: req.user.id,
        link: "/auditor-dashboard/new-report",
      });
    }
    const emailResult = await sendEmail(
      [job.location.contactEmail],
      `Audit scheduled - ${job.location.dealerName}`,
      `Hello ${job.location.contactName},\n\nAn audit is scheduled for ${job.location.locationName} on ${job.scheduledStart.toLocaleString("en-IN")}.\n\nAudit cycle: ${job.auditCycle}\nAudit type: ${job.auditType}\n\nRegards,\nAudit Portal`,
    );
    const finalJob = emailResult
      ? await prisma.clientAuditJob.update({ where: { id: job.id }, data: { dealerNotifiedAt: new Date() }, include: jobInclude })
      : job;
    res.status(201).json({ success: true, message: emailResult ? "Audit scheduled and notifications sent." : "Audit scheduled. Dealer email could not be sent.", job: finalJob });
  } catch (error) { next(error); }
};

exports.getJobs = async (req, res, next) => {
  try {
    const where = req.user.role === "AUDITOR" ? { assignments: { some: { auditorId: req.user.id } } } : {};
    const jobs = await prisma.clientAuditJob.findMany({ where, include: jobInclude, orderBy: { scheduledStart: "asc" } });
    res.json({ success: true, jobs });
  } catch (error) { next(error); }
};

exports.cancelJob = async (req, res, next) => {
  try {
    const job = await prisma.clientAuditJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) throw notFound("Audit job was not found.");
    if (!['SCHEDULED', 'CONFIRMED'].includes(job.status)) throw badRequest("Only an unstarted audit can be cancelled.");
    const updated = await prisma.clientAuditJob.update({ where: { id: job.id }, data: { status: "CANCELLED", notes: [job.notes, req.body.reason?.trim()].filter(Boolean).join("\nCancellation: ") }, include: jobInclude });
    res.json({ success: true, message: "Audit job cancelled successfully.", job: updated });
  } catch (error) { next(error); }
};


exports.listNotices = async (req, res, next) => {
  try {
    const notices = await prisma.clientAuditNotice.findMany({
      include: { job: { select: { id: true, scheduledStart: true, facilityType: true, status: true, location: { select: { id: true, dealerName: true, locationName: true, locationCode: true, zone: true, regionalOffice: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } } } } },
      orderBy: { dueAt: "asc" }, take: 300,
    });
    res.json({ success: true, notices });
  } catch (error) { next(error); }
};

exports.runNotices = async (req, res, next) => {
  try {
    const { runDueNotices } = require("../utils/auditNotices");
    const count = await runDueNotices();
    res.json({ success: true, message: `${count} due notice(s) processed.`, count });
  } catch (error) { next(error); }
};
