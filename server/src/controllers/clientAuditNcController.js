const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../config/prisma");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { locationWhereForUser } = require("../utils/scope");

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const allowedImages = new Set(["image/jpeg", "image/png", "image/webp"]);
exports.evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 10 }, fileFilter: (_req, file, cb) => allowedImages.has(file.mimetype) ? cb(null, true) : cb(fail(400, "Evidence must be a JPEG, PNG or WebP image.")) }).array("evidence", 10);

const include = {
  evidence: { orderBy: { createdAt: "asc" } }, history: { orderBy: { createdAt: "desc" } },
  response: { include: { evidence: { orderBy: { createdAt: "asc" } }, snapshotItem: true, session: { include: { job: { include: { location: { select: { dealerName: true, locationName: true, locationCode: true } }, assignments: { select: { auditorId: true, assignmentRole: true } } } } } } } },
};
const scope = async (user) => {
  if (user.role === "ADMIN") return {};
  if (user.role === "AUDITOR") return { response: { session: { job: { assignments: { some: { auditorId: user.id } } } } } };
  // Dealer-side users see only the findings of the sites inside their own node of the hierarchy, not the whole company.
  return { response: { session: { job: { location: await locationWhereForUser(user) } } } };
};
const findNc = async (id, user) => {
  const nc = await prisma.clientAuditNonCompliance.findFirst({ where: { id, ...await scope(user) }, include });
  if (!nc) throw fail(404, "Client audit non-compliance was not found.");
  return nc;
};
const upload = async (file, ncId, userId) => {
  let imageUrl; let publicId = null;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const result = await uploadToCloudinary(file, `audit-portal/client-nc/${ncId}`); imageUrl = result.secure_url; publicId = result.public_id || null;
  } else imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  return { imageUrl, publicId, imageName: file.originalname, mimeType: file.mimetype, fileHash: crypto.createHash("sha256").update(file.buffer).digest("hex"), uploadedById: userId };
};

exports.list = async (req, res, next) => { try {
  const where = { ...await scope(req.user) };
  if (req.query.status) where.status = String(req.query.status).toUpperCase();
  if (req.query.severity) where.severity = String(req.query.severity).toUpperCase();
  const records = await prisma.clientAuditNonCompliance.findMany({ where, include, orderBy: { createdAt: "desc" } });
  const now = new Date();
  res.json({ success: true, records: records.map((record) => ({ ...record, overdue: Boolean(record.targetDate && record.targetDate < now && !["CLOSED", "VOID"].includes(record.status)) })) });
} catch (error) { next(error); } };
exports.get = async (req, res, next) => { try { res.json({ success: true, record: await findNc(req.params.ncId, req.user) }); } catch (error) { next(error); } };

exports.submitCapa = async (req, res, next) => { try {
  const nc = await findNc(req.params.ncId, req.user);
  if (["CLOSED", "VOID"].includes(nc.status)) throw fail(400, "Closed or void NC cannot receive a CAPA submission.");
  const rootCause = req.body.rootCause?.trim(); const correctiveAction = req.body.correctiveAction?.trim(); const preventiveAction = req.body.preventiveAction?.trim(); const responsiblePerson = req.body.responsiblePerson?.trim();
  if (!rootCause || !correctiveAction || !preventiveAction || !responsiblePerson) throw fail(400, "Root cause, corrective action, preventive action and responsible person are required.");
  const targetDate = new Date(req.body.targetDate); if (Number.isNaN(targetDate.getTime())) throw fail(400, "A valid target date is required.");
  if (!(req.files || []).length && !nc.evidence.length) throw fail(400, "At least one closure evidence photo is required.");
  const files = []; for (const file of req.files || []) files.push(await upload(file, nc.id, req.user.id));
  const updated = await prisma.clientAuditNonCompliance.update({ where: { id: nc.id }, data: { rootCause, correctiveAction, preventiveAction, responsiblePerson, targetDate, capaSubmittedById: req.user.id, capaSubmittedAt: new Date(), status: "CAPA_SUBMITTED", evidence: files.length ? { create: files } : undefined, history: { create: { action: "CAPA_SUBMITTED", fromStatus: nc.status, toStatus: "CAPA_SUBMITTED", remarks: req.body.remarks?.trim() || null, actorId: req.user.id } } }, include });
  await createNotification({ title: "Client NC CAPA submitted", message: `${nc.ncNumber} is ready for auditor review.`, type: NOTIFICATION_TYPES.CLIENT_NC_CAPA_SUBMITTED, recipientId: nc.response.session?.auditorId, createdById: req.user.id, link: "/auditor-dashboard/client-nc-capa" }).catch(()=>{});
  res.json({ success: true, message: "CAPA submitted for auditor review.", record: updated });
} catch (error) { next(error); } };

exports.review = async (req, res, next) => { try {
  const nc = await findNc(req.params.ncId, req.user); const action = String(req.body.action || "").toUpperCase(); const remarks = req.body.remarks?.trim();
  const lead = nc.response.session.job.assignments.find((assignment) => assignment.auditorId === req.user.id && assignment.assignmentRole === "LEAD");
  if (!lead) throw fail(403, "Only the assigned lead auditor can review or close this NC.");
  const transitions = { CLOSE: "CLOSED", REJECT: "REJECTED", MORE_EVIDENCE: "MORE_EVIDENCE_REQUIRED", REOPEN: "OPEN" };
  const nextStatus = transitions[action]; if (!nextStatus) throw fail(400, "Action must be CLOSE, REJECT, MORE_EVIDENCE or REOPEN.");
  if (["REJECT", "MORE_EVIDENCE", "REOPEN"].includes(action) && !remarks) throw fail(400, "Review remarks are required for this action.");
  if (action === "CLOSE" && nc.status !== "CAPA_SUBMITTED") throw fail(400, "Only a submitted CAPA can be closed.");
  const record = await prisma.clientAuditNonCompliance.update({ where: { id: nc.id }, data: { status: nextStatus, auditorRemarks: remarks || "CAPA verified and accepted.", reviewedById: req.user.id, reviewedAt: new Date(), closedAt: nextStatus === "CLOSED" ? new Date() : null, history: { create: { action, fromStatus: nc.status, toStatus: nextStatus, remarks: remarks || null, actorId: req.user.id } } }, include });
  res.json({ success: true, message: `NC status updated to ${nextStatus}.`, record });
} catch (error) { next(error); } };

exports.adminOverrideClose = async (req, res, next) => { try {
  const nc = await findNc(req.params.ncId, req.user); const justification = req.body.justification?.trim();
  if (!justification) throw fail(400, "Admin override justification is required.");
  if (["CLOSED", "VOID"].includes(nc.status)) throw fail(400, "This NC is already closed or void.");
  const record = await prisma.clientAuditNonCompliance.update({ where: { id: nc.id }, data: { status: "CLOSED", auditorRemarks: `ADMIN OVERRIDE: ${justification}`, reviewedById: req.user.id, reviewedAt: new Date(), closedAt: new Date(), history: { create: { action: "ADMIN_OVERRIDE_CLOSE", fromStatus: nc.status, toStatus: "CLOSED", remarks: justification, actorId: req.user.id } } }, include });
  res.json({ success: true, message: "NC closed using administrative override.", record });
} catch (error) { next(error); } };
