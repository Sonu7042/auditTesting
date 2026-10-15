const crypto = require("crypto");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const prisma = require("../config/prisma");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const { locationWhereForUser } = require("../utils/scope");

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const categories = new Set(["INCORRECT_RESPONSE", "INSUFFICIENT_EVIDENCE", "EVIDENCE_QUALITY", "SCORING_MISMATCH", "MISSING_OBSERVATION", "RISK_CLASSIFICATION", "MEASUREMENT_VERIFICATION", "REPORT_DETAIL"]);
const priorities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const results = new Set(["COMPLIANT", "NON_COMPLIANT", "NA"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

exports.correctionEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => imageTypes.has(file.mimetype) ? cb(null, true) : cb(fail(400, "Correction evidence must be a JPEG, PNG or WebP image.")),
}).array("evidence", 5);

const reportInclude = {
  history: { orderBy: { createdAt: "desc" } },
  corrections: { include: { evidence: { orderBy: { createdAt: "asc" } }, snapshotItem: true }, orderBy: { createdAt: "desc" } },
  job: { include: {
    location: { include: { programme: { include: { company: true } }, facilities: true } },
    snapshot: { include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } } },
    assignments: { include: { auditor: { select: { id: true, fullName: true, email: true } } } },
    sessions: { include: { auditor: { select: { id: true, fullName: true } }, completion: true, responses: { include: { evidence: true, nonCompliance: { include: { evidence: true } } } } } },
  } },
};

const scoped = async (id, user) => {
  const report = await prisma.clientAuditReport.findUnique({ where: { id }, include: reportInclude });
  if (!report) throw fail(404, "Client audit report was not found.");
  if (user.role === "ADMIN") return report;
  if (user.role === "AUDITOR" && report.job.assignments.some((item) => item.auditorId === user.id)) return report;
  const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(user), { id: report.job.locationId }] } });
  if (visible && ["PUBLISHED", "SIGNED_OFF"].includes(report.status)) return report;
  throw fail(403, "You cannot access this report.");
};

const requireLead = (report, user) => {
  if (user.role === "ADMIN") return;
  if (!report.job.assignments.some((item) => item.auditorId === user.id && item.assignmentRole === "LEAD")) {
    throw fail(403, "Only the assigned lead auditor can submit this report or its corrections.");
  }
};

const uploadEvidence = async (file, correctionId, userId) => {
  let imageUrl;
  let publicId = null;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const uploaded = await uploadToCloudinary(file, `audit-portal/report-corrections/${correctionId}`);
    imageUrl = uploaded.secure_url;
    publicId = uploaded.public_id || null;
  } else imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  return { imageUrl, publicId, imageName: file.originalname, mimeType: file.mimetype, fileHash: crypto.createHash("sha256").update(file.buffer).digest("hex"), uploadedById: userId };
};

exports.list = async (req, res, next) => { try {
  let where = {};
  if (req.user.role === "AUDITOR") where = { job: { assignments: { some: { auditorId: req.user.id } } } };
  else if (req.user.role !== "ADMIN") {
    where = { job: { location: await locationWhereForUser(req.user) }, status: { in: ["PUBLISHED", "SIGNED_OFF"] } };
  }
  res.json({ success: true, reports: await prisma.clientAuditReport.findMany({ where, include: reportInclude, orderBy: { generatedAt: "desc" } }) });
} catch (error) { next(error); } };

exports.generate = async (req, res, next) => { try {
  const job = await prisma.clientAuditJob.findUnique({ where: { id: req.params.jobId }, include: { report: true } });
  if (!job || job.status !== "COMPLETED") throw fail(400, "Complete the audit before generating its report.");
  const report = job.report || await prisma.clientAuditReport.create({ data: { jobId: job.id, reportNumber: `CAR-${new Date().getFullYear()}-${job.id.slice(0, 8).toUpperCase()}`, history: { create: { action: "DRAFT_GENERATED", toStatus: "DRAFT", actorId: req.user.id } } } });
  res.json({ success: true, report: await scoped(report.id, req.user) });
} catch (error) { next(error); } };

exports.review = async (req, res, next) => { try {
  const report = await scoped(req.params.reportId, req.user);
  const action = String(req.body.action || "").toUpperCase();
  const remarks = req.body.remarks?.trim();
  const nextStatus = { SUBMIT: "UNDER_REVIEW", RETURN: "RETURNED", APPROVE: "APPROVED", PUBLISH: "PUBLISHED" }[action];
  const allowed = { SUBMIT: ["DRAFT", "RETURNED"], RETURN: ["UNDER_REVIEW"], APPROVE: ["UNDER_REVIEW"], PUBLISH: ["APPROVED"] };
  if (!nextStatus) throw fail(400, "Invalid report action.");
  if (!allowed[action].includes(report.status)) throw fail(400, `Cannot ${action.toLowerCase()} a report in ${report.status} status.`);
  if (action === "SUBMIT") {
    requireLead(report, req.user);
    // Reports are expected within 24 hours of the audit. A later one is still accepted, with the reason recorded (for example, no network).
    const first = [...report.job.sessions].sort((a, b) => new Date(a.checkedInAt) - new Date(b.checkedInAt))[0];
    const done = first?.completion?.completedAt || first?.endedAt;
    if (done && (Date.now() - new Date(done).getTime()) / 36e5 > 24 && (remarks || "").length < 5) throw fail(400, "This report is being submitted more than 24 hours after the audit. Give the reason for the delay (for example, no network).");
  }
  if (["RETURN", "APPROVE", "PUBLISH"].includes(action) && req.user.role !== "ADMIN") throw fail(403, "Only QC admin can perform this report action.");
  if (action === "RETURN" && !remarks) throw fail(400, "Return remarks are required.");
  if (action === "APPROVE" && report.corrections.some((item) => item.status !== "ACCEPTED")) throw fail(400, "Accept all report correction points before approval.");
  const updated = await prisma.clientAuditReport.update({ where: { id: report.id }, data: {
    status: nextStatus, reviewRemarks: remarks || null,
    revision: action === "SUBMIT" && report.status === "RETURNED" ? { increment: 1 } : undefined,
    approvedById: action === "APPROVE" ? req.user.id : report.approvedById,
    approvedAt: action === "APPROVE" ? new Date() : report.approvedAt,
    publishedAt: action === "PUBLISH" ? new Date() : report.publishedAt,
    history: { create: { action, fromStatus: report.status, toStatus: nextStatus, remarks: remarks || null, actorId: req.user.id } },
  }, include: reportInclude });
  // Issuing a revision completes the changes the dealer asked for.
  if (action === "PUBLISH") await prisma.reportClarification.updateMany({ where: { reportId: report.id, status: "ACCEPTED" }, data: { status: "ACTIONED", resolvedInRevision: updated.revision } });
  res.json({ success: true, message: `Report status updated to ${nextStatus}.`, report: updated });
} catch (error) { next(error); } };

exports.createCorrection = async (req, res, next) => { try {
  const report = await scoped(req.params.reportId, req.user);
  if (!["UNDER_REVIEW", "CORRECTION_REQUIRED"].includes(report.status)) throw fail(400, "Corrections can only be raised during the active QC correction cycle.");
  const category = String(req.body.category || "").toUpperCase();
  const priority = String(req.body.priority || "MEDIUM").toUpperCase();
  const instruction = req.body.instruction?.trim();
  const snapshotItemId = req.body.snapshotItemId || null;
  if (!categories.has(category)) throw fail(400, "Select a valid correction category.");
  if (!priorities.has(priority)) throw fail(400, "Select a valid correction priority.");
  if (!instruction) throw fail(400, "Correction instruction is required.");
  if (snapshotItemId && !report.job.snapshot.items.some((item) => item.id === snapshotItemId)) throw fail(400, "Selected question is not part of this report snapshot.");
  let dueDate = null;
  if (req.body.dueDate) { dueDate = new Date(req.body.dueDate); if (Number.isNaN(dueDate.getTime())) throw fail(400, "Enter a valid correction due date."); }
  const correction = await prisma.$transaction(async (tx) => {
    const created = await tx.clientAuditReportCorrection.create({ data: { reportId: report.id, snapshotItemId, category, priority, instruction, dueDate, raisedById: req.user.id }, include: { evidence: true, snapshotItem: true } });
    await tx.clientAuditReport.update({ where: { id: report.id }, data: { status: "CORRECTION_REQUIRED", reviewRemarks: instruction, history: { create: { action: "CORRECTION_RAISED", fromStatus: report.status, toStatus: "CORRECTION_REQUIRED", remarks: instruction, actorId: req.user.id } } } });
    return created;
  });
  res.status(201).json({ success: true, message: "Correction point sent to the lead auditor.", correction });
} catch (error) { next(error); } };

exports.submitCorrection = async (req, res, next) => { try {
  const correction = await prisma.clientAuditReportCorrection.findUnique({ where: { id: req.params.correctionId }, include: { report: true } });
  if (!correction) throw fail(404, "Report correction point was not found.");
  const report = await scoped(correction.reportId, req.user);
  requireLead(report, req.user);
  if (!["OPEN", "REOPENED"].includes(correction.status)) throw fail(400, "This correction is not open for submission.");
  const resolution = req.body.resolution?.trim();
  if (!resolution) throw fail(400, "Correction resolution is required.");
  if (["INSUFFICIENT_EVIDENCE", "EVIDENCE_QUALITY"].includes(correction.category) && !(req.files || []).length) throw fail(400, "At least one replacement evidence image is required.");
  const correctedResult = req.body.correctedResult ? String(req.body.correctedResult).toUpperCase() : null;
  if (correctedResult && !results.has(correctedResult)) throw fail(400, "Corrected result is invalid.");
  let correctedMeasurementValue = null;
  if (req.body.correctedMeasurementValue !== undefined && req.body.correctedMeasurementValue !== "") { correctedMeasurementValue = Number(req.body.correctedMeasurementValue); if (!Number.isFinite(correctedMeasurementValue)) throw fail(400, "Corrected measurement must be numeric."); }
  const evidence = [];
  for (const file of req.files || []) evidence.push(await uploadEvidence(file, correction.id, req.user.id));
  await prisma.$transaction(async (tx) => {
    const response = correction.snapshotItemId ? await tx.clientAuditQuestionResponse.findFirst({ where: { snapshotItemId: correction.snapshotItemId, session: { jobId: report.jobId } } }) : null;
    const hasAmendment = Boolean(response && (correctedResult || req.body.correctedObservation !== undefined || correctedMeasurementValue !== null || req.body.correctedNaReason !== undefined));
    if (hasAmendment) {
      await tx.clientAuditResponseRevision.create({ data: { responseId: response.id, revisionNumber: response.revision, previousResponse: { answer: response.answer, result: response.result, observation: response.observation, measurementValue: response.measurementValue, naReason: response.naReason, recommendation: response.recommendation, changedBy: req.user.id, changeSource: "REPORT_CORRECTION", correctionId: correction.id } } });
      await tx.clientAuditQuestionResponse.update({ where: { id: response.id }, data: { result: correctedResult || response.result, observation: req.body.correctedObservation !== undefined ? req.body.correctedObservation.trim() || null : response.observation, measurementValue: correctedMeasurementValue !== null ? correctedMeasurementValue : response.measurementValue, naReason: req.body.correctedNaReason !== undefined ? req.body.correctedNaReason.trim() || null : response.naReason, revision: { increment: 1 } } });
    }
    await tx.clientAuditReportCorrection.update({ where: { id: correction.id }, data: { status: "SUBMITTED", resolution, correctedResult, correctedObservation: req.body.correctedObservation?.trim() || null, correctedMeasurementValue, correctedNaReason: req.body.correctedNaReason?.trim() || null, submittedById: req.user.id, submittedAt: new Date(), reviewRemarks: null, evidence: evidence.length ? { create: evidence } : undefined } });
    const remaining = await tx.clientAuditReportCorrection.count({ where: { reportId: report.id, status: { in: ["OPEN", "REOPENED"] } } });
    if (remaining === 0) await tx.clientAuditReport.update({ where: { id: report.id }, data: { status: "CORRECTION_SUBMITTED", revision: { increment: 1 }, history: { create: { action: "CORRECTIONS_SUBMITTED", fromStatus: report.status, toStatus: "CORRECTION_SUBMITTED", remarks: resolution, actorId: req.user.id } } } });
  });
  res.json({ success: true, message: "Correction submitted for QC verification.", report: await scoped(report.id, req.user) });
} catch (error) { next(error); } };

exports.reviewCorrection = async (req, res, next) => { try {
  const correction = await prisma.clientAuditReportCorrection.findUnique({ where: { id: req.params.correctionId } });
  if (!correction) throw fail(404, "Report correction point was not found.");
  const report = await scoped(correction.reportId, req.user);
  if (correction.status !== "SUBMITTED") throw fail(400, "Only a submitted correction can be reviewed.");
  const action = String(req.body.action || "").toUpperCase();
  const remarks = req.body.remarks?.trim();
  if (!["ACCEPT", "REOPEN"].includes(action)) throw fail(400, "Action must be ACCEPT or REOPEN.");
  if (action === "REOPEN" && !remarks) throw fail(400, "Reopen remarks are required.");
  await prisma.$transaction(async (tx) => {
    await tx.clientAuditReportCorrection.update({ where: { id: correction.id }, data: { status: action === "ACCEPT" ? "ACCEPTED" : "REOPENED", reviewedById: req.user.id, reviewedAt: new Date(), reviewRemarks: remarks || "Correction verified and accepted." } });
    const unresolved = await tx.clientAuditReportCorrection.count({ where: { reportId: report.id, id: { not: correction.id }, status: { not: "ACCEPTED" } } });
    const nextStatus = action === "ACCEPT" && unresolved === 0 ? "UNDER_REVIEW" : "CORRECTION_REQUIRED";
    await tx.clientAuditReport.update({ where: { id: report.id }, data: { status: nextStatus, reviewRemarks: remarks || null, history: { create: { action: action === "ACCEPT" ? "CORRECTION_ACCEPTED" : "CORRECTION_REOPENED", fromStatus: report.status, toStatus: nextStatus, remarks: remarks || null, actorId: req.user.id } } } });
  });
  res.json({ success: true, message: action === "ACCEPT" ? "Correction accepted." : "Correction reopened for the auditor.", report: await scoped(report.id, req.user) });
} catch (error) { next(error); } };

exports.pdf = async (req, res, next) => { try {
  const report = await scoped(req.params.reportId, req.user); const job = report.job; const session = job.sessions.find((item) => item.completion) || job.sessions[0]; const responses = session?.responses || [];
  const counts = { compliant: responses.filter((item) => item.result === "COMPLIANT").length, nc: responses.filter((item) => item.result === "NON_COMPLIANT").length, na: responses.filter((item) => item.result === "NA").length };
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename=${report.reportNumber}.pdf`);
  const doc = new PDFDocument({ margin: 42, size: "A4" }); doc.pipe(res);
  doc.fontSize(20).text("CLIENT AUDIT REPORT", { align: "center" }); doc.fontSize(10).text(`${report.reportNumber} | Revision ${report.revision}`, { align: "center" }).moveDown();
  doc.fontSize(14).text(job.location.programme.company.companyName).fontSize(11).text(`${job.location.dealerName} - ${job.location.locationName}`).text(job.location.address).moveDown();
  doc.text(`Programme: ${job.location.programme.name}`).text(`Audit cycle: ${job.auditCycle}`).text(`Audit type: ${job.auditType}`).text(`Scheduled: ${job.scheduledStart.toLocaleString("en-IN")} - ${job.scheduledEnd.toLocaleString("en-IN")}`).text(`Auditors: ${job.assignments.map((item) => item.auditor.fullName).join(", ")}`).moveDown();
  doc.fontSize(14).text("Executive Summary").fontSize(11).text(`Total: ${job.snapshot.itemCount}   Compliant: ${counts.compliant}   Non-Compliant: ${counts.nc}   N/A: ${counts.na}`).text(`Check-in distance: ${Math.round(session?.distanceFromSiteM || 0)} m`).text(`Final remarks: ${session?.completion?.finalRemarks || "-"}`).moveDown();
  doc.fontSize(14).text("Question-wise Results");
  for (const item of job.snapshot.items) { const response = responses.find((entry) => entry.snapshotItemId === item.id); doc.fontSize(10).fillColor("#166534").text(`${item.questionCode} | ${item.moduleCode}`).fillColor("#111111").text(item.itemData.questionText || "").text(`Result: ${response?.result || "Pending"}${response?.measurementValue != null ? ` | Measurement: ${response.measurementValue}` : ""}`).text(`Observation: ${response?.observation || "-"}`).moveDown(0.6); if (doc.y > 720) doc.addPage(); }
  doc.fontSize(14).text("NC / CAPA Register"); for (const response of responses.filter((item) => item.nonCompliance)) { const nc = response.nonCompliance; doc.fontSize(10).text(`${nc.ncNumber} | ${nc.severity} | ${nc.status}`).text(`Observation: ${nc.observation}`).text(`Corrective action: ${nc.correctiveAction || "Pending"}`).moveDown(0.5); }
  doc.addPage().fontSize(14).text("QC Correction Register"); if (!report.corrections.length) doc.fontSize(10).text("No correction points were raised.");
  for (const item of report.corrections) { doc.fontSize(10).fillColor("#111111").text(`${item.category} | ${item.priority} | ${item.status}`).text(`Question: ${item.snapshotItem?.questionCode || "Report level"}`).text(`QC instruction: ${item.instruction}`).text(`Auditor resolution: ${item.resolution || "Pending"}`).text(`QC remarks: ${item.reviewRemarks || "-"}`).moveDown(0.6); if (doc.y > 720) doc.addPage(); }
  doc.moveDown().fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString("en-IN")} | Status: ${report.status}`, { align: "center" }); doc.end();
} catch (error) { next(error); } };
