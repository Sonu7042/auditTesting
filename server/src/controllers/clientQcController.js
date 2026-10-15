const PDFDocument = require("pdfkit");
const prisma = require("../config/prisma");
const { locationWhereForUser } = require("../utils/scope");
const { fullInclude } = require("../utils/auditReportData");
const { scoreJob, detectAnomalies, RISK_BY_SEVERITY, PRIORITY_LABEL, closureDueAt } = require("../utils/auditScoring");

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

const reportSelect = {
  id: true, reportNumber: true, status: true, revision: true, qcScore: true, approvedAt: true, publishedAt: true,
  history: { select: { action: true, createdAt: true, remarks: true }, orderBy: { createdAt: "asc" } }, qcBreakdown: true, reviewRemarks: true, generatedAt: true, approvedAt: true, publishedAt: true,
  signedByName: true, signedByDesignation: true, signedAt: true, debriefNotes: true,
  job: {
    select: {
      id: true, auditType: true, auditCycle: true, facilityType: true, includesShared: true, isDemo: true, visitGroup: true, scheduledStart: true, scheduledEnd: true, status: true,
      location: { select: { id: true, dealerName: true, locationName: true, locationCode: true, zone: true, regionalOffice: true, state: true, geofenceRadiusM: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } },
      snapshot: { select: { itemCount: true, checklistVersion: true, items: { select: { id: true, moduleCode: true, sectionName: true, questionCode: true, itemData: true } } } },
      assignments: { select: { auditorId: true, track: true, assignmentRole: true, auditor: { select: { id: true, fullName: true } } } },
      sessions: { select: { id: true, auditorId: true, status: true, checkedInAt: true, endedAt: true, distanceFromSiteM: true, checkInLatitude: true, checkInLongitude: true, gpsAccuracy: true, checkInEvidenceMimeType: true, auditor: { select: { id: true, fullName: true } }, completion: { select: { completedAt: true, finalRemarks: true } },
        responses: { select: { id: true, snapshotItemId: true, responseStatus: true, result: true, closedOnSpot: true, evidence: { select: { id: true, kind: true, fileHash: true } } } } } },
    },
  },
};

const analyse = (report) => {
  const scoring = scoreJob(report.job, report.job.sessions);
  const anomalies = detectAnomalies(report.job, report.job.sessions, scoring);
  return { scoring, anomalies };
};

// When the audit was planned and done, who reviewed it, and where the auditor checked in.
const visitOf = (report) => {
  const first = [...report.job.sessions].sort((a, b) => new Date(a.checkedInAt) - new Date(b.checkedInAt))[0];
  const done = first?.completion?.completedAt || first?.endedAt || null;
  const at = (...actions) => report.history.find((h) => actions.includes(h.action))?.createdAt || null;
  return {
    planned: report.job.scheduledStart, plannedEnd: report.job.scheduledEnd,
    startedAt: first?.checkedInAt || null, completedAt: done, durationMin: first && done ? Math.max(1, Math.round((new Date(done) - new Date(first.checkedInAt)) / 60000)) : null,
    syncedAt: at("SUBMIT") || first?.completion?.completedAt || report.generatedAt,
    syncLateHours: (() => { const synced = at("SUBMIT") || first?.completion?.completedAt || report.generatedAt; return done && synced ? Math.max(0, Math.round((new Date(synced) - new Date(done)) / 36e5)) : 0; })(),
    syncJustification: report.history.find((h) => h.action === "SUBMIT")?.remarks || null,
    reviewedAt: at("CORRECTION_RAISED", "APPROVE"), approvedAt: report.approvedAt || null,
    revision: report.revision, revisionsOpened: report.history.filter((h) => h.action === "REVISION_OPENED").length,
    gps: first ? { lat: first.checkInLatitude, lng: first.checkInLongitude, accuracyM: Math.round(first.gpsAccuracy), distanceM: Math.round(first.distanceFromSiteM) } : null,
    hasFacade: Boolean(first),
  };
};

const brief = (report) => {
  const { scoring, anomalies } = analyse(report);
  return {
    id: report.id, reportNumber: report.reportNumber, status: report.status, revision: report.revision, generatedAt: report.generatedAt,
    qcScore: report.qcScore, signedByName: report.signedByName, signedAt: report.signedAt, isDemo: report.job.isDemo,
    facilityType: report.job.facilityType, includesShared: report.job.includesShared, visitGroup: report.job.visitGroup, auditType: report.job.auditType,
    scheduledStart: report.job.scheduledStart, visit: visitOf(report), location: report.job.location, auditors: report.job.assignments.map((a) => ({ ...a.auditor, track: a.track })),
    percent: scoring.percent, rating: scoring.rating, riskLevel: scoring.riskLevel, counts: scoring.counts, disciplines: scoring.disciplines,
    anomalyCount: anomalies.length, highAnomalies: anomalies.filter((a) => a.severity === "HIGH").length,
  };
};

exports.queue = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = { in: String(req.query.status).split(",") };
    if (req.query.companyId) where.job = { location: { programme: { companyId: String(req.query.companyId) } } };
    if (req.query.locationId) where.job = { ...(where.job || {}), locationId: String(req.query.locationId) };
    const reports = await prisma.clientAuditReport.findMany({ where, select: reportSelect, orderBy: { generatedAt: "desc" }, take: 300 });
    res.json({ success: true, reports: reports.map(brief) });
  } catch (e) { next(e); }
};

exports.detail = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id }, select: { ...reportSelect, history: { orderBy: { createdAt: "desc" }, select: { action: true, fromStatus: true, toStatus: true, remarks: true, createdAt: true } } } });
    if (!report) throw fail("Report not found.", 404);
    const isAdmin = req.user.role === "ADMIN";
    if (!isAdmin) {
      const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: report.job.location.id }] } });
      if (!visible || !["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("You cannot access this report.", 403);
    }
    const { scoring, anomalies } = analyse(report);
    const ncs = await prisma.clientAuditNonCompliance.findMany({ where: { jobId: report.job.id }, select: { id: true, ncNumber: true, status: true, severity: true, priority: true, observation: true, recommendation: true, createdAt: true, snapshotItemId: true } , orderBy: { createdAt: "asc" } });
    const itemById = Object.fromEntries(report.job.snapshot.items.map((i) => [i.id, i]));
    const register = ncs.map((n) => ({ ...n, questionCode: itemById[n.snapshotItemId]?.questionCode, question: itemById[n.snapshotItemId]?.itemData?.questionText, discipline: itemById[n.snapshotItemId]?.itemData?.discipline,
      risk: RISK_BY_SEVERITY[n.severity] || n.severity, mahindraPriority: PRIORITY_LABEL[n.priority] || n.priority, dueAt: closureDueAt(n.createdAt, n.priority) }));
    const { snapshot, ...job } = report.job;
    res.json({ success: true, report: { ...brief(report), history: isAdmin ? report.history : [], qcBreakdown: report.qcBreakdown, reviewRemarks: report.reviewRemarks, debriefNotes: report.debriefNotes, signedByDesignation: report.signedByDesignation, job: { ...job, checklistVersion: snapshot.checklistVersion, itemCount: snapshot.itemCount } }, scoring, anomalies: isAdmin ? anomalies : [], register });
  } catch (e) { next(e); }
};

exports.scoreAuditors = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id }, select: { id: true, qcScore: true, job: { select: { id: true, isDemo: true, assignments: { select: { auditorId: true } }, location: { select: { locationName: true } } } } } });
    if (!report) throw fail("Report not found.", 404);
    const keys = ["accuracy", "evidence", "timeliness", "protocol"];
    const parts = {};
    for (const k of keys) {
      const v = Number(req.body[k]);
      if (!Number.isFinite(v) || v < 0 || v > 100) throw fail(`Score for ${k} must be between 0 and 100.`);
      parts[k] = v;
    }
    // Weights follow the monthly evaluation factors in the RFP.
    const total = Math.round((parts.accuracy * 0.4 + parts.evidence * 0.25 + parts.timeliness * 0.15 + parts.protocol * 0.2) * 10) / 10;
    await prisma.clientAuditReport.update({ where: { id: report.id }, data: { qcScore: total, qcBreakdown: { ...parts, remarks: str(req.body.remarks) || null, scoredBy: req.user.id, scoredAt: new Date().toISOString() } } });
    if (!report.job.isDemo && !report.qcScore) {
      for (const a of report.job.assignments) {
        const auditor = await prisma.auditorOnboarding.findUnique({ where: { userId: a.auditorId } });
        await prisma.auditorScore.create({ data: { userId: a.auditorId, source: "AUDIT_REVIEW", score: total, reference: `QC · ${report.job.location.locationName}`, createdById: req.user.id } });
        if (auditor?.status === "APPROVED") {
          const rolling = await prisma.auditorScore.findMany({ where: { userId: a.auditorId, source: "AUDIT_REVIEW", createdAt: { gte: auditor.approvedAt || new Date(0) } }, orderBy: { createdAt: "desc" }, take: 3 });
          const avg = rolling.reduce((x, y) => x + y.score, 0) / rolling.length;
          await prisma.auditorQualification.updateMany({ where: { userId: a.auditorId }, data: { calibrationScore: Math.round(avg * 10) / 10, status: avg < 60 ? "INACTIVE" : "ACTIVE" } });
        }
      }
    }
    res.json({ success: true, message: report.job.isDemo ? "Scored (demo audit: not added to auditor performance)." : "Auditor performance updated.", qcScore: total });
  } catch (e) { next(e); }
};

exports.signoff = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw fail("Report not found.", 404);
    if (report.status !== "PUBLISHED") throw fail("Only a published report can be signed off by the dealer.");
    // The dealer approves only when every question and change request on this report has been dealt with.
    const unresolved = await prisma.reportClarification.count({ where: { reportId: report.id, status: { in: ["OPEN", "ACCEPTED"] } } });
    if (unresolved) throw fail(`${unresolved} clarification or change request(s) on this report are still waiting. They must be resolved before sign-off.`);
    const name = str(req.body.name); const designation = str(req.body.designation); const signature = str(req.body.signature);
    if (!name || !designation) throw fail("Enter the name and designation of the dealer signatory.");
    if (!/^data:image\/(png|jpeg);base64,/.test(signature)) throw fail("A signature is required.");
    if (signature.length > 4_000_000) throw fail("Signature is too large.");
    const updated = await prisma.clientAuditReport.update({ where: { id: report.id }, data: { status: "SIGNED_OFF", signedByName: name, signedByDesignation: designation, signedAt: new Date(), signatureUrl: signature, debriefNotes: str(req.body.debriefNotes) || null, history: { create: { action: "DEALER_SIGNOFF", fromStatus: "PUBLISHED", toStatus: "SIGNED_OFF", remarks: `${name}, ${designation}`, actorId: req.user.id } } } });
    await prisma.reportClarification.updateMany({ where: { reportId: report.id, status: { in: ["ANSWERED", "ACTIONED"] } }, data: { status: "CLOSED", closedAt: new Date() } });
    res.json({ success: true, message: "Dealer sign-off recorded.", status: updated.status });
  } catch (e) { next(e); }
};

// Opens a new revision of an issued report: keeps the version being replaced for download, puts the report back into QC
// review, and clears the dealer's sign-off. Used by Back-Admin's "open revision" and by an accepted client change request.
const openRevision = async (report, reason, userId) => {
  const full = await prisma.clientAuditReport.findUnique({ where: { id: report.id }, include: fullInclude });
  await prisma.clientAuditReportRevision.upsert({
    where: { reportId_revision: { reportId: report.id, revision: report.revision } },
    create: { reportId: report.id, revision: report.revision, issuedAt: report.publishedAt || report.approvedAt, reason, openedById: userId, payload: JSON.parse(JSON.stringify(full)) },
    update: {},
  });
  return prisma.clientAuditReport.update({ where: { id: report.id }, data: { status: "UNDER_REVIEW", revision: { increment: 1 }, signedByName: null, signedByDesignation: null, signedAt: null, signatureUrl: null, reviewRemarks: reason, history: { create: { action: "REVISION_OPENED", fromStatus: report.status, toStatus: "UNDER_REVIEW", remarks: reason, actorId: userId } } } });
};

exports.revise = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw fail("Report not found.", 404);
    if (!["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("Only an issued report can be revised.");
    if (!str(req.body.reason)) throw fail("Give the reason for the revision.");
    await openRevision(report, str(req.body.reason), req.user.id);
    res.json({ success: true, message: "Revision opened for QC." });
  } catch (e) { next(e); }
};

// Separate facility reports plus the combined view for one site.
exports.combined = async (req, res, next) => {
  try {
    const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: String(req.query.locationId) }] } });
    if (!visible) throw fail("You cannot access this site.", 403);
    const reports = await prisma.clientAuditReport.findMany({ where: { job: { locationId: String(req.query.locationId), isDemo: req.query.demo === "true" } }, select: reportSelect, orderBy: { generatedAt: "desc" } });
    const latestByFacility = {};
    for (const r of reports) if (!latestByFacility[r.job.facilityType || "ALL"]) latestByFacility[r.job.facilityType || "ALL"] = brief(r);
    const list = Object.values(latestByFacility).filter((r) => r.percent !== null);
    const percent = list.length ? Math.round((list.reduce((s, r) => s + r.percent, 0) / list.length) * 10) / 10 : null;
    res.json({ success: true, facilities: Object.values(latestByFacility), combinedPercent: percent });
  } catch (e) { next(e); }
};

exports.riskRegister = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    where.response = { session: { job: { location: await locationWhereForUser(req.user), ...(req.query.locationId ? { locationId: String(req.query.locationId) } : {}) } } };
    if (req.query.companyId) where.response = { session: { job: { location: { AND: [await locationWhereForUser(req.user), { programme: { companyId: String(req.query.companyId) } }] } } } };
    const ncs = await prisma.clientAuditNonCompliance.findMany({ where, orderBy: { createdAt: "desc" }, take: 500,
      select: { id: true, ncNumber: true, status: true, severity: true, priority: true, observation: true, recommendation: true, createdAt: true, closedAt: true, targetDate: true, snapshotItemId: true,
        response: { select: { closedOnSpot: true, session: { select: { job: { select: { id: true, isDemo: true, facilityType: true, location: { select: { id: true, dealerName: true, locationName: true, locationCode: true, zone: true, regionalOffice: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } } } } } } } } } });
    const items = await prisma.locationChecklistSnapshotItem.findMany({ where: { id: { in: [...new Set(ncs.map((n) => n.snapshotItemId))] } }, select: { id: true, questionCode: true, itemData: true } });
    const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
    const now = new Date();
    res.json({ success: true, register: ncs.map((n) => {
      const dueAt = closureDueAt(n.createdAt, n.priority); const open = !["CLOSED", "VOID"].includes(n.status);
      return { id: n.id, ncNumber: n.ncNumber, status: n.status, risk: RISK_BY_SEVERITY[n.severity] || n.severity, mahindraPriority: PRIORITY_LABEL[n.priority] || n.priority, priorityCode: n.priority,
        observation: n.observation, recommendation: n.recommendation, createdAt: n.createdAt, closedAt: n.closedAt, dueAt, overdue: open && dueAt < now, closedOnSpot: n.response?.closedOnSpot || false,
        questionCode: itemById[n.snapshotItemId]?.questionCode, question: itemById[n.snapshotItemId]?.itemData?.questionText, discipline: itemById[n.snapshotItemId]?.itemData?.discipline,
        facilityType: n.response.session.job.facilityType, isDemo: n.response.session.job.isDemo, site: n.response.session.job.location };
    }) });
  } catch (e) { next(e); }
};

exports.myReports = async (req, res, next) => {
  try {
    const reports = await prisma.clientAuditReport.findMany({ where: { status: { in: ["PUBLISHED", "SIGNED_OFF"] }, job: { isDemo: false, location: await locationWhereForUser(req.user) } }, select: reportSelect, orderBy: { generatedAt: "desc" }, take: 200 });
    res.json({ success: true, reports: reports.map(brief) });
  } catch (e) { next(e); }
};

exports.helpers = { reportSelect, analyse, brief, openRevision };

const DISCIPLINE = { INFRASTRUCTURE: "Infrastructure", FIRE: "Fire & Life Safety", ELECTRICAL: "Electrical", THERMOGRAPHY: "Thermography" };
const FACILITY = { SHOWROOM: "Showroom", WORKSHOP: "Workshop", STOCKYARD: "Stockyard" };
const dt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

// A readable audit report: where the site sits, scores by audit type, the findings with both
// classifications, and the dealer sign-off.
exports.reportPdf = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id }, select: { ...reportSelect, signatureUrl: true } });
    if (!report) throw fail("Report not found.", 404);
    if (req.user.role !== "ADMIN") {
      const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: report.job.location.id }] } });
      if (!visible || !["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("You cannot access this report.", 403);
    }
    const { scoring } = analyse(report);
    const ncs = await prisma.clientAuditNonCompliance.findMany({ where: { jobId: report.job.id }, orderBy: { createdAt: "asc" }, select: { ncNumber: true, status: true, severity: true, priority: true, observation: true, recommendation: true, createdAt: true, snapshotItemId: true } });
    const itemById = Object.fromEntries(report.job.snapshot.items.map((i) => [i.id, i]));
    const loc = report.job.location; const company = loc.programme.company.companyName;
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename=${report.reportNumber}.pdf`);
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true }); doc.pipe(res);
    const W = doc.page.width - 96; const NAVY = "#1F3A5F"; const GREY = "#666";
    const ensure = (h) => { if (doc.y + h > doc.page.height - 70) doc.addPage(); };
    doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("BEXEX AUDIT PORTAL", 48, 30, { characterSpacing: 2 });
    doc.fillColor("#111").fontSize(20).text(`${FACILITY[report.job.facilityType] || "Site"} audit report`, 48, 46);
    doc.font("Helvetica").fontSize(10).fillColor(GREY).text(`${report.reportNumber} · revision ${report.revision}${report.job.isDemo ? " · DEMO" : ""} · ${dt(report.generatedAt)}`, 48, 74);
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(13).text(`${loc.dealerName} · ${loc.locationName}`, 48, 98);
    doc.font("Helvetica").fontSize(9.5).fillColor(GREY).text(`${company}  ›  Zone ${loc.zone}  ›  ${loc.regionalOffice}  ›  ${loc.locationName} (${loc.locationCode})`, 48, 116);
    doc.text(`Auditors: ${report.job.assignments.map((a) => `${a.auditor.fullName} (Track ${a.track})`).join(", ")}   ·   Checklist v${report.job.snapshot.checklistVersion}`, 48, 130, { width: W });
    // headline
    let y = 160;
    doc.roundedRect(48, y, W, 70, 10).fill("#f3f5f7");
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(30).text(scoring.percent !== null ? `${scoring.percent}%` : "—", 64, y + 14);
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text("Overall score", 66, y + 50);
    doc.font("Helvetica-Bold").fontSize(24).fillColor(NAVY).text(scoring.rating || "—", 200, y + 16); doc.font("Helvetica").fontSize(9).fillColor(GREY).text("Rating", 202, y + 50);
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(13).text(scoring.riskLevel || "—", 300, y + 22); doc.font("Helvetica").fontSize(9).fillColor(GREY).text("Risk level", 300, y + 50);
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(13).text(`${scoring.counts.nonCompliant}`, 440, y + 22); doc.font("Helvetica").fontSize(9).fillColor(GREY).text(`findings · ${scoring.counts.closedOnSpot} closed on the spot`, 440, y + 50, { width: 100 });
    doc.y = y + 90;
    // disciplines
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Score by audit type", 48, doc.y);
    doc.moveDown(0.6);
    for (const [k, v] of Object.entries(scoring.disciplines)) {
      ensure(24); const yy = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#222").text(`${DISCIPLINE[k] || k}`, 48, yy, { width: 130 });
      doc.roundedRect(184, yy + 2, 260, 9, 4).fill("#e6e8eb"); if (v.percent) doc.roundedRect(184, yy + 2, Math.max(6, (260 * v.percent) / 100), 9, 4).fill(v.percent >= 80 ? "#63C174" : v.percent >= 60 ? "#f0b429" : "#e5484d");
      doc.fillColor("#111").font("Helvetica-Bold").text(v.percent !== null ? `${v.percent}%` : "—", 452, yy, { width: 40, align: "right" });
      doc.font("Helvetica").fillColor(GREY).fontSize(8.5).text(`${v.total} items · ${v.nonCompliant} findings`, 48, yy + 12);
      doc.y = yy + 28;
    }
    // findings
    ensure(60); doc.moveDown(0.5);
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Findings register", 48, doc.y);
    doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text("Each finding carries a risk level and a Mahindra priority. Closure targets: 2 weeks, 4–6 weeks, one quarter, routine.", 48, doc.y + 2, { width: W });
    doc.moveDown(0.8);
    if (!ncs.length) doc.font("Helvetica").fontSize(10).fillColor("#222").text("No findings were raised.");
    const RISK = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" }; const PRI = { IMPORTANT_URGENT: "Important & Urgent", URGENT: "Urgent", IMPORTANT: "Important", REST: "Rest" }; const DAYS = { IMPORTANT_URGENT: 14, URGENT: 42, IMPORTANT: 90, REST: 180 };
    for (const n of ncs) {
      const item = itemById[n.snapshotItemId]; ensure(70);
      const yy = doc.y; const due = new Date(new Date(n.createdAt).getTime() + (DAYS[n.priority] || 90) * 86400000);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111").text(`${n.ncNumber} · ${item?.questionCode || ""}`, 48, yy, { width: 300 });
      doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text(`${RISK[n.severity] || n.severity} risk · ${PRI[n.priority] || n.priority} · due ${dt(due)} · ${n.status.replaceAll("_", " ").toLowerCase()}`, 48, doc.y, { width: W });
      doc.font("Helvetica").fontSize(9.5).fillColor("#222").text(item?.itemData?.questionText || "", 48, doc.y + 2, { width: W });
      doc.fillColor("#444").text(`Found: ${n.observation || "—"}`, 48, doc.y + 2, { width: W });
      if (n.recommendation) doc.text(`Action: ${n.recommendation}`, 48, doc.y + 1, { width: W });
      doc.moveTo(48, doc.y + 6).lineTo(48 + W, doc.y + 6).strokeColor("#e4e8ed").stroke(); doc.y += 12;
    }
    // sign-off
    ensure(120); doc.moveDown(0.6);
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Dealer sign-off", 48, doc.y);
    doc.moveDown(0.4);
    if (report.signedByName) {
      doc.font("Helvetica").fontSize(10).fillColor("#222").text(`${report.signedByName}, ${report.signedByDesignation || ""} · ${dt(report.signedAt)}`);
      if (report.debriefNotes) doc.fillColor("#444").text(`Debrief notes: ${report.debriefNotes}`, { width: W });
      const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(report.signatureUrl || ""); if (m) { ensure(70); doc.image(Buffer.from(m[2], "base64"), 48, doc.y + 6, { fit: [160, 50] }); doc.y += 62; }
    } else doc.font("Helvetica").fontSize(10).fillColor(GREY).text("Not signed off yet. The senior dealer representative signs after the closing debrief.");
    // page footers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); doc.font("Helvetica").fontSize(8).fillColor("#999").text(`${report.reportNumber} · ${loc.locationName} · Page ${i + 1} of ${range.count}`, 48, doc.page.height - 36, { width: W, align: "center", lineBreak: false }); }
    doc.end();
  } catch (e) { next(e); }
};
