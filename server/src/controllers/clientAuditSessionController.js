const crypto = require("crypto");
const multer = require("multer");
const prisma = require("../config/prisma");
const uploadToCloudinary = require("../utils/cloudinaryUpload");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { itemsForTrack, itemDiscipline } = require("../utils/auditScope");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const checkInPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype)),
});
const responseEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 15 },
  fileFilter: (_req, file, callback) => allowedMimeTypes.has(file.mimetype)
    ? callback(null, true)
    : callback(httpError(400, "Evidence must be a JPEG, PNG or WebP image.")),
});

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const toRadians = (degrees) => degrees * (Math.PI / 180);
const distanceInMetres = (lat1, lon1, lat2, lon2) => {
  const earthRadiusM = 6371000;
  const latDelta = toRadians(lat2 - lat1);
  const lonDelta = toRadians(lon2 - lon1);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const assertCoordinate = (value, minimum, maximum, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw httpError(400, `${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
};

const sessionInclude = {
  events: { orderBy: { createdAt: "asc" } },
  responses: { include: { evidence: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } },
  completion: true,
  job: {
    include: {
      location: { select: { dealerName: true, locationName: true, address: true, geofenceRadiusM: true } },
      snapshot: { include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } } },
    },
  },
};

const findAssignedJob = async (jobId, auditorId) => {
  const job = await prisma.clientAuditJob.findFirst({
    where: { id: jobId, assignments: { some: { auditorId } } },
    include: {
      location: true,
      assignments: { where: { auditorId }, select: { track: true, assignmentRole: true } },
      snapshot: { select: { id: true, checklistName: true, checklistVersion: true, itemCount: true, configuration: true } },
      sessions: { where: { auditorId }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!job) throw httpError(404, "Assigned client audit job was not found.");
  return job;
};

const checklistModules = (items, responses = []) => {
  const responseMap = new Map(responses.map((response) => [response.snapshotItemId, response]));
  return Object.values(items.reduce((modules, item) => {
  if (!modules[item.moduleCode]) modules[item.moduleCode] = { moduleCode: item.moduleCode, sections: {}, questionCount: 0 };
  const module = modules[item.moduleCode];
  if (!module.sections[item.sectionName]) module.sections[item.sectionName] = [];
  // itemData contains the original checklist item id. The audit response must
  // always use the immutable snapshot-item id, so apply snapshot identity last.
  module.sections[item.sectionName].push({
    ...item.itemData,
    id: item.id,
    snapshotItemId: item.id,
    sourceItemId: item.sourceItemId,
    questionCode: item.questionCode,
    sortOrder: item.sortOrder,
    response: responseMap.get(item.id) || null,
  });
  module.questionCount += 1;
  return modules;
  }, {})).map((module) => {
    const moduleResponses = responses.filter((response) => items.some((item) => item.id === response.snapshotItemId && item.moduleCode === module.moduleCode));
    const submittedCount = moduleResponses.filter((response) => response.responseStatus === "SUBMITTED").length;
    return {
      ...module,
      submittedCount,
      draftCount: moduleResponses.filter((response) => response.responseStatus === "DRAFT").length,
      progressPercent: module.questionCount ? Math.round((submittedCount / module.questionCount) * 100) : 0,
      sections: Object.entries(module.sections).map(([sectionName, questions]) => ({ sectionName, questions })),
    };
  });
};

const sessionPayload = (session, track = "ALL") => {
  const scoped = itemsForTrack(session.job.snapshot.items, session.job, track);
  const scopedIds = new Set(scoped.map((item) => item.id));
  const modules = checklistModules(scoped, (session.responses || []).filter((r) => scopedIds.has(r.snapshotItemId)))
    .map((module) => ({ ...module, sections: module.sections.map((section) => ({ ...section, questions: section.questions.map((q) => ({ ...q, discipline: q.discipline || itemDiscipline({ moduleCode: module.moduleCode, itemData: q }) })) })) }));
  const totalQuestions = modules.reduce((sum, module) => sum + module.questionCount, 0);
  const submittedQuestions = modules.reduce((sum, module) => sum + module.submittedCount, 0);
  return {
    ...session,
    track,
    job: { ...session.job, snapshot: { ...session.job.snapshot, items: undefined } },
    modules,
    progress: { totalQuestions, submittedQuestions, percentage: totalQuestions ? Math.round((submittedQuestions / totalQuestions) * 100) : 0 },
  };
};

exports.checkInPhotoUpload = checkInPhotoUpload.single("checkInPhoto");
exports.responseEvidenceUpload = responseEvidenceUpload.fields([{ name: "evidence", maxCount: 10 }, { name: "correctionEvidence", maxCount: 5 }]);

exports.getCheckInDetails = async (req, res, next) => {
  try {
    const job = await findAssignedJob(req.params.jobId, req.user.id);
    res.json({
      success: true,
      job: {
        id: job.id, auditCycle: job.auditCycle, auditType: job.auditType, status: job.status,
        scheduledStart: job.scheduledStart, scheduledEnd: job.scheduledEnd,
        isDemo: job.isDemo, facilityType: job.facilityType, includesShared: job.includesShared,
        track: job.assignments[0]?.track || "ALL",
        location: {
          dealerName: job.location.dealerName, locationName: job.location.locationName,
          address: job.location.address, latitude: job.location.latitude,
          longitude: job.location.longitude, geofenceRadiusM: job.location.geofenceRadiusM,
        },
        snapshot: job.snapshot,
      },
      session: job.sessions[0] || null,
    });
  } catch (error) { next(error); }
};

exports.checkIn = async (req, res, next) => {
  try {
    const job = await findAssignedJob(req.params.jobId, req.user.id);
    if (job.sessions[0]) throw httpError(409, "You have already checked in for this audit.");
    if (!["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(job.status)) throw httpError(400, "This audit is not open for check-in.");
    if (!req.file) throw httpError(400, "A live camera photo is required for check-in.");
    if (req.body.source !== "LIVE_CAMERA") throw httpError(400, "Check-in evidence must be captured with the live camera.");
    if (!req.body.deviceId?.trim()) throw httpError(400, "Device identifier is required.");

    const demo = job.isDemo === true;
    // Demo audits run from a laptop: use the site coordinates when the browser cannot supply a fix.
    const hasFix = req.body.latitude !== undefined && req.body.latitude !== "" && req.body.longitude !== undefined && req.body.longitude !== "";
    const latitude = demo && !hasFix ? job.location.latitude : assertCoordinate(req.body.latitude, -90, 90, "Latitude");
    const longitude = demo && !hasFix ? job.location.longitude : assertCoordinate(req.body.longitude, -180, 180, "Longitude");
    const gpsAccuracy = demo && !hasFix ? 10 : Number(req.body.accuracy);
    const maxAccuracy = Number(process.env.CLIENT_AUDIT_MAX_GPS_ACCURACY_M || 100);
    if (!demo && (!Number.isFinite(gpsAccuracy) || gpsAccuracy <= 0 || gpsAccuracy > maxAccuracy)) {
      throw httpError(400, `GPS accuracy must be ${maxAccuracy} metres or better. Move outdoors and retry.`);
    }

    const earlyMinutes = Number(process.env.CLIENT_AUDIT_EARLY_CHECKIN_MINUTES || 60);
    const lateMinutes = Number(process.env.CLIENT_AUDIT_LATE_CHECKIN_MINUTES || 120);
    const now = new Date();
    const windowStart = new Date(job.scheduledStart.getTime() - earlyMinutes * 60000);
    const windowEnd = new Date(job.scheduledEnd.getTime() + lateMinutes * 60000);
    if (!demo && (now < windowStart || now > windowEnd)) throw httpError(400, "Check-in is only available during the scheduled audit window.");

    const distance = distanceInMetres(latitude, longitude, job.location.latitude, job.location.longitude);
    if (!demo && distance > job.location.geofenceRadiusM) {
      throw httpError(400, `You are ${Math.round(distance)} m from the site. Move within the ${job.location.geofenceRadiusM} m geofence.`);
    }

    const activeElsewhere = await prisma.clientAuditSession.findFirst({
      where: { auditorId: req.user.id, status: "IN_PROGRESS", jobId: { not: job.id } },
      select: { id: true },
    });
    if (activeElsewhere) throw httpError(409, "Finish your active client audit session before checking in to another audit.");

    let evidenceUrl;
    let evidencePublicId = null;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const uploaded = await uploadToCloudinary(req.file, `audit-portal/client-check-ins/${job.id}`);
      evidenceUrl = uploaded.secure_url;
      evidencePublicId = uploaded.public_id || null;
    } else {
      evidenceUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }
    const evidenceHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.clientAuditSession.create({
        data: {
          jobId: job.id, auditorId: req.user.id, deviceId: req.body.deviceId.trim(),
          checkInLatitude: latitude, checkInLongitude: longitude, gpsAccuracy,
          distanceFromSiteM: distance, checkInEvidenceUrl: evidenceUrl,
          checkInEvidencePublicId: evidencePublicId, checkInEvidenceName: req.file.originalname,
          checkInEvidenceMimeType: req.file.mimetype, evidenceHash,
          events: { create: { eventType: "CHECKED_IN", eventData: { latitude, longitude, gpsAccuracy, distanceFromSiteM: distance, source: "LIVE_CAMERA", demo } } },
        },
        include: sessionInclude,
      });
      if (job.status !== "IN_PROGRESS") await tx.clientAuditJob.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } });
      return created;
    });
    res.status(201).json({ success: true, message: "Check-in verified. Audit checklist is now unlocked.", session: sessionPayload(session, job.assignments[0]?.track || "ALL") });
  } catch (error) { next(error); }
};

exports.getSession = async (req, res, next) => {
  try {
    const assigned = await findAssignedJob(req.params.jobId, req.user.id);
    const session = await prisma.clientAuditSession.findUnique({
      where: { jobId_auditorId: { jobId: req.params.jobId, auditorId: req.user.id } },
      include: sessionInclude,
    });
    if (!session) throw httpError(403, "Complete geofence check-in to unlock this checklist.");
    res.json({ success: true, session: sessionPayload(session, assigned.assignments[0]?.track || "ALL") });
  } catch (error) { next(error); }
};

const clean = (value) => typeof value === "string" ? value.trim() : "";
const uploadEvidence = async (file, sessionId) => {
  let imageUrl;
  let publicId = null;
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const uploaded = await uploadToCloudinary(file, `audit-portal/client-responses/${sessionId}`);
    imageUrl = uploaded.secure_url;
    publicId = uploaded.public_id || null;
  } else {
    imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  }
  return {
    imageUrl, publicId, imageName: file.originalname, mimeType: file.mimetype,
    fileHash: crypto.createHash("sha256").update(file.buffer).digest("hex"),
  };
};

exports.saveQuestionResponse = async (req, res, next) => {
  try {
    const session = await prisma.clientAuditSession.findFirst({
      where: { jobId: req.params.jobId, auditorId: req.user.id, status: "IN_PROGRESS" },
      include: { job: { select: { snapshotId: true, facilityType: true, includesShared: true, isDemo: true, location: { select: { locationCode: true } }, assignments: { where: { auditorId: req.user.id }, select: { track: true } } } } },
    });
    if (!session) throw httpError(403, "An active geofence check-in session is required.");
    const item = await prisma.locationChecklistSnapshotItem.findFirst({
      where: {
        snapshotId: session.job.snapshotId,
        OR: [
          { id: req.params.snapshotItemId },
          // Backward-compatible with a response screen opened before the
          // snapshot-id mapping fix; source ids remain scoped to this snapshot.
          { sourceItemId: req.params.snapshotItemId },
        ],
      },
    });
    if (!item) throw httpError(404, "Checklist question was not found in this audit snapshot.");
    const track = session.job.assignments[0]?.track || "ALL";
    if (!itemsForTrack([item], session.job, track).length) throw httpError(403, "This question belongs to another auditor's track or facility.");

    const itemData = item.itemData || {};
    const responseStatus = clean(req.body.responseStatus).toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    let answer = clean(req.body.answer).toUpperCase() || null;
    if (answer && !["COMPLIANT", "NON_COMPLIANT", "NA"].includes(answer)) throw httpError(400, "Invalid response selection.");
    const measurementValue = req.body.measurementValue === "" || req.body.measurementValue == null ? null : Number(req.body.measurementValue);
    if (measurementValue != null && !Number.isFinite(measurementValue)) throw httpError(400, "Measurement must be a valid number.");
    if (itemData.responseType === "MEASUREMENT" && measurementValue != null) {
      const belowMinimum = itemData.minimumValue != null && measurementValue < Number(itemData.minimumValue);
      const aboveMaximum = itemData.maximumValue != null && measurementValue > Number(itemData.maximumValue);
      answer = belowMinimum || aboveMaximum ? "NON_COMPLIANT" : "COMPLIANT";
    }
    if (answer === "NA" && itemData.naAllowed === false) throw httpError(400, "N/A is not allowed for this question.");

    const observation = clean(req.body.observation) || null;
    const naReason = clean(req.body.naReason) || null;
    const recommendation = clean(req.body.recommendation) || null;
    const responsiblePerson = clean(req.body.responsiblePerson) || null;
    const correctionComment = clean(req.body.correctionComment) || null;
    const closedOnSpot = answer === "NON_COMPLIANT" && String(req.body.closedOnSpot) === "true";
    const targetDate = clean(req.body.targetDate) ? new Date(req.body.targetDate) : null;
    if (targetDate && Number.isNaN(targetDate.getTime())) throw httpError(400, "Target date is invalid.");

    const existing = await prisma.clientAuditQuestionResponse.findUnique({
      where: { sessionId_snapshotItemId: { sessionId: session.id, snapshotItemId: item.id } },
      include: { evidence: true },
    });
    const issueFiles = req.files?.evidence || [];
    const correctionFiles = req.files?.correctionEvidence || [];
    const existingIssue = (existing?.evidence || []).filter((e) => (e.kind || "ISSUE") === "ISSUE").length;
    const existingCorrection = (existing?.evidence || []).filter((e) => e.kind === "CORRECTION").length;
    if (responseStatus === "SUBMITTED") {
      if (!answer) throw httpError(400, "Select OK, Not OK or N/A before submitting.");
      if (itemData.responseType === "MEASUREMENT" && measurementValue == null) throw httpError(400, "Measurement value is required.");
      if (answer === "NA" && itemData.naReasonRequired !== false && !naReason) throw httpError(400, "N/A reason is required.");
      if (answer === "NON_COMPLIANT" && !observation) throw httpError(400, "Describe what was found for a Not OK item.");
      if (answer !== "NA") {
        // OK: photo, no comment. Not OK: photo + comment (+ recommendation when left open).
        const minimumEvidence = Math.max(1, Number(itemData.minimumEvidence || 0));
        if (existingIssue + issueFiles.length < minimumEvidence) throw httpError(400, `At least ${minimumEvidence} photo(s) are required for this item.`);
      }
      if (answer === "NON_COMPLIANT" && !closedOnSpot && !recommendation) throw httpError(400, "Add the recommended action for a Not OK item that stays open.");
      if (closedOnSpot) {
        if (!correctionComment) throw httpError(400, "Describe the correction made on the spot.");
        if (existingCorrection + correctionFiles.length < 1) throw httpError(400, "A correction photo is required when the item is closed on the spot.");
      }
    }

    const uploadedEvidence = [];
    for (const file of issueFiles) uploadedEvidence.push({ ...(await uploadEvidence(file, session.id)), kind: "ISSUE" });
    for (const file of correctionFiles) uploadedEvidence.push({ ...(await uploadEvidence(file, session.id)), kind: "CORRECTION" });
    const responseData = {
      responseStatus, answer, result: answer, observation, measurementValue, naReason,
      recommendation, responsiblePerson, targetDate, closedOnSpot, correctionComment,
      submittedAt: responseStatus === "SUBMITTED" ? new Date() : null,
    };

    const response = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.clientAuditResponseRevision.create({
          data: {
            responseId: existing.id,
            revisionNumber: existing.revision,
            previousResponse: {
              responseStatus: existing.responseStatus, answer: existing.answer, result: existing.result,
              observation: existing.observation, measurementValue: existing.measurementValue,
              naReason: existing.naReason, recommendation: existing.recommendation,
              responsiblePerson: existing.responsiblePerson, targetDate: existing.targetDate?.toISOString() || null,
              closedOnSpot: existing.closedOnSpot, correctionComment: existing.correctionComment,
              submittedAt: existing.submittedAt?.toISOString() || null,
            },
          },
        });
      }
      const savedResponse = await tx.clientAuditQuestionResponse.upsert({
        where: { sessionId_snapshotItemId: { sessionId: session.id, snapshotItemId: item.id } },
        update: { ...responseData, revision: { increment: 1 }, evidence: uploadedEvidence.length ? { create: uploadedEvidence } : undefined },
        create: { sessionId: session.id, snapshotItemId: item.id, ...responseData, evidence: uploadedEvidence.length ? { create: uploadedEvidence } : undefined },
        include: { evidence: { orderBy: { createdAt: "asc" } }, revisions: { orderBy: { revisionNumber: "desc" } } },
      });
      const existingNc = await tx.clientAuditNonCompliance.findUnique({ where: { responseId: savedResponse.id } });
      if (responseStatus === "SUBMITTED" && answer === "NON_COMPLIANT") {
        const ncNumber = existingNc?.ncNumber || `NC-${session.job.location.locationCode}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        const targetStatus = closedOnSpot ? "CLOSED" : (existingNc?.status === "VOID" || !existingNc ? "OPEN" : existingNc.status);
        const nc = await tx.clientAuditNonCompliance.upsert({
          where: { responseId: savedResponse.id },
          update: { status: targetStatus, closedAt: closedOnSpot ? new Date() : null, observation, recommendation, severity: itemData.severityOnFail || "MEDIUM", priority: itemData.mahindraPriority || "IMPORTANT" },
          create: { ncNumber, responseId: savedResponse.id, jobId: session.jobId, sessionId: session.id, snapshotItemId: item.id, status: targetStatus, closedAt: closedOnSpot ? new Date() : null, observation, recommendation, correctiveAction: closedOnSpot ? correctionComment : null, severity: itemData.severityOnFail || "MEDIUM", priority: itemData.mahindraPriority || "IMPORTANT", history: { create: { action: closedOnSpot ? "CLOSED_ON_SPOT" : "CREATED", toStatus: targetStatus, remarks: closedOnSpot ? correctionComment : "Automatically generated from a Not OK response", actorId: req.user.id } } },
        });
        if (existingNc && existingNc.status !== targetStatus) await tx.clientAuditNcHistory.create({ data: { ncId: nc.id, action: closedOnSpot ? "CLOSED_ON_SPOT" : "REOPENED_FROM_RESPONSE", fromStatus: existingNc.status, toStatus: targetStatus, remarks: closedOnSpot ? correctionComment : null, actorId: req.user.id } });
      } else if (existingNc && !["CLOSED", "VOID"].includes(existingNc.status)) {
        await tx.clientAuditNonCompliance.update({ where: { id: existingNc.id }, data: { status: "VOID", closedAt: new Date() } });
        await tx.clientAuditNcHistory.create({ data: { ncId: existingNc.id, action: "VOIDED", fromStatus: existingNc.status, toStatus: "VOID", remarks: "Response is no longer non-compliant", actorId: req.user.id } });
      }
      return savedResponse;
    });
    res.json({ success: true, message: responseStatus === "SUBMITTED" ? "Response submitted successfully." : "Draft saved successfully.", response });
  } catch (error) { next(error); }
};

const completionReadiness = async (jobId, auditorId) => {
  const session = await prisma.clientAuditSession.findFirst({
    where: { jobId, auditorId },
    include: {
      completion: true,
      responses: { include: { evidence: true } },
      job: {
        include: {
          location: { select: { dealerName: true, locationName: true } },
          snapshot: { include: { items: true } },
          assignments: { where: { auditorId }, select: { assignmentRole: true, track: true } },
        },
      },
    },
  });
  if (!session) throw httpError(403, "Complete geofence check-in before finishing the audit.");
  const track = session.job.assignments[0]?.track || "ALL";
  const scopedItems = itemsForTrack(session.job.snapshot.items, session.job, track);
  const responseMap = new Map(session.responses.map((response) => [response.snapshotItemId, response]));
  const counts = { total: scopedItems.length, submitted: 0, draft: 0, pending: 0, compliant: 0, nonCompliant: 0, na: 0, evidencePhotos: 0 };
  const severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const blockers = [];
  for (const item of scopedItems) {
    const response = responseMap.get(item.id);
    if (!response) { counts.pending += 1; continue; }
    counts.evidencePhotos += response.evidence.length;
    if (response.responseStatus !== "SUBMITTED") { counts.draft += 1; continue; }
    counts.submitted += 1;
    if (response.result === "COMPLIANT") counts.compliant += 1;
    else if (response.result === "NON_COMPLIANT") {
      counts.nonCompliant += 1;
      const level = item.itemData?.severityOnFail || "MEDIUM";
      severity[level] = (severity[level] || 0) + 1;
    } else if (response.result === "NA") counts.na += 1;
  }
  if (session.status !== "IN_PROGRESS") blockers.push(session.status === "COMPLETED" ? "Audit is already completed" : "Audit session is not active");
  if (counts.pending) blockers.push(`${counts.pending} question(s) are pending`);
  if (counts.draft) blockers.push(`${counts.draft} response(s) are still drafts`);
  if (counts.submitted !== counts.total) blockers.push("All applicable questions must be submitted");
  return {
    session,
    readiness: {
      ready: blockers.length === 0,
      blockers,
      summary: { ...counts, progressPercentage: counts.total ? Math.round((counts.submitted / counts.total) * 100) : 0, severity },
      site: session.job.location,
      completedAt: session.completion?.completedAt || null,
    },
  };
};

exports.getCompletionReadiness = async (req, res, next) => {
  try {
    const { readiness } = await completionReadiness(req.params.jobId, req.user.id);
    res.json({ success: true, readiness });
  } catch (error) { next(error); }
};

exports.completeAudit = async (req, res, next) => {
  try {
    const { session, readiness } = await completionReadiness(req.params.jobId, req.user.id);
    if (!readiness.ready) throw httpError(400, `Audit cannot be completed: ${readiness.blockers.join("; ")}`);
    const finalRemarks = clean(req.body.finalRemarks);
    if (!finalRemarks) throw httpError(400, "Final audit remarks are required.");
    if (req.body.declarationAccepted !== true) throw httpError(400, "Auditor declaration must be accepted.");
    const signature = clean(req.body.signature);
    if (!/^data:image\/(png|jpeg);base64,/.test(signature)) throw httpError(400, "A valid digital signature is required.");
    if (signature.length > 4_000_000) throw httpError(400, "Digital signature is too large.");
    const now = new Date();
    const signatureHash = crypto.createHash("sha256").update(signature).digest("hex");
    const completion = await prisma.$transaction(async (tx) => {
      const created = await tx.clientAuditCompletion.create({
        data: { sessionId: session.id, finalRemarks, declarationAccepted: true, signatureUrl: signature, signatureHash, summary: readiness.summary, completedAt: now },
      });
      await tx.clientAuditSession.update({ where: { id: session.id }, data: { status: "COMPLETED", endedAt: now } });
      await tx.clientAuditSessionEvent.create({ data: { sessionId: session.id, eventType: "AUDIT_COMPLETED", eventData: { summary: readiness.summary, signatureHash } } });
      // The job is complete, and its report generated, only when every assigned auditor (track) has finished.
      const assigned = await tx.clientAuditJobAssignment.findMany({ where: { jobId: session.jobId }, select: { auditorId: true } });
      const finished = await tx.clientAuditSession.findMany({ where: { jobId: session.jobId, status: "COMPLETED" }, select: { auditorId: true } });
      const finishedIds = new Set(finished.map((x) => x.auditorId));
      if (assigned.every((a) => finishedIds.has(a.auditorId))) {
        await tx.clientAuditJob.update({ where: { id: session.jobId }, data: { status: "COMPLETED" } });
        const existingReport = await tx.clientAuditReport.findUnique({ where: { jobId: session.jobId } });
        if (!existingReport) await tx.clientAuditReport.create({ data: { jobId: session.jobId, reportNumber: `CAR-${new Date().getFullYear()}-${session.jobId.slice(0, 8).toUpperCase()}`, history: { create: { action: "DRAFT_GENERATED", toStatus: "DRAFT", actorId: req.user.id } } } });
      }
      return created;
    });
    await createNotification({
      title: "Client audit completed",
      message: `${readiness.site.dealerName} - ${readiness.site.locationName} audit was completed with ${readiness.summary.nonCompliant} non-compliant finding(s).`,
      type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED,
      recipientRole: "ADMIN",
      createdById: req.user.id,
      link: "/admin-dashboard/client-audit-scheduling",
    }).catch((notificationError) => console.error("Client audit completion notification failed:", notificationError));
    res.json({ success: true, message: "Audit completed and submitted successfully.", completion, summary: readiness.summary });
  } catch (error) { next(error); }
};
