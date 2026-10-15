const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { issueCredentials, newPassword, hashPassword } = require("../utils/credentials");
const prisma = require("../config/prisma");
const { locationWhereForUser } = require("../utils/scope");
const { scoreJob } = require("../utils/auditScoring");
const { helpers: qc } = require("./clientQcController");

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
const SAFETY = ["FIRE", "ELECTRICAL", "THERMOGRAPHY"];

// Stored on the report the first time it is needed, so dashboards read a number
// instead of re-scoring every response.
const snapshotOf = async (report) => {
  if (report.scoreSnapshot) return report.scoreSnapshot;
  const full = await prisma.clientAuditReport.findUnique({ where: { id: report.id }, select: qc.reportSelect });
  const scoring = scoreJob(full.job, full.job.sessions);
  const snapshot = { percent: scoring.percent, rating: scoring.rating, disciplines: Object.fromEntries(Object.entries(scoring.disciplines).map(([k, v]) => [k, v.percent])), nonCompliant: scoring.counts.nonCompliant, critical: scoring.counts.severity.CRITICAL };
  await prisma.clientAuditReport.update({ where: { id: report.id }, data: { scoreSnapshot: snapshot } });
  return snapshot;
};

// One entry per site, from the latest counted report of each facility.
const siteStats = async (user, { from, to } = {}) => {
  const locWhere = await locationWhereForUser(user);
  const reportWhere = { status: { in: ["APPROVED", "PUBLISHED", "SIGNED_OFF"] }, job: { isDemo: false, location: locWhere } };
  if (from || to) reportWhere.generatedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const [locations, reports] = await Promise.all([
    prisma.dealerLocation.findMany({ where: locWhere, select: { id: true, locationName: true, locationCode: true, dealerName: true, zone: true, regionalOffice: true, state: true, programme: { select: { companyId: true, company: { select: { companyName: true } } } } } }),
    prisma.clientAuditReport.findMany({ where: reportWhere, select: { id: true, generatedAt: true, scoreSnapshot: true, job: { select: { locationId: true, facilityType: true } } }, orderBy: { generatedAt: "desc" } }),
  ]);
  const ncs = await prisma.clientAuditNonCompliance.findMany({ where: { response: { session: { job: { isDemo: false, location: locWhere } } } }, select: { status: true, severity: true, priority: true, createdAt: true, response: { select: { session: { select: { job: { select: { locationId: true } } } } } } } });
  const closureDays = { IMPORTANT_URGENT: 14, URGENT: 42, IMPORTANT: 90, REST: 180 };
  const now = Date.now();
  const ncBySite = {};
  for (const n of ncs) {
    const id = n.response.session.job.locationId; const b = (ncBySite[id] ||= { total: 0, closed: 0, openCritical: 0, overdue: 0 });
    b.total += 1; const closed = ["CLOSED", "VOID"].includes(n.status);
    if (closed) b.closed += 1; else { if (n.severity === "CRITICAL") b.openCritical += 1; if (new Date(n.createdAt).getTime() + (closureDays[n.priority] || 90) * 86400000 < now) b.overdue += 1; }
  }
  const latest = {};
  for (const r of reports) { const key = `${r.job.locationId}:${r.job.facilityType || "SITE"}`; if (!latest[key]) latest[key] = r; }
  const bySite = {};
  for (const r of Object.values(latest)) (bySite[r.job.locationId] ||= []).push(await snapshotOf(r));
  const historyBySite = {};
  for (const r of reports) { const sn = await snapshotOf(r); if (sn.percent != null) (historyBySite[r.job.locationId] ||= []).push({ at: r.generatedAt, percent: sn.percent }); }
  return locations.map((l) => {
    const snaps = bySite[l.id] || []; const nc = ncBySite[l.id] || { total: 0, closed: 0, openCritical: 0, overdue: 0 };
    const disc = {}; for (const k of ["INFRASTRUCTURE", ...SAFETY]) { const v = avg(snaps.map((s) => s.disciplines?.[k]).filter((x) => x != null)); if (v !== null) disc[k] = v; }
    return { ...l, history: historyBySite[l.id] || [], company: l.programme.company.companyName, companyId: l.programme.companyId, audited: snaps.length > 0, overall: avg(snaps.map((s) => s.percent).filter((x) => x != null)), safety: avg(SAFETY.map((k) => disc[k]).filter((x) => x != null)), disciplines: disc, rating: snaps.length ? (snaps.map((s) => s.rating).filter(Boolean).sort().slice(-1)[0] || null) : null, ncTotal: nc.total, ncClosed: nc.closed, openCritical: nc.openCritical, overdue: nc.overdue, closureRate: nc.total ? Math.round((nc.closed / nc.total) * 100) : null };
  });
};

const aggregate = (sites, extra) => {
  const audited = sites.filter((s) => s.audited);
  return { ...extra, siteCount: sites.length, auditedCount: audited.length, overall: avg(audited.map((s) => s.overall).filter((x) => x != null)), safety: avg(audited.map((s) => s.safety).filter((x) => x != null)), openCritical: sites.reduce((a, s) => a + s.openCritical, 0), overdue: sites.reduce((a, s) => a + s.overdue, 0), closureRate: (() => { const t = sites.reduce((a, s) => a + s.ncTotal, 0); const c = sites.reduce((a, s) => a + s.ncClosed, 0); return t ? Math.round((c / t) * 100) : null; })() };
};

const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
exports.summary = async (req, res, next) => {
  try {
    const { companyId, zone, ro } = req.query;
    const all = await siteStats(req.user);
    const companies = [...new Map(all.map((s) => [s.companyId, s.company])).entries()].map(([id, name]) => ({ id, name }));
    let sites = all;
    if (companyId) sites = sites.filter((s) => s.companyId === companyId);
    if (zone) sites = sites.filter((s) => s.zone === zone);
    if (ro) sites = sites.filter((s) => s.regionalOffice === ro);
    const level = ro ? "site" : zone ? "ro" : "zone";
    let nodes;
    if (level === "site") nodes = sites.map((s) => ({ key: s.id, name: s.locationName, sub: `${s.dealerName} · ${s.locationCode}`, level: "site", locationId: s.id, siteCount: 1, auditedCount: s.audited ? 1 : 0, overall: s.overall, safety: s.safety, rating: s.rating, disciplines: s.disciplines, openCritical: s.openCritical, overdue: s.overdue, closureRate: s.closureRate }));
    else {
      const keyOf = level === "zone" ? (s) => s.zone : (s) => s.regionalOffice;
      const groups = new Map();
      for (const s of sites) { const k = keyOf(s); (groups.get(k) || groups.set(k, []).get(k)).push(s); }
      nodes = [...groups.entries()].map(([k, list]) => aggregate(list, { key: k, name: k, level, sub: level === "ro" ? `Zone ${zone}` : [...new Set(list.map((x) => x.company))].join(", ") }));
    }
    const audited = sites.filter((s) => s.audited);
    const discAvg = {}; for (const d of ["INFRASTRUCTURE", ...SAFETY]) discAvg[d] = avg(audited.map((s) => s.disciplines[d]).filter((x) => x != null));
    // Monthly average of every counted audit in this part of the network.
    const months = {};
    for (const s of sites) for (const h of s.history) (months[monthKey(h.at)] ||= []).push(h.percent);
    const trend = Object.entries(months).sort().map(([month, v]) => ({ month, overall: avg(v), audits: v.length }));
    const distribution = { "A+": 0, A: 0, B: 0, C: 0, D: 0 };
    audited.forEach((s) => { if (s.rating && distribution[s.rating] !== undefined) distribution[s.rating] += 1; });
    const brief = (s) => ({ id: s.id, name: s.locationName, dealerName: s.dealerName, zone: s.zone, regionalOffice: s.regionalOffice, companyId: s.companyId, company: s.company, overall: s.overall, openCritical: s.openCritical, overdue: s.overdue });
    const attention = [...audited].sort((a, b) => (b.openCritical * 5 + b.overdue) - (a.openCritical * 5 + a.overdue) || a.overall - b.overall).filter((s) => s.openCritical || s.overdue || s.overall < 75).slice(0, 5).map(brief);
    const best = [...audited].sort((a, b) => b.overall - a.overall).slice(0, 3).map(brief);
    res.json({ success: true, level, nodes: nodes.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)), totals: aggregate(sites, {}), disciplines: discAvg, trend, distribution, attention, best, companies, filters: { companyId, zone, ro }, context: { companyName: companyId ? companies.find((c) => c.id === companyId)?.name : null } });
  } catch (e) { next(e); }
};

const rank = (sites, level, metric) => {
  const key = { site: (s) => s.id, ro: (s) => `${s.zone}|${s.regionalOffice}`, zone: (s) => s.zone };
  const groups = new Map();
  for (const s of sites.filter((x) => x.audited)) { const k = key[level](s); (groups.get(k) || groups.set(k, []).get(k)).push(s); }
  const rows = [...groups.entries()].map(([k, list]) => {
    const f = list[0]; const score = avg(list.map((s) => s[metric]).filter((x) => x != null));
    return { key: k, nodeKey: `${level.toUpperCase()}:${k}`, name: level === "site" ? f.locationName : level === "ro" ? f.regionalOffice : f.zone, sub: level === "site" ? f.dealerName : level === "ro" ? `Zone ${f.zone}` : f.company, company: f.company, score, siteCount: list.length, openCritical: list.reduce((a, s) => a + s.openCritical, 0), overdue: list.reduce((a, s) => a + s.overdue, 0), closureRate: avg(list.map((s) => s.closureRate).filter((x) => x != null)) };
  }).filter((r) => r.score !== null).sort((a, b) => b.score - a.score || a.openCritical - b.openCritical);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
};

exports.leaderboard = async (req, res, next) => {
  try {
    const level = ["site", "ro", "zone"].includes(req.query.level) ? req.query.level : "site";
    const metric = req.query.metric === "safety" ? "safety" : "overall";
    const admin = req.user.role === "ADMIN";
    // Rankings are computed across the peer group, so a site can see its own rank. Peers outside the
    // user's scope are shown by rank only.
    let sites = await siteStats({ role: "ADMIN", id: req.user.id });
    const mineSites = admin ? sites : await siteStats(req.user);
    const mineIds = new Set(mineSites.map((s) => s.id));
    if (!admin && mineSites.length) {
      if (level === "site") { const ros = new Set(mineSites.map((s) => `${s.zone}|${s.regionalOffice}`)); sites = sites.filter((s) => ros.has(`${s.zone}|${s.regionalOffice}`)); }
      else if (level === "ro") { const zones = new Set(mineSites.map((s) => s.zone)); sites = sites.filter((s) => zones.has(s.zone)); }
      else { const cos = new Set(mineSites.map((s) => s.companyId)); sites = sites.filter((s) => cos.has(s.companyId)); }
    }
    if (req.query.companyId) sites = sites.filter((s) => s.companyId === req.query.companyId);
    if (req.query.zone) sites = sites.filter((s) => s.zone === req.query.zone);
    if (req.query.ro) sites = sites.filter((s) => s.regionalOffice === req.query.ro);
    const rows = rank(sites, level, metric).map((r) => {
      const members = sites.filter((s) => (level === "site" ? s.id === r.key : level === "ro" ? `${s.zone}|${s.regionalOffice}` === r.key : s.zone === r.key));
      const mine = admin || members.some((m) => mineIds.has(m.id));
      return mine ? { ...r, mine: !admin } : { ...r, name: `${{ site: "Site", ro: "Regional office", zone: "Zone" }[level]} ranked #${r.rank}`, sub: "", openCritical: null, overdue: null, masked: true };
    });
    res.json({ success: true, level, metric, rows, notAudited: sites.filter((s) => !s.audited).length });
  } catch (e) { next(e); }
};

/* ----- awards ----- */
exports.listPeriods = async (req, res, next) => {
  try {
    const periods = await prisma.awardPeriod.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { certificates: true } } } });
    res.json({ success: true, periods });
  } catch (e) { next(e); }
};

exports.createPeriod = async (req, res, next) => {
  try {
    const startsAt = new Date(req.body.startsAt); const endsAt = new Date(req.body.endsAt);
    if (!str(req.body.label) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw fail("Enter a label and a valid date range.");
    const topN = Math.min(10, Math.max(1, Number(req.body.topN || 3)));
    const period = await prisma.awardPeriod.create({ data: { label: str(req.body.label), type: str(req.body.type).toUpperCase() === "YEAR" ? "YEAR" : "QUARTER", startsAt, endsAt, topN } });
    res.status(201).json({ success: true, period });
  } catch (e) { next(e); }
};

exports.closePeriod = async (req, res, next) => {
  try {
    const period = await prisma.awardPeriod.findUnique({ where: { id: req.params.id } });
    if (!period) throw fail("Period not found.", 404);
    if (period.status !== "OPEN") throw fail("This period is already closed.");
    // Rankings are frozen at close so later corrections cannot change published awards.
    const sites = await siteStats(req.user, { from: period.startsAt, to: period.endsAt });
    const snapshot = {}; const certs = [];
    for (const level of ["site", "ro", "zone"]) for (const metric of ["overall", "safety"]) {
      const rows = rank(sites, level, metric); snapshot[`${level}:${metric}`] = rows;
      for (const r of rows.slice(0, period.topN)) certs.push({ periodId: period.id, level: level.toUpperCase(), metric: metric.toUpperCase(), rank: r.rank, score: r.score, nodeKey: r.nodeKey, nodeName: r.name, companyName: r.company, code: `BXC-${crypto.randomBytes(4).toString("hex").toUpperCase()}` });
    }
    await prisma.$transaction([
      prisma.awardPeriod.update({ where: { id: period.id }, data: { status: "CLOSED", closedAt: new Date(), snapshot } }),
      prisma.certificate.createMany({ data: certs }),
    ]);
    res.json({ success: true, message: `Period closed. ${certs.length} draft certificate(s) created for approval.`, count: certs.length });
  } catch (e) { next(e); }
};

exports.listCertificates = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.periodId) where.periodId = String(req.query.periodId);
    let certs = await prisma.certificate.findMany({ where, include: { period: { select: { label: true, type: true } } }, orderBy: [{ createdAt: "desc" }, { rank: "asc" }] });
    if (req.user.role !== "ADMIN") {
      const sites = await siteStats(req.user);
      const mine = new Set(); sites.forEach((s) => { mine.add(`SITE:${s.id}`); mine.add(`RO:${s.zone}|${s.regionalOffice}`); mine.add(`ZONE:${s.zone}`); });
      certs = certs.filter((c) => c.status === "APPROVED" && mine.has(c.nodeKey));
    }
    res.json({ success: true, certificates: certs });
  } catch (e) { next(e); }
};

exports.approveCertificate = async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({ where: { id: req.params.id } });
    if (!cert) throw fail("Certificate not found.", 404);
    const status = str(req.body.decision).toUpperCase() === "REJECT" ? "REJECTED" : "APPROVED";
    await prisma.certificate.update({ where: { id: cert.id }, data: { status, issuedAt: status === "APPROVED" ? new Date() : null, approvedById: req.user.id } });
    res.json({ success: true, message: status === "APPROVED" ? "Certificate issued." : "Certificate withdrawn." });
  } catch (e) { next(e); }
};

exports.certificatePdf = async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({ where: { id: req.params.id }, include: { period: true } });
    if (!cert) throw fail("Certificate not found.", 404);
    if (cert.status !== "APPROVED" && req.user.role !== "ADMIN") throw fail("This certificate has not been issued.", 403);
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename=${cert.code}.pdf`);
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 }); doc.pipe(res);
    const W = doc.page.width; const H = doc.page.height;
    doc.rect(24, 24, W - 48, H - 48).lineWidth(3).stroke("#1F3A5F"); doc.rect(34, 34, W - 68, H - 68).lineWidth(1).stroke("#63C174");
    doc.fillColor("#1F3A5F").fontSize(16).text("BEXEX AUDIT PORTAL", 0, 70, { align: "center", characterSpacing: 3 });
    doc.fontSize(34).text("Certificate of Safety Excellence", 0, 100, { align: "center" });
    doc.fillColor("#444").fontSize(14).text("is proudly presented to", 0, 165, { align: "center" });
    doc.fillColor("#111").fontSize(30).text(cert.nodeName, 0, 195, { align: "center" });
    doc.fillColor("#444").fontSize(14).text(cert.companyName || "", 0, 240, { align: "center" });
    const metricLabel = cert.metric === "SAFETY" ? "Safety performance" : "Overall infrastructure and safety index";
    const levelLabel = { SITE: "site", RO: "regional office", ZONE: "zone" }[cert.level];
    doc.fillColor("#111").fontSize(16).text(`Rank ${cert.rank} among ${levelLabel}s · ${metricLabel}`, 0, 280, { align: "center" });
    doc.fontSize(16).text(`${cert.period.label} · Score ${cert.score}%`, 0, 306, { align: "center" });
    doc.fillColor("#666").fontSize(10).text(`Issued ${cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString("en-IN") : "—"} · Certificate ${cert.code}`, 0, H - 100, { align: "center" });
    doc.text(`Verify at ${process.env.CLIENT_URL || ""}/verify/${cert.code}`, 0, H - 84, { align: "center" });
    doc.end();
  } catch (e) { next(e); }
};

exports.verify = async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({ where: { code: String(req.params.code) }, include: { period: { select: { label: true } } } });
    if (!cert || cert.status !== "APPROVED") return res.json({ success: true, valid: false });
    res.json({ success: true, valid: true, certificate: { nodeName: cert.nodeName, companyName: cert.companyName, level: cert.level, metric: cert.metric, rank: cert.rank, score: cert.score, period: cert.period.label, issuedAt: cert.issuedAt } });
  } catch (e) { next(e); }
};

/* ----- access & scope ----- */
const SCOPED_ROLES = ["CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"];
exports.accessOptions = async (req, res, next) => {
  try {
    const [companies, locations] = await Promise.all([prisma.company.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }), prisma.dealerLocation.findMany({ select: { id: true, locationName: true, dealerName: true, zone: true, regionalOffice: true, programme: { select: { companyId: true } } } })]);
    res.json({ success: true, roles: SCOPED_ROLES, companies, locations: locations.map((l) => ({ id: l.id, name: `${l.dealerName} · ${l.locationName}`, zone: l.zone, regionalOffice: l.regionalOffice, companyId: l.programme.companyId })) });
  } catch (e) { next(e); }
};

exports.listUsers = async (req, res, next) => {
  try {
    const companyId = str(req.query.companyId);
    const users = await prisma.user.findMany({ where: { role: { in: SCOPED_ROLES }, ...(companyId ? { OR: [{ companyId }, { scopes: { some: { companyId } } }] } : {}) }, select: { id: true, fullName: true, email: true, username: true, role: true, status: true, companyId: true, scopes: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, users });
  } catch (e) { next(e); }
};

// Creates one scoped user (corporate, zonal, regional, site). Used by the Access & Roles form and the Excel import.
const createScopedUser = async (body) => {
  const role = str(body.role).toUpperCase();
  if (!SCOPED_ROLES.includes(role)) throw fail("Choose a valid role.");
  const fullName = str(body.fullName); const email = str(body.email).toLowerCase();
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("Enter the name and a valid email.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw fail("A user with this email already exists.");
  const sc = body.scope || {};
  const need = { CORPORATE_MANAGER: "companyId", ZONAL_MANAGER: "zone", REGIONAL_MANAGER: "regionalOffice", SITE_INCHARGE: "locationId", SITE_USER: "locationId" }[role];
  if (!str(sc[need])) throw fail(`Select the ${need === "locationId" ? "site" : need === "regionalOffice" ? "regional office" : need === "companyId" ? "company" : "zone"} this user covers.`);
  const { username, password, hash } = await issueCredentials();
  const user = await prisma.user.create({ data: { fullName, email, username, password: hash, mustChangePassword: true, role, companyId: str(sc.companyId) || null, scopes: { create: [{ companyId: str(sc.companyId) || null, zone: str(sc.zone) || null, regionalOffice: str(sc.regionalOffice) || null, locationId: str(sc.locationId) || null }] } }, select: { id: true } });
  return { id: user.id, username, password };
};

exports.createUser = async (req, res, next) => {
  try {
    const { id, username, password } = await createScopedUser(req.body);
    res.status(201).json({ success: true, id, credentials: { username, password } });
  } catch (e) { next(e); }
};

exports.helpers = { createScopedUser, siteStats };

exports.resetPassword = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, username: true, role: true } });
    if (!user || !SCOPED_ROLES.includes(user.role)) throw fail("User not found.", 404);
    const password = newPassword();
    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password), mustChangePassword: true } });
    res.json({ success: true, credentials: { username: user.username, password } });
  } catch (e) { next(e); }
};

exports.setUserStatus = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: Boolean(req.body.status) } });
    res.json({ success: true });
  } catch (e) { next(e); }
};

// Everyone who can see a site: users scoped to the site itself, its regional office, zone or company.
exports.siteAccess = async (req, res, next) => {
  try {
    const site = await prisma.dealerLocation.findUnique({ where: { id: req.params.locationId }, select: { id: true, zone: true, regionalOffice: true, programme: { select: { companyId: true } } } });
    if (!site) throw fail("Site not found.", 404);
    const scopes = await prisma.userScope.findMany({ include: { user: { select: { id: true, fullName: true, email: true, username: true, role: true, status: true } } } });
    const covers = (sc) => (!sc.companyId || sc.companyId === site.programme.companyId) && (!sc.zone || sc.zone === site.zone) && (!sc.regionalOffice || sc.regionalOffice === site.regionalOffice) && (!sc.locationId || sc.locationId === site.id);
    const level = (sc) => (sc.locationId ? "Site" : sc.regionalOffice ? "Regional office" : sc.zone ? "Zone" : "Company");
    const users = scopes.filter(covers).map((sc) => ({ ...sc.user, level: level(sc) }));
    res.json({ success: true, users: [...new Map(users.map((u) => [u.id, u])).values()] });
  } catch (e) { next(e); }
};
