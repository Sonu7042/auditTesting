const prisma = require("../config/prisma");
const { locationWhereForUser } = require("../utils/scope");
const { itemDiscipline, itemsInJobScope } = require("../utils/auditScope");
const { DISCIPLINES, LABEL, parseScope, buildReportData, fullInclude } = require("../utils/auditReportData");
const { buildAuditReportDocx } = require("../utils/auditReportDocx");
const { renderAuditReportPdf } = require("../utils/auditReportPdf");

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Same visibility rule as the PDF: Back-Admin sees everything; client users see published reports for their part of the network.
const loadReport = async (req) => {
  const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id }, include: fullInclude });
  if (!report) throw fail("Report not found.", 404);
  if (req.user.role !== "ADMIN") {
    const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: report.job.location.id }] } });
    if (!visible || !["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("You cannot access this report.", 403);
  }
  // An earlier revision is served from the frozen copy saved when the revision was opened.
  const wanted = Number(req.query.revision);
  if (wanted && wanted !== report.revision) {
    const frozen = await prisma.clientAuditReportRevision.findUnique({ where: { reportId_revision: { reportId: report.id, revision: wanted } } });
    if (!frozen) throw fail("That revision is not available.", 404);
    return frozen.payload;
  }
  return report;
};

const sendDocx = (res, buffer, name) => {
  res.setHeader("Content-Type", DOCX);
  res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/[^\w.\- ]+/g, "_")}"`);
  res.send(buffer);
};

// The site front facade photograph: the auditor's first (check-in) photograph, served as an image.
exports.facade = async (req, res, next) => {
  try {
    const report = await prisma.clientAuditReport.findUnique({ where: { id: req.params.id }, select: { status: true, job: { select: { location: { select: { id: true } }, sessions: { orderBy: { checkedInAt: "asc" }, take: 1, select: { checkInEvidenceUrl: true } } } } } });
    if (!report) throw fail("Report not found.", 404);
    if (req.user.role !== "ADMIN") {
      const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: report.job.location.id }] } });
      if (!visible || !["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("You cannot access this report.", 403);
    }
    const url = report.job.sessions[0]?.checkInEvidenceUrl;
    if (!url) throw fail("No photograph yet.", 404);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const m = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (m) { res.setHeader("Content-Type", m[1]); return res.send(Buffer.from(m[2], "base64")); }
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw fail("The photograph is not available.", 404);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) { return next(e); }
};

// Which audit types this report covers, so the UI can offer each one and the combined report.
exports.options = async (req, res, next) => {
  try {
    const report = await loadReport(req);
    const items = itemsInJobScope(report.job.snapshot.items, report.job);
    const present = DISCIPLINES.filter((d) => items.some((i) => itemDiscipline(i) === d));
    res.json({ success: true, disciplines: present.map((key) => ({ key, label: LABEL[key], items: items.filter((i) => itemDiscipline(i) === key).length })) });
  } catch (e) { next(e); }
};

exports.download = async (req, res, next) => {
  try {
    const report = await loadReport(req);
    const items = itemsInJobScope(report.job.snapshot.items, report.job);
    const present = DISCIPLINES.filter((d) => items.some((i) => itemDiscipline(i) === d));
    const wanted = parseScope(req.query.scope).filter((d) => present.includes(d));
    if (!wanted.length) throw fail("This audit has no checklist items for the selected audit type.");
    const data = await buildReportData({ report, disciplines: wanted });
    const loc = report.job.location;
    sendDocx(res, await buildAuditReportDocx(data), `${loc.sapCode || loc.locationCode}_${loc.dealerName}_${loc.locationName}_${data.fileTag}${data.revisionTag}_Audit_Report.docx`);
  } catch (e) { next(e); }
};

// Every revision of this report: the current one and the earlier ones that were frozen when a revision was opened.
exports.revisions = async (req, res, next) => {
  try {
    const report = await loadReport({ ...req, query: {} });
    const earlier = await prisma.clientAuditReportRevision.findMany({ where: { reportId: report.id }, orderBy: { revision: "desc" }, select: { revision: true, issuedAt: true, reason: true, createdAt: true } });
    const current = { revision: report.revision, issuedAt: report.publishedAt || report.approvedAt || null, reason: null, current: true, status: report.status };
    res.json({ success: true, revisions: [current, ...earlier.map((r) => ({ revision: r.revision, issuedAt: r.issuedAt, supersededAt: r.createdAt, reason: r.reason, current: false }))] });
  } catch (e) { next(e); }
};

// The same report as a PDF, viewable in the browser (inline).
exports.pdf = async (req, res, next) => {
  try {
    const report = await loadReport(req);
    const items = itemsInJobScope(report.job.snapshot.items, report.job);
    const present = DISCIPLINES.filter((d) => items.some((i) => itemDiscipline(i) === d));
    const wanted = parseScope(req.query.scope).filter((d) => present.includes(d));
    if (!wanted.length) throw fail("This audit has no checklist items for the selected audit type.");
    const data = await buildReportData({ report, disciplines: wanted });
    const loc = report.job.location;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${`${loc.sapCode || loc.locationCode}_${loc.dealerName}_${data.fileTag}${data.revisionTag}_Audit_Report.pdf`.replace(/[^\w.\- ]+/g, "_")}"`);
    await renderAuditReportPdf(data, res);
  } catch (e) { next(e); }
};

// The empty template: same layout, every detail a placeholder.
exports.template = async (req, res, next) => {
  try {
    const wanted = parseScope(req.query.scope);
    if (!wanted.length) throw fail("Choose at least one audit type.");
    const data = await buildReportData({ report: null, disciplines: wanted, blank: true });
    sendDocx(res, await buildAuditReportDocx(data), `Audit_Report_Template_${wanted.length === DISCIPLINES.length ? "Combined" : wanted.join("-")}.docx`);
  } catch (e) { next(e); }
};
