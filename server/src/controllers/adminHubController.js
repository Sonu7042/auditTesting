const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { helpers: governance } = require("./governanceController");

// Read-only views for Back-Admin that join the stages together: one inbox of everything waiting for a decision,
// the network hierarchy, the tools (instruments) register with calibration dates, and auditor performance.
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const DAY = 864e5;

/* ---------- Reviews & Approvals: one inbox across all stages ---------- */
exports.approvals = async (req, res, next) => {
  try {
    const [onboarding, siteSetups, reports, corrections, proposals, changes, certificates] = await Promise.all([
      prisma.auditorOnboarding.findMany({ where: { status: { in: ["UNDER_REVIEW", "AWAITING_APPROVAL"] } }, include: { user: { select: { id: true, fullName: true } } }, orderBy: { updatedAt: "asc" } }),
      prisma.siteSetupRequest.findMany({ where: { status: "SUBMITTED" }, include: { company: { select: { companyName: true } } }, orderBy: { submittedAt: "asc" } }),
      prisma.clientAuditReport.findMany({ where: { status: { in: ["DRAFT", "UNDER_REVIEW", "APPROVED", "RETURNED"] }, job: { isDemo: false } }, select: { id: true, reportNumber: true, status: true, generatedAt: true, job: { select: { facilityType: true, location: { select: { locationName: true } } } } }, orderBy: { generatedAt: "asc" } }),
      prisma.clientAuditReportCorrection.findMany({ where: { status: { in: ["SUBMITTED", "OPEN"] } }, select: { id: true, status: true, category: true, instruction: true, reportId: true, createdAt: true, report: { select: { reportNumber: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.checklistProposal.findMany({ where: { status: { in: ["PENDING_ADMIN", "PENDING_SGS"] } }, orderBy: { createdAt: "asc" } }),
      prisma.siteChangeRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
      prisma.certificate.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" } }),
    ]);
    const ids = [...new Set(changes.map((c) => c.locationId))];
    const locs = ids.length ? await prisma.dealerLocation.findMany({ where: { id: { in: ids } }, select: { id: true, locationName: true } }) : [];
    const locName = Object.fromEntries(locs.map((l) => [l.id, l.locationName]));
    const age = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY));
    const section = (key, title, link, items) => ({ key, title, link, count: items.length, items: items.slice(0, 6) });
    const sections = [
      section("auditors", "Auditor onboarding", "/admin-dashboard/auditor-onboarding", onboarding.map((o) => ({ id: o.userId, title: o.user.fullName, detail: o.status === "UNDER_REVIEW" ? "Quiz and demo submitted: review needed" : "Reviewed: final approval needed", ageDays: age(o.updatedAt), link: `/admin-dashboard/auditor-onboarding/${o.userId}` }))),
      section("sites", "Site set-ups", "/admin-dashboard/site-onboarding/review", siteSetups.map((r) => ({ id: r.id, title: `${r.data?.identity?.locationName || "Site"} (${r.data?.identity?.locationCode || "no code"})`, detail: `${r.company.companyName} · ${r.readiness}% ready`, ageDays: age(r.submittedAt || r.updatedAt), link: `/admin-dashboard/site-onboarding/request/${r.id}` }))),
      section("reports", "Audit reports (QC)", "/admin-dashboard/qc", reports.map((r) => ({ id: r.id, title: `${r.reportNumber} · ${r.job.location.locationName}`, detail: `${(r.job.facilityType || "Site").toLowerCase()} · ${r.status.replaceAll("_", " ").toLowerCase()}`, ageDays: age(r.generatedAt), link: `/admin-dashboard/qc/report/${r.id}` }))),
      section("corrections", "Report corrections", "/admin-dashboard/client-audit-reports", corrections.map((c) => ({ id: c.id, title: `${c.report.reportNumber} · ${c.category}`, detail: c.status === "SUBMITTED" ? "Auditor corrected: review needed" : "Waiting for the auditor", ageDays: age(c.createdAt), link: "/admin-dashboard/client-audit-reports" }))),
      section("proposals", "Proposed checklist points", "/admin-dashboard/checklist-proposals", proposals.map((p) => ({ id: p.id, title: p.questionText.slice(0, 70), detail: p.status === "PENDING_ADMIN" ? "Back-Admin review" : "SGS Manager sign-off", ageDays: age(p.createdAt), link: "/admin-dashboard/checklist-proposals" }))),
      section("changes", "Site detail change requests", "/admin-dashboard/site-change-requests", changes.map((c) => ({ id: c.id, title: locName[c.locationId] || "Site", detail: `${Object.keys(c.changes).length} field(s): ${c.reason.slice(0, 50)}`, ageDays: age(c.createdAt), link: "/admin-dashboard/site-change-requests" }))),
      section("certificates", "Awards & certificates", "/admin-dashboard/awards", certificates.map((c) => ({ id: c.id, title: `${c.nodeName} · rank ${c.rank}`, detail: `${c.level} · ${c.metric}`, ageDays: age(c.createdAt), link: "/admin-dashboard/awards" }))),
    ];
    res.json({ success: true, total: sections.reduce((a, s) => a + s.count, 0), sections });
  } catch (e) { next(e); }
};

/* ---------- Hierarchy: company > zone > regional office > site ---------- */
exports.hierarchy = async (req, res, next) => {
  try {
    const [sites, users] = await Promise.all([governance.siteStats(req.user), prisma.userScope.findMany({ include: { user: { select: { role: true, status: true } } } })]);
    const tally = (list) => ({ siteCount: list.length, auditedCount: list.filter((s) => s.audited).length, openCritical: list.reduce((a, s) => a + s.openCritical, 0), overdue: list.reduce((a, s) => a + s.overdue, 0), overall: (() => { const v = list.filter((s) => s.overall != null).map((s) => s.overall); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; })() });
    const group = (list, keyOf) => { const m = new Map(); for (const s of list) { const k = keyOf(s); (m.get(k) || m.set(k, []).get(k)).push(s); } return [...m.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))); };
    const usersAt = (match) => users.filter((u) => u.user.status && match(u)).length;
    const tree = group(sites, (s) => s.companyId).map(([companyId, list]) => ({
      level: "COMPANY", key: companyId, name: list[0].company, ...tally(list), users: usersAt((u) => u.companyId === companyId),
      children: group(list, (s) => s.zone).map(([zone, zl]) => ({
        level: "ZONE", key: zone, name: zone, ...tally(zl), users: usersAt((u) => u.companyId === companyId && u.zone === zone && !u.regionalOffice),
        children: group(zl, (s) => s.regionalOffice).map(([ro, rl]) => ({
          level: "REGIONAL_OFFICE", key: ro, name: ro, ...tally(rl), users: usersAt((u) => u.companyId === companyId && u.zone === zone && u.regionalOffice === ro && !u.locationId),
          children: rl.map((s) => ({ level: "SITE", key: s.id, name: s.locationName, sub: `${s.dealerName} · ${s.locationCode}`, locationId: s.id, ...tally([s]), rating: s.rating || null, users: usersAt((u) => u.locationId === s.id), children: [] })),
        })),
      })),
    }));
    res.json({ success: true, tree, totals: tally(sites) });
  } catch (e) { next(e); }
};

/* ---------- Instruments: every site's tools register with calibration dates ---------- */
const toolStatus = (tool, today) => {
  if (!tool.validTill) return "NO_DATE";
  const days = Math.ceil((new Date(tool.validTill) - today) / DAY);
  return days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING" : "VALID";
};

exports.instruments = async (req, res, next) => {
  try {
    const where = str(req.query.companyId) ? { programme: { companyId: str(req.query.companyId) } } : {};
    const locations = await prisma.dealerLocation.findMany({ where, select: { id: true, locationName: true, locationCode: true, zone: true, regionalOffice: true, profile: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } });
    const today = new Date(); const rows = [];
    for (const l of locations) for (const t of (l.profile?.tools || [])) {
      const status = toolStatus(t, today);
      const short = t.available !== "" && t.available !== undefined && Number(t.available) < Number(t.required);
      rows.push({ locationId: l.id, site: l.locationName, code: l.locationCode, zone: l.zone, regionalOffice: l.regionalOffice, company: l.programme.company.companyName, companyId: l.programme.companyId, tool: t.name, category: t.category, required: t.required, available: t.available, validTill: t.validTill || null, status, daysLeft: t.validTill ? Math.ceil((new Date(t.validTill) - today) / DAY) : null, short });
    }
    const filter = str(req.query.status);
    const shown = filter ? rows.filter((r) => (filter === "SHORT" ? r.short : r.status === filter)) : rows;
    const count = (f) => rows.filter(f).length;
    res.json({ success: true, totals: { tools: rows.length, valid: count((r) => r.status === "VALID"), expiring: count((r) => r.status === "EXPIRING"), expired: count((r) => r.status === "EXPIRED"), noDate: count((r) => r.status === "NO_DATE"), short: count((r) => r.short), sites: locations.length }, rows: shown.sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999)) });
  } catch (e) { next(e); }
};

/* ---------- Performance: auditor scores, QC history, refresher dates ---------- */
exports.performance = async (req, res, next) => {
  try {
    const auditors = await prisma.user.findMany({ where: { role: "AUDITOR" }, include: { auditorOnboarding: true, auditorQualification: true } });
    const scores = await prisma.auditorScore.findMany({ orderBy: { createdAt: "desc" } });
    const jobs = await prisma.clientAuditJobAssignment.groupBy({ by: ["auditorId"], _count: { _all: true }, where: { job: { isDemo: false, status: "COMPLETED" } } });
    const done = Object.fromEntries(jobs.map((j) => [j.auditorId, j._count._all]));
    const rows = auditors.map((u) => {
      const mine = scores.filter((s) => s.userId === u.id); const qc = mine.filter((s) => s.source === "AUDIT_REVIEW");
      const recent = qc.slice(0, 3); const rolling = recent.length ? Math.round((recent.reduce((a, s) => a + s.score, 0) / recent.length) * 10) / 10 : (u.auditorOnboarding?.reviewScore ?? null);
      const exp = u.auditorQualification?.certificationExpiresAt || null;
      const days = exp ? Math.ceil((new Date(exp) - Date.now()) / DAY) : null;
      return { id: u.id, name: u.fullName, status: u.auditorOnboarding?.status || "LEGACY", skills: u.auditorQualification?.skills || [], score: rolling, tag: rolling === null ? null : rolling >= 80 ? "ELIGIBLE" : rolling >= 60 ? "RETRAIN" : "BLOCKED", auditsDone: done[u.id] || 0, qcReviews: qc.length, lastScores: qc.slice(0, 5).map((s) => ({ score: s.score, at: s.createdAt, ref: s.reference })).reverse(), certificationExpiresAt: exp, daysLeft: days, refresher: days === null ? null : days < 0 ? "EXPIRED" : days <= 30 ? "DUE" : "OK", quizAttempts: u.auditorOnboarding?.quizAttempts ?? 0 };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    res.json({ success: true, rows, totals: { auditors: rows.length, eligible: rows.filter((r) => r.tag === "ELIGIBLE").length, retrain: rows.filter((r) => r.tag === "RETRAIN").length, blocked: rows.filter((r) => r.tag === "BLOCKED").length, refresherDue: rows.filter((r) => r.refresher === "DUE" || r.refresher === "EXPIRED").length } });
  } catch (e) { next(e); }
};

/* ---------- Demo windows: see the portal exactly as another role sees it, without a password and without changing anything ---------- */
const PERSONAS = [
  ["AUDITOR", "Auditor portal", "Tablet-style portal: training and certificate, calendar, New Report, reports and findings."],
  ["SITE_USER", "Site user portal", "One site only: its dashboard, findings of the cycle audit, CAPA, notifications, calendar and change requests."],
  ["REGIONAL_MANAGER", "Regional manager portal", "One regional office: its sites, rankings, closure tracking and risk register."],
  ["ZONAL_MANAGER", "Zonal manager portal", "One zone: regional offices and sites, rankings and closure tracking."],
  ["CORPORATE_MANAGER", "Corporate portal", "The whole company: network dashboard, drill-down to every site, awards and certificates."],
];

const pickPersona = async (role) => {
  const users = await prisma.user.findMany({ where: { role, status: true }, include: { scopes: true, auditorOnboarding: true }, orderBy: { createdAt: "asc" } });
  const ok = users.filter((u) => (role === "AUDITOR" ? u.auditorOnboarding?.status === "APPROVED" : u.scopes.length > 0));
  return ok[0] || null;
};

exports.demoPersonas = async (req, res, next) => {
  try {
    const out = [];
    for (const [role, title, description] of PERSONAS) { const u = await pickPersona(role); out.push({ role, title, description, available: Boolean(u), user: u ? { fullName: u.fullName, username: u.username } : null }); }
    res.json({ success: true, personas: out });
  } catch (e) { next(e); }
};

exports.demoSession = async (req, res, next) => {
  try {
    const role = str(req.body.role).toUpperCase();
    if (!PERSONAS.some(([r]) => r === role)) return res.status(400).json({ message: "Choose a portal to preview." });
    const u = await pickPersona(role);
    if (!u) return res.status(404).json({ message: "No active user with this role exists yet. Add one in Access & Roles, or import users from Excel." });
    // Read-only and short-lived: the middleware refuses every change made with a demo token.
    const token = jwt.sign({ id: u.id, role: u.role, demo: true, by: req.user.id }, process.env.JWT_SECRET, { expiresIn: "4h" });
    res.json({ success: true, token, user: { id: u.id, fullName: u.fullName, username: u.username, email: u.email, role: u.role, mustChangePassword: false } });
  } catch (e) { next(e); }
};
