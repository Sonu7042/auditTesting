const prisma = require("../config/prisma");
const { locationWhereForUser } = require("../utils/scope");
const { createNotification } = require("../utils/notificationService");
const { helpers: qc } = require("./clientQcController");

// One report carries the whole chain: company, site set-up, checklist, scheduling, audit execution, report submission,
// Back-Admin review (returns and corrections), issue to the dealer, the dealer's clarifications and change requests,
// the revision that makes the change, dealer approval, CAPA on the findings, and the site's awards.
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const CLIENT_ROLES = ["SITE_USER", "SITE_INCHARGE", "REGIONAL_MANAGER", "ZONAL_MANAGER", "CORPORATE_MANAGER"];

const loadReport = async (id, user) => {
  const report = await prisma.clientAuditReport.findUnique({ where: { id }, select: { id: true, reportNumber: true, status: true, revision: true, generatedAt: true, approvedAt: true, publishedAt: true, signedAt: true, signedByName: true, signedByDesignation: true, qcScore: true, job: { select: { id: true, locationId: true, createdAt: true, createdById: true, scheduledStart: true, scheduledEnd: true, facilityType: true, status: true, isDemo: true, auditType: true, assignments: { select: { auditorId: true, track: true, assignmentRole: true, auditor: { select: { id: true, fullName: true } } } } } } } });
  if (!report) throw fail("Report not found.", 404);
  if (user.role === "ADMIN") return report;
  if (user.role === "AUDITOR") { if (report.job.assignments.some((a) => a.auditorId === user.id)) return report; throw fail("You cannot access this report.", 403); }
  const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(user), { id: report.job.locationId }] } });
  if (!visible || !["PUBLISHED", "SIGNED_OFF"].includes(report.status)) throw fail("You cannot access this report.", 403);
  return report;
};

/* ---------- the lifecycle: every stage of this report, who did it and when ---------- */
exports.lifecycle = async (req, res, next) => {
  try {
    const report = await loadReport(req.params.id, req.user);
    const jobId = report.job.id; const locationId = report.job.locationId;
    const [full, history, corrections, clarifications, proposals, ncs, certs, setup] = await Promise.all([
      prisma.clientAuditJob.findUnique({ where: { id: jobId }, select: { createdBy: { select: { fullName: true } }, notices: { select: { id: true, kind: true, dueAt: true, sentAt: true } }, snapshot: { select: { checklistName: true, checklistVersion: true, itemCount: true } }, location: { select: { locationName: true, locationCode: true, dealerName: true, createdAt: true, programme: { select: { companyId: true, company: { select: { companyName: true, createdAt: true } } } } } }, sessions: { select: { auditorId: true, checkedInAt: true, endedAt: true, status: true, distanceFromSiteM: true, completion: { select: { completedAt: true } } }, orderBy: { checkedInAt: "asc" } } } }),
      prisma.clientAuditReportHistory.findMany({ where: { reportId: report.id }, orderBy: { createdAt: "asc" } }),
      prisma.clientAuditReportCorrection.findMany({ where: { reportId: report.id }, select: { status: true } }),
      prisma.reportClarification.findMany({ where: { reportId: report.id }, orderBy: { createdAt: "asc" } }),
      prisma.checklistProposal.findMany({ where: { jobId }, select: { status: true } }),
      prisma.clientAuditNonCompliance.findMany({ where: { jobId }, select: { status: true, targetDate: true, priority: true, createdAt: true } }),
      prisma.certificate.findMany({ where: { nodeKey: `SITE:${locationId}`, status: "APPROVED" }, orderBy: { issuedAt: "desc" }, include: { period: { select: { label: true } } } }),
      prisma.siteSetupRequest.findFirst({ where: { locationId }, orderBy: { createdAt: "asc" } }),
    ]);
    const people = await prisma.user.findMany({ where: { id: { in: [...new Set([...history.map((h) => h.actorId), setup?.reviewedById].filter(Boolean))] } }, select: { id: true, fullName: true } });
    const who = Object.fromEntries(people.map((u) => [u.id, u.fullName]));
    const first = (action) => history.find((h) => h.action === action);
    const last = (action) => [...history].reverse().find((h) => h.action === action);
    const count = (action) => history.filter((h) => h.action === action).length;
    const st = report.status;
    // "Issued" describes where the report is now: during an open revision it is back with QC, not with the dealer.
    const issued = ["PUBLISHED", "SIGNED_OFF"].includes(st);
    const open = (list, statuses) => list.filter((c) => statuses.includes(c.status)).length;
    const openClar = open(clarifications, ["OPEN", "ACCEPTED"]);
    const ncOpen = ncs.filter((n) => !["CLOSED", "VOID"].includes(n.status)).length;
    const sessions = full.sessions;
    const doneSessions = sessions.filter((s) => s.completion?.completedAt || s.endedAt).length;
    const revOpened = count("REVISION_OPENED") > 0;
    const revisionOpen = revOpened && (!last("PUBLISH") || new Date(last("PUBLISH").createdAt) < new Date(last("REVISION_OPENED").createdAt));
    const submit = first("SUBMIT");
    const inReview = ["UNDER_REVIEW", "CORRECTION_REQUIRED", "RETURNED"].includes(st);

    const stages = [
      { key: "company", label: "Company", state: "DONE", at: full.location.programme.company.createdAt, detail: full.location.programme.company.companyName, target: "company" },
      { key: "site", label: "Site set-up", state: "DONE", at: setup?.reviewedAt || full.location.createdAt, by: who[setup?.reviewedById], detail: `${full.location.dealerName} · ${full.location.locationCode}${setup ? ` · ${setup.source === "EXCEL" ? "imported from Excel" : "entered manually"}, approved by Back-Admin` : ""}`, target: "site" },
      { key: "checklist", label: "Checklist", state: "DONE", at: report.job.createdAt, detail: `${full.snapshot.checklistName} v${full.snapshot.checklistVersion}, ${full.snapshot.itemCount} points for this site${proposals.length ? ` · ${proposals.length} point(s) proposed by auditors during the audit (${proposals.filter((p) => p.status === "APPROVED").length} approved)` : ""}`, target: "checklist" },
      { key: "scheduling", label: "Scheduling", state: "DONE", at: report.job.createdAt, by: full.createdBy?.fullName, detail: `${new Date(report.job.scheduledStart).toLocaleDateString("en-IN")}${full.notices.length ? ` · ${full.notices.length} notice(s) to the dealer` : ""} · ${report.job.assignments.map((a) => `${a.auditor.fullName} (track ${a.track})`).join(", ")}`, target: "scheduling" },
      { key: "audit", label: "Audit execution", state: report.job.status === "COMPLETED" ? "DONE" : "CURRENT", at: sessions.map((s) => s.completion?.completedAt || s.endedAt).filter(Boolean).sort().pop() || null, detail: `${doneSessions} of ${report.job.assignments.length} auditors finished · geofenced check-in, photo evidence and signature` },
      { key: "submitted", label: "Report submitted", state: submit ? "DONE" : st === "DRAFT" ? "CURRENT" : "PENDING", at: submit?.createdAt || report.generatedAt, by: who[submit?.actorId], detail: submit ? "Lead auditor submitted the report to QC" : "The lead auditor reviews the draft and submits it" },
      { key: "review", label: "Back-Admin review", state: inReview ? "CURRENT" : issued || st === "APPROVED" ? "DONE" : "PENDING", at: last("APPROVE")?.createdAt || report.approvedAt, by: who[last("APPROVE")?.actorId], detail: `${count("RETURN")} return(s) · ${corrections.length} correction point(s) (${corrections.filter((c) => c.status === "ACCEPTED").length} accepted)${report.qcScore != null && req.user.role === "ADMIN" ? ` · auditor QC score ${report.qcScore}%` : ""}` },
      { key: "issued", label: "Issued to client", state: issued ? "DONE" : st === "APPROVED" ? "CURRENT" : "PENDING", at: report.publishedAt, by: who[last("PUBLISH")?.actorId], detail: issued ? `Revision ${report.revision} is with the dealer` : "Waiting to be issued" },
      { key: "clarifications", label: "Client clarifications & changes", state: !clarifications.length ? "PENDING" : openClar ? "CURRENT" : "DONE", at: clarifications.length ? clarifications[clarifications.length - 1].createdAt : null, detail: clarifications.length ? `${clarifications.length} raised · ${open(clarifications, ["OPEN"])} waiting for an answer · ${open(clarifications, ["ACCEPTED"])} change(s) being made` : "None raised yet. The dealer can ask a question or request a change after the report is issued.", optional: true },
      { key: "revision", label: "Changes made", state: revOpened ? (revisionOpen ? "CURRENT" : "DONE") : "PENDING", at: last("REVISION_OPENED")?.createdAt, by: who[last("REVISION_OPENED")?.actorId], detail: revOpened ? (revisionOpen ? `Revision ${report.revision} is being prepared for the dealer. The earlier issue stays available to download.` : `Revision ${report.revision} was issued with the changes. Earlier revisions stay available to download.`) : "No change was needed after the report was issued", optional: true },
      { key: "approval", label: "Client approval", state: st === "SIGNED_OFF" ? "DONE" : st === "PUBLISHED" ? "CURRENT" : "PENDING", at: report.signedAt, detail: st === "SIGNED_OFF" ? `Signed off by ${report.signedByName}, ${report.signedByDesignation}` : st === "PUBLISHED" ? (openClar ? "Resolve the open clarifications first, then sign off" : "The dealer signs off with a named signature") : "After the report is issued" },
      { key: "capa", label: "CAPA on findings", state: !ncs.length ? (issued ? "DONE" : "PENDING") : ncOpen ? (issued ? "CURRENT" : "PENDING") : "DONE", detail: ncs.length ? `${ncs.length - ncOpen} of ${ncs.length} findings closed${ncOpen ? ` · ${ncOpen} open` : ""}` : "No findings were raised", target: "capa" },
      { key: "awards", label: "Site awards", state: certs.length ? "DONE" : "PENDING", at: certs[0]?.issuedAt, detail: certs.length ? certs.map((c) => `${c.period.label} · ${c.metric === "SAFETY" ? "safety" : "overall"} rank ${c.rank}`).join(" · ") : "Awards are issued per period to the best sites. They appear here and on the site page.", target: "awards", optional: true },
    ];
    const current = stages.find((s) => s.state === "CURRENT")?.key || (stages.every((s) => s.state === "DONE" || s.optional) ? "complete" : stages.find((s) => s.state === "PENDING" && !s.optional)?.key);
    res.json({ success: true, reportNumber: report.reportNumber, status: st, revision: report.revision, locationId, companyId: full.location.programme.companyId, current, stages, history: req.user.role === "ADMIN" ? history.map((h) => ({ action: h.action, from: h.fromStatus, to: h.toStatus, remarks: h.remarks, at: h.createdAt, by: who[h.actorId] || null })) : undefined });
  } catch (e) { next(e); }
};

/* ---------- clarifications and change requests from the dealer ---------- */
const present = async (rows) => {
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.raisedById, r.respondedById]).filter(Boolean))] } }, select: { id: true, fullName: true, role: true } });
  const P = Object.fromEntries(people.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, raisedBy: P[r.raisedById] || null, respondedBy: P[r.respondedById] || null }));
};

exports.listClarifications = async (req, res, next) => {
  try {
    const report = await loadReport(req.params.id, req.user);
    const rows = await prisma.reportClarification.findMany({ where: { reportId: report.id }, orderBy: { createdAt: "desc" } });
    res.json({ success: true, status: report.status, revision: report.revision, clarifications: await present(rows) });
  } catch (e) { next(e); }
};

exports.raiseClarification = async (req, res, next) => {
  try {
    if (!CLIENT_ROLES.includes(req.user.role)) throw fail("Only the dealer's team can raise a clarification or change request.", 403);
    const report = await loadReport(req.params.id, req.user);
    if (report.status !== "PUBLISHED") throw fail("Clarifications can be raised while the issued report is waiting for the dealer's approval.");
    const kind = str(req.body.kind).toUpperCase();
    if (!["CLARIFICATION", "CHANGE"].includes(kind)) throw fail("Choose clarification or change request.");
    const message = str(req.body.message);
    if (message.length < 5) throw fail(kind === "CHANGE" ? "Describe the change you need." : "Write your question.");
    if (str(req.body.snapshotItemId)) { const item = await prisma.locationChecklistSnapshotItem.findFirst({ where: { id: str(req.body.snapshotItemId), snapshot: { auditJobs: { some: { id: report.job.id } } } }, select: { id: true } }); if (!item) throw fail("That checklist point is not part of this report."); }
    const row = await prisma.reportClarification.create({ data: { reportId: report.id, revisionRaised: report.revision, kind, snapshotItemId: str(req.body.snapshotItemId) || null, message, raisedById: req.user.id } });
    const lead = report.job.assignments.find((a) => a.assignmentRole === "LEAD");
    await createNotification({ title: kind === "CHANGE" ? "Client requested a change" : "Client asked a question", message: `${report.reportNumber}: ${message.slice(0, 90)}`, type: "REPORT_CLARIFICATION", recipientRole: "ADMIN", createdById: req.user.id, link: `/admin-dashboard/qc/report/${report.id}` });
    if (lead) await createNotification({ title: kind === "CHANGE" ? "Client requested a change" : "Client asked a question", message: `${report.reportNumber}: ${message.slice(0, 90)}`, type: "REPORT_CLARIFICATION", recipientId: lead.auditorId, createdById: req.user.id, link: `/auditor-dashboard/reports-hub/${report.id}` });
    res.status(201).json({ success: true, message: kind === "CHANGE" ? "Change request sent. Sign-off waits until it is dealt with." : "Question sent. You will be notified of the answer.", clarification: row });
  } catch (e) { next(e); }
};

exports.respondClarification = async (req, res, next) => {
  try {
    const row = await prisma.reportClarification.findUnique({ where: { id: req.params.cid } });
    if (!row) throw fail("Clarification not found.", 404);
    const report = await loadReport(row.reportId, req.user);
    const lead = report.job.assignments.some((a) => a.auditorId === req.user.id && a.assignmentRole === "LEAD");
    if (req.user.role !== "ADMIN" && !lead) throw fail("Only Back-Admin or the lead auditor can answer.", 403);
    if (row.status !== "OPEN") throw fail("This clarification has already been answered.");
    const action = str(req.body.action).toUpperCase(); const response = str(req.body.response);
    if (!["ANSWER", "ACCEPT_CHANGE", "DECLINE"].includes(action)) throw fail("Choose answer, accept change or decline.");
    if (!response) throw fail(action === "DECLINE" ? "Give the reason for declining." : "Write the answer.");
    if (action === "ACCEPT_CHANGE") {
      if (row.kind !== "CHANGE") throw fail("Only a change request can be accepted as a change.");
      if (req.user.role !== "ADMIN") throw fail("Only Back-Admin can open a revision of the report.", 403);
      const current = await prisma.clientAuditReport.findUnique({ where: { id: report.id } });
      if (current.status === "PUBLISHED") await qc.openRevision(current, `Client change request: ${row.message.slice(0, 200)}`, req.user.id);
    }
    const now = await prisma.clientAuditReport.findUnique({ where: { id: report.id }, select: { revision: true } });
    const status = action === "ANSWER" ? "ANSWERED" : action === "DECLINE" ? "CLOSED" : "ACCEPTED";
    const updated = await prisma.reportClarification.update({ where: { id: row.id }, data: { status, response, respondedById: req.user.id, respondedAt: new Date(), ...(action === "ACCEPT_CHANGE" ? { resolvedInRevision: now.revision } : {}), ...(action === "DECLINE" ? { closedAt: new Date() } : {}) } });
    await createNotification({ title: action === "ACCEPT_CHANGE" ? "Your change request was accepted" : action === "DECLINE" ? "Your request was declined" : "Your question was answered", message: `${report.reportNumber}: ${response.slice(0, 90)}`, type: "REPORT_CLARIFICATION", recipientId: row.raisedById, createdById: req.user.id, link: "/user-dashboard/reports-hub" });
    res.json({ success: true, message: action === "ACCEPT_CHANGE" ? "Change accepted. A new revision is open for QC; it is marked done when the revision is issued." : "Response sent.", clarification: updated });
  } catch (e) { next(e); }
};

exports.closeClarification = async (req, res, next) => {
  try {
    const row = await prisma.reportClarification.findUnique({ where: { id: req.params.cid } });
    if (!row) throw fail("Clarification not found.", 404);
    await loadReport(row.reportId, req.user);
    if (req.user.role !== "ADMIN" && row.raisedById !== req.user.id) throw fail("Only the person who raised it can close it.", 403);
    if (!["ANSWERED", "ACTIONED"].includes(row.status)) throw fail("Only an answered request, or a change that has been made, can be closed.");
    await prisma.reportClarification.update({ where: { id: row.id }, data: { status: "CLOSED", closedAt: new Date() } });
    res.json({ success: true, message: "Closed." });
  } catch (e) { next(e); }
};
