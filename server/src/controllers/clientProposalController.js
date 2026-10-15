const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { DISCIPLINES, MODULES, toJson } = require("./clientChecklistController").helpers;

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const PRIORITY_BY_SEVERITY = { CRITICAL: "IMPORTANT_URGENT", HIGH: "URGENT", MEDIUM: "IMPORTANT", LOW: "REST" };
const REACHES = ["TIER_FACILITY", "SITE", "SELECTED"];

const moduleFor = (discipline, facilityType) => {
  if (discipline === "THERMOGRAPHY") return "THERMOGRAPHY";
  if (discipline === "FIRE" || discipline === "ELECTRICAL") return "EFS_SAFETY";
  return { SHOWROOM: "SR_SHOWROOM", WORKSHOP: "WS_WORKSHOP", STOCKYARD: "SY_STOCKYARD" }[facilityType] || "SITE_SHARED";
};

const nextVersionLabel = (label) => {
  const m = /^(.*?)(\d+)$/.exec(label || "");
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${label || "1.0"}.1`;
};

exports.create = async (req, res, next) => {
  try {
    const job = await prisma.clientAuditJob.findFirst({ where: { id: str(req.body.jobId), assignments: { some: { auditorId: req.user.id } } }, include: { location: true } });
    if (!job) throw fail("Select an audit you are assigned to.", 404);
    const discipline = str(req.body.discipline).toUpperCase();
    if (!DISCIPLINES.includes(discipline)) throw fail("Choose the audit discipline.");
    const severity = str(req.body.severity).toUpperCase() || "MEDIUM";
    if (!SEVERITIES.includes(severity)) throw fail("Invalid severity.");
    if (!str(req.body.questionText) || !str(req.body.reason)) throw fail("Describe the new point and why it is needed.");
    const proposal = await prisma.checklistProposal.create({
      data: {
        programmeId: job.location.programmeId, proposedById: req.user.id, jobId: job.id,
        moduleCode: moduleFor(discipline, job.facilityType), discipline,
        sectionName: str(req.body.sectionName) || "Auditor-proposed", questionText: str(req.body.questionText), reason: str(req.body.reason), severity,
        reachData: { facilityType: job.facilityType, locationCode: job.location.locationCode, state: job.location.state },
      },
    });
    await createNotification({ title: "Checklist point proposed", message: `A new checklist point was proposed at ${job.location.locationName}.`, type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientRole: "ADMIN", createdById: req.user.id, link: "/admin-dashboard/checklist-proposals" }).catch(() => null);
    res.status(201).json({ success: true, message: "Proposed point sent for review. It will not affect this audit's score.", proposal });
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const where = req.user.role === "AUDITOR" ? { proposedById: req.user.id } : {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.locationCode) where.reachData = { path: ["locationCode"], equals: String(req.query.locationCode) };
    const proposals = await prisma.checklistProposal.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(proposals.map((p) => p.proposedById))] } }, select: { id: true, fullName: true } });
    const nameOf = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
    const codes = [...new Set(proposals.map((p) => p.reachData?.locationCode).filter(Boolean))];
    const sites = await prisma.dealerLocation.findMany({ where: { locationCode: { in: codes } }, select: { id: true, locationName: true, locationCode: true, dealerName: true, zone: true, regionalOffice: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } });
    const siteOf = Object.fromEntries(sites.map((s) => [s.locationCode, { id: s.id, locationName: s.locationName, locationCode: s.locationCode, dealerName: s.dealerName, zone: s.zone, regionalOffice: s.regionalOffice, companyId: s.programme.companyId, company: s.programme.company.companyName }]));
    res.json({ success: true, proposals: proposals.map((p) => ({ ...p, proposedByName: nameOf[p.proposedById] || "—", site: siteOf[p.reachData?.locationCode] || null })) });
  } catch (e) { next(e); }
};

exports.adminReview = async (req, res, next) => {
  try {
    const p = await prisma.checklistProposal.findUnique({ where: { id: req.params.id } });
    if (!p) throw fail("Proposal not found.", 404);
    if (p.status !== "PENDING_ADMIN") throw fail("This proposal is not waiting for Back-Admin review.");
    const decision = str(req.body.decision).toUpperCase();
    if (!["FORWARD", "REJECT"].includes(decision)) throw fail("Choose forward or reject.");
    if (decision === "REJECT" && !str(req.body.remarks)) throw fail("Add the reason for rejecting.");
    const updated = await prisma.checklistProposal.update({ where: { id: p.id }, data: { status: decision === "FORWARD" ? "PENDING_SGS" : "REJECTED", adminById: req.user.id, adminAt: new Date(), adminRemarks: str(req.body.remarks) || null } });
    res.json({ success: true, message: decision === "FORWARD" ? "Forwarded for SGS sign-off." : "Proposal rejected.", proposal: updated });
  } catch (e) { next(e); }
};

exports.sgsReview = async (req, res, next) => {
  try {
    const p = await prisma.checklistProposal.findUnique({ where: { id: req.params.id } });
    if (!p) throw fail("Proposal not found.", 404);
    if (p.status !== "PENDING_SGS") throw fail("This proposal is not waiting for SGS sign-off.");
    const decision = str(req.body.decision).toUpperCase();
    if (!["APPROVE", "REJECT"].includes(decision)) throw fail("Choose approve or reject.");
    if (decision === "REJECT") {
      if (!str(req.body.remarks)) throw fail("Add the reason for rejecting.");
      const updated = await prisma.checklistProposal.update({ where: { id: p.id }, data: { status: "REJECTED", sgsById: req.user.id, sgsAt: new Date(), sgsRemarks: str(req.body.remarks) } });
      return res.json({ success: true, message: "Proposal rejected.", proposal: updated });
    }
    const reach = str(req.body.reach).toUpperCase() || "TIER_FACILITY";
    if (!REACHES.includes(reach)) throw fail("Choose how widely the point applies.");
    const base = p.reachData || {};
    const job = p.jobId ? await prisma.clientAuditJob.findUnique({ where: { id: p.jobId }, include: { location: { include: { facilities: true } } } }) : null;
    const facility = job?.location.facilities.find((f) => f.facilityType === base.facilityType);
    let rule = null; let reachData = { ...base };
    if (reach === "TIER_FACILITY") rule = { ...(base.facilityType ? { facilityTypes: [base.facilityType] } : {}), ...(facility?.tier ? { tiers: [facility.tier] } : {}) };
    if (reach === "SITE") rule = { locationCodes: [base.locationCode] };
    if (reach === "SELECTED") {
      const states = Array.isArray(req.body.states) ? req.body.states.map(str).filter(Boolean) : str(req.body.states).split(",").map(str).filter(Boolean);
      const codes = Array.isArray(req.body.locationCodes) ? req.body.locationCodes.map(str).filter(Boolean) : str(req.body.locationCodes).split(",").map(str).filter(Boolean);
      if (!states.length && !codes.length) throw fail("Enter the states or site codes this point applies to.");
      rule = { ...(states.length ? { states } : {}), ...(codes.length ? { locationCodes: codes } : {}) };
      reachData = { ...reachData, states, locationCodes: codes };
    }
    if (rule && !Object.keys(rule).length) rule = null;

    const latest = await prisma.clientChecklistVersion.findFirst({ where: { programmeId: p.programmeId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, include: { items: true } });
    if (!latest) throw fail("Publish a checklist version first; there is nothing to extend.");
    const count = await prisma.clientChecklistItem.count({ where: { versionId: latest.id, questionCode: { startsWith: "AP-" } } });
    const code = `AP-${String(count + 1).padStart(3, "0")}`;
    const created = await prisma.$transaction(async (tx) => {
      const version = await tx.clientChecklistVersion.create({ data: { programmeId: p.programmeId, name: latest.name, version: nextVersionLabel(latest.version), status: "PUBLISHED", publishedAt: new Date(), effectiveDate: new Date() } });
      const clones = latest.items.map(({ id, versionId, createdAt, updatedAt, ...rest }) => ({ ...rest, versionId: version.id, applicabilityRule: rest.applicabilityRule ?? undefined }));
      await tx.clientChecklistItem.createMany({ data: clones });
      const item = await tx.clientChecklistItem.create({
        data: {
          versionId: version.id, moduleCode: p.moduleCode, discipline: p.discipline, sectionName: p.sectionName, questionCode: code, questionText: p.questionText,
          severityOnFail: p.severity, mahindraPriority: PRIORITY_BY_SEVERITY[p.severity], evidenceRequired: true, minimumEvidence: p.severity === "CRITICAL" ? 2 : 1,
          applicabilityRule: rule ? toJson(rule) : undefined, sortOrder: latest.items.length + 1, isActive: true,
        },
      });
      await tx.checklistProposal.update({ where: { id: p.id }, data: { status: "APPROVED", sgsById: req.user.id, sgsAt: new Date(), sgsRemarks: str(req.body.remarks) || null, reach, reachData, createdItemId: item.id } });
      return { version, item };
    });
    res.json({ success: true, message: `Approved. Checklist ${created.version.version} now includes ${code} for upcoming audits.`, version: created.version.version, questionCode: code });
  } catch (e) { next(e); }
};
