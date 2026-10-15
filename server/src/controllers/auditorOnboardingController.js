const crypto = require("crypto");
const { issueCredentials, newPassword, hashPassword } = require("../utils/credentials");
const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { sendEmail } = require("../utils/sendEmail");
const { DEFAULT_QUIZ, DEFAULT_DEMO } = require("../utils/auditorTraining");
const { verifyUrl, qrDataUrl, idCardPdf, authorityLetterPdf, certificatePdf } = require("../utils/auditorDocs");

const SKILLS = ["INFRASTRUCTURE", "ELECTRICAL", "FIRE_SAFETY", "THERMOGRAPHY"];
const THRESHOLD_OK = Number(process.env.AUDITOR_SCORE_OK || 80);
const THRESHOLD_BLOCK = Number(process.env.AUDITOR_SCORE_BLOCK || 60);
// A certification lasts this many months; the auditor must complete a refresher training before it expires.
const REFRESHER_MONTHS = Number(process.env.AUDITOR_REFRESHER_MONTHS || 12);
const REFRESHER_WINDOW_DAYS = 30;
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

const fail = (message, statusCode = 400, errors) => { const e = new Error(message); e.statusCode = statusCode; if (errors) e.errors = errors; return e; };
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x) => str(x)).filter(Boolean);

const getContent = async () => {
  let content = await prisma.trainingContent.findUnique({ where: { id: "DEFAULT" } });
  if (!content) content = await prisma.trainingContent.create({ data: { id: "DEFAULT", videoUrl: null, passMark: 80, quiz: DEFAULT_QUIZ, demo: DEFAULT_DEMO } });
  return content;
};

const eventLog = (onboarding, action, by, note) =>
  [...(Array.isArray(onboarding.events) ? onboarding.events : []), { at: new Date().toISOString(), action, by: by || null, note: note || null }];

const tagFor = (score) => (score === null || score === undefined ? null : score >= THRESHOLD_OK ? "ELIGIBLE" : score >= THRESHOLD_BLOCK ? "RETRAIN" : "BLOCKED");

const rollingScore = async (userId, onboarding) => {
  const since = onboarding.approvedAt || new Date(0);
  const audits = await prisma.auditorScore.findMany({ where: { userId, source: "AUDIT_REVIEW", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 3 });
  if (audits.length) return { score: Math.round((audits.reduce((a, b) => a + b.score, 0) / audits.length) * 10) / 10, basis: `Average of last ${audits.length} audit review${audits.length > 1 ? "s" : ""}` };
  if (onboarding.reviewScore !== null && onboarding.reviewScore !== undefined) return { score: onboarding.reviewScore, basis: "Onboarding review score" };
  return { score: null, basis: null };
};

const card = async (user) => {
  const o = user.auditorOnboarding;
  if (!o) return { id: user.id, fullName: user.fullName, email: user.email, username: user.username, status: "LEGACY", score: null, tag: null, skills: user.auditorQualification?.skills || [], regions: user.auditorQualification?.supportedRegions || [], active: user.status };
  const rolling = o.status === "APPROVED" ? await rollingScore(user.id, o) : { score: o.reviewScore ?? null, basis: null };
  const q = user.auditorQualification;
  return {
    id: user.id, fullName: user.fullName, email: user.email, username: user.username, phone: o.phone, baseLocation: o.baseLocation, dateOfBirth: o.dateOfBirth, emergencyContact: o.emergencyContact,
    status: o.status, score: rolling.score, scoreBasis: rolling.basis, tag: o.status === "APPROVED" ? tagFor(rolling.score) : null,
    skills: q?.skills || [], regions: q?.supportedRegions || [], active: user.status, hasPhoto: Boolean(o.photoUrl), auditorCode: o.auditorCode || null,
    certificationExpiresAt: q?.certificationExpiresAt || null,
    fieldReady: Boolean(q && q.status === "ACTIVE" && q.backgroundVerified && q.platformCertified && q.shadowAuditsCompleted >= 1),
    updatedAt: o.updatedAt, createdAt: o.createdAt,
  };
};

const userInclude = { auditorOnboarding: true, auditorQualification: true };

exports.list = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ where: { role: "AUDITOR" }, include: userInclude, orderBy: { createdAt: "desc" } });
    res.json({ success: true, auditors: await Promise.all(users.map(card)) });
  } catch (e) { next(e); }
};

const emailCredentials = async (email, fullName, username, password) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
  const url = process.env.CLIENT_URL || "";
  const info = await sendEmail([email], "Your Bexex Audit Portal login", `Hello ${fullName},\n\nYou have been registered as an auditor on the Bexex Audit Portal.\n\nLogin: ${url}\nUsername: ${username}\nTemporary password: ${password}\n\nAfter logging in, complete the mandatory training, quiz and demo checklist.\n`);
  return Boolean(info);
};

// Creates one auditor (login + qualification + onboarding record). Used by the single form and the Excel import.
const createAuditor = async (body, byUserId = null) => {
  const fullName = str(body.fullName); const email = str(body.email).toLowerCase();
  if (!fullName) throw fail("Full name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("A valid email is required to send the login details.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw fail("A user with this email already exists.");
  const skills = list(body.skills).map((s) => s.toUpperCase());
  if (skills.some((s) => !SKILLS.includes(s))) throw fail("Invalid skill selected.");
  const regions = list(body.supportedRegions).map((r) => r.toUpperCase());
  const { username, password, hash } = await issueCredentials();
  const user = await prisma.user.create({
    data: {
      fullName, email, username, password: hash, mustChangePassword: true, role: "AUDITOR",
      auditorQualification: { create: { skills, supportedRegions: regions, calibrationScore: 0, status: "INACTIVE" } },
      auditorOnboarding: { create: { phone: str(body.phone) || null, baseLocation: str(body.baseLocation) || null, dateOfBirth: parseDob(body.dateOfBirth), emergencyContact: str(body.emergencyContact) || null, notes: str(body.notes) || null, createdById: byUserId, events: [{ at: new Date().toISOString(), action: "CREATED", by: byUserId, note: null }] } },
    },
    include: userInclude,
  });
  // The login is created now but only sent when Back-Admin chooses to (see resendCredentials).
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, include: userInclude });
  return { auditor: await card(fresh), username };
};

exports.create = async (req, res, next) => {
  try {
    const { auditor, username } = await createAuditor(req.body, req.user?.id);
    res.status(201).json({ success: true, auditor, credentials: { username } });
  } catch (e) { next(e); }
};

exports.helpers = { createAuditor };

exports.resendCredentials = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, include: userInclude });
    if (!user || user.role !== "AUDITOR" || !user.auditorOnboarding) throw fail("Auditor not found.", 404);
    const password = newPassword();
    await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password), mustChangePassword: true } });
    const emailSent = await emailCredentials(user.email, user.fullName, user.username, password);
    const first = !user.auditorOnboarding.emailSent;
    // Mark as sent only when the email really went out; a failed resend keeps the earlier status.
    await prisma.auditorOnboarding.update({ where: { userId: user.id }, data: { emailSent: emailSent || user.auditorOnboarding.emailSent, ...(emailSent ? { credentialsSentAt: new Date() } : {}) } });
    res.json({ success: true, first, credentials: { username: user.username, password, emailSent } });
  } catch (e) { next(e); }
};

// Date of birth arrives as YYYY-MM-DD; it must be a real past date and the auditor an adult.
const parseDob = (value) => {
  const v = str(value);
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw fail("Enter a valid date of birth.");
  const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if (age < 18 || age > 80) throw fail("Date of birth must make the auditor between 18 and 80 years old.");
  return d;
};

exports.updateProfile = async (req, res, next) => {
  try {
    const o = await prisma.auditorOnboarding.findUnique({ where: { userId: req.params.userId } });
    if (!o) throw fail("Auditor not found.", 404);
    const data = {};
    if (req.body.dateOfBirth !== undefined) data.dateOfBirth = parseDob(req.body.dateOfBirth);
    if (req.body.phone !== undefined) data.phone = str(req.body.phone) || null;
    if (req.body.emergencyContact !== undefined) data.emergencyContact = str(req.body.emergencyContact) || null;
    await prisma.auditorOnboarding.update({ where: { userId: req.params.userId }, data });
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.detail = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, include: userInclude });
    if (!user || user.role !== "AUDITOR") throw fail("Auditor not found.", 404);
    const content = await getContent();
    const scores = await prisma.auditorScore.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 });
    const changeRequests = await prisma.auditorChangeRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
    res.json({ success: true, auditor: await card(user), onboarding: user.auditorOnboarding, changeRequests, qualification: user.auditorQualification, scores, content: { passMark: content.passMark, quiz: content.quiz, demo: content.demo }, thresholds: { ok: THRESHOLD_OK, block: THRESHOLD_BLOCK } });
  } catch (e) { next(e); }
};

const loadOnboarding = async (userId, expected) => {
  const o = await prisma.auditorOnboarding.findUnique({ where: { userId } });
  if (!o) throw fail("Onboarding record not found.", 404);
  if (expected && !expected.includes(o.status)) throw fail(`This action is not available while the status is ${o.status}.`);
  return o;
};

exports.review = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["UNDER_REVIEW"]);
    const demoScore = Number(req.body.demoScore); const decision = str(req.body.decision).toUpperCase();
    if (!Number.isFinite(demoScore) || demoScore < 0 || demoScore > 100) throw fail("Enter the demo checklist score (0-100).");
    if (!["PASS", "RETRAIN"].includes(decision)) throw fail("Choose pass or retrain.");
    if (!str(req.body.remarks)) throw fail("Add review remarks.");
    const content = await getContent();
    const reviewScore = Math.round((o.quizScore * 0.5 + demoScore * 0.5) * 10) / 10;
    if (decision === "PASS" && reviewScore < content.passMark) throw fail(`Combined score ${reviewScore}% is below the ${content.passMark}% pass mark. Send for retraining.`);
    const status = decision === "PASS" ? "AWAITING_APPROVAL" : "RETRAINING";
    await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status, demoScore, reviewScore, reviewRemarks: str(req.body.remarks), reviewedById: req.user?.id || null, reviewedAt: new Date(), events: eventLog(o, `REVIEW_${decision}`, req.user?.id, `Score ${reviewScore}%`) } });
    await prisma.auditorScore.create({ data: { userId: o.userId, source: "CALIBRATION", score: reviewScore, reference: "Onboarding review", createdById: req.user?.id || null } });
    res.json({ success: true, message: decision === "PASS" ? "Sent for approval." : "Sent for retraining." });
  } catch (e) { next(e); }
};

exports.approve = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["AWAITING_APPROVAL"]);
    const user = await prisma.user.findUnique({ where: { id: o.userId }, include: { auditorQualification: true } });
    await prisma.$transaction([
      prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "APPROVED", auditorCode: o.auditorCode || `BXA-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, idIssuedAt: o.idIssuedAt || new Date(), approvedAt: new Date(), approvedById: req.user?.id || null, approvalRemarks: str(req.body.remarks) || null, events: eventLog(o, "APPROVED", req.user?.id, str(req.body.remarks)) } }),
      prisma.auditorQualification.update({ where: { userId: o.userId }, data: { status: "ACTIVE", platformCertified: true, calibrationScore: o.reviewScore, certificationExpiresAt: addMonths(new Date(), REFRESHER_MONTHS) } }),
    ]);
    res.json({ success: true, message: `${user.fullName} approved.` });
  } catch (e) { next(e); }
};

exports.reject = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["AWAITING_APPROVAL", "UNDER_REVIEW"]);
    if (!str(req.body.reason)) throw fail("Add the reason for rejection.");
    await prisma.$transaction([
      prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "REJECTED", rejectionReason: str(req.body.reason), events: eventLog(o, "REJECTED", req.user?.id, str(req.body.reason)) } }),
      prisma.user.update({ where: { id: o.userId }, data: { status: false } }),
      prisma.auditorQualification.updateMany({ where: { userId: o.userId }, data: { status: "INACTIVE" } }),
    ]);
    res.json({ success: true, message: "Auditor rejected." });
  } catch (e) { next(e); }
};

exports.sendForRetraining = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["APPROVED"]);
    await prisma.$transaction([
      prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "RETRAINING", videoProgress: 0, quizAnswers: null, demoAnswers: null, events: eventLog(o, "RETRAINING_REQUESTED", req.user?.id, str(req.body.reason)) } }),
      prisma.auditorQualification.updateMany({ where: { userId: o.userId }, data: { status: "INACTIVE" } }),
    ]);
    res.json({ success: true, message: "Sent for retraining." });
  } catch (e) { next(e); }
};

exports.addScore = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["APPROVED"]);
    const score = Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw fail("Score must be between 0 and 100.");
    await prisma.auditorScore.create({ data: { userId: o.userId, source: "AUDIT_REVIEW", score, reference: str(req.body.reference) || null, createdById: req.user?.id || null } });
    const rolling = await rollingScore(o.userId, o);
    // Keep the scheduling rules in step: below the pass level the auditor cannot be planned.
    await prisma.auditorQualification.updateMany({ where: { userId: o.userId }, data: { calibrationScore: rolling.score, status: rolling.score < THRESHOLD_BLOCK ? "INACTIVE" : "ACTIVE" } });
    res.json({ success: true, score: rolling.score, tag: tagFor(rolling.score) });
  } catch (e) { next(e); }
};

exports.updateFieldReadiness = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.params.userId, ["APPROVED"]);
    const data = {
      backgroundVerified: Boolean(req.body.backgroundVerified),
      shadowAuditsCompleted: Math.max(0, Number(req.body.shadowAuditsCompleted || 0)),
      authorityLetterNumber: str(req.body.authorityLetterNumber) || null,
      // Only change the expiry when a date is sent: approval already set it, and saving other readiness fields must not clear it.
      ...(req.body.certificationExpiresAt ? { certificationExpiresAt: new Date(req.body.certificationExpiresAt) } : {}),
    };
    await prisma.auditorQualification.update({ where: { userId: o.userId }, data });
    res.json({ success: true });
  } catch (e) { next(e); }
};

/* ----- auditor self-service ----- */
const publicContent = (content) => ({
  videoUrl: content.videoUrl, passMark: content.passMark,
  quiz: content.quiz.map(({ id, text, options }) => ({ id, text, options })),
  demo: content.demo.map(({ id, title, scenario, imageUrl }) => ({ id, title, scenario, imageUrl })),
});

// When the certification ends and whether the auditor may (or must) start a refresher now.
const refresherInfo = async (o) => {
  if (o.status !== "APPROVED") return { expiresAt: null, refresherDue: false, canStartRefresher: false, expired: false };
  const q = await prisma.auditorQualification.findUnique({ where: { userId: o.userId }, select: { certificationExpiresAt: true } });
  const expiresAt = q?.certificationExpiresAt || (o.approvedAt ? addMonths(o.approvedAt, REFRESHER_MONTHS) : null);
  const days = expiresAt ? Math.ceil((new Date(expiresAt) - Date.now()) / 864e5) : null;
  return { expiresAt, refresherDue: days !== null && days <= REFRESHER_WINDOW_DAYS, canStartRefresher: days !== null && days <= REFRESHER_WINDOW_DAYS, expired: days !== null && days < 0, daysLeft: days };
};

exports.myTraining = async (req, res, next) => {
  try {
    let o = await prisma.auditorOnboarding.findUnique({ where: { userId: req.user.id } });
    if (!o) throw fail("No onboarding is required for your account.", 404);
    if (o.status === "CREATED") o = await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "TRAINING", events: eventLog(o, "TRAINING_STARTED", req.user.id) } });
    const content = await getContent();
    res.json({ success: true, onboarding: { status: o.status, videoProgress: o.videoProgress, quizScore: o.quizScore, quizAttempts: o.quizAttempts, reviewScore: o.reviewScore, reviewRemarks: o.reviewRemarks, rejectionReason: o.rejectionReason, quizAnswers: o.quizAnswers, demoAnswers: o.demoAnswers, demoScore: o.demoScore, approvedAt: o.approvedAt, auditorCode: o.auditorCode, events: o.events, ...(await refresherInfo(o)) }, content: publicContent(content) });
  } catch (e) { next(e); }
};

exports.myVideoProgress = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.user.id, ["TRAINING", "RETRAINING"]);
    const content = await getContent();
    const claimed = Math.min(100, Math.round(Number(req.body.progress) || 0));
    // With a published video the player reports as it plays, so one report cannot jump far ahead of the last one.
    const progress = Math.max(o.videoProgress, content.videoUrl ? Math.min(claimed, o.videoProgress + 25) : claimed);
    await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { videoProgress: progress } });
    res.json({ success: true, videoProgress: progress });
  } catch (e) { next(e); }
};

exports.mySubmit = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.user.id, ["TRAINING", "RETRAINING"]);
    const content = await getContent();
    if (o.videoProgress < 90) throw fail("Finish the training video before submitting.");
    const quizAnswers = req.body.quizAnswers || {}; const demoAnswers = req.body.demoAnswers || {};
    if (content.quiz.some((q) => quizAnswers[q.id] === undefined || quizAnswers[q.id] === null)) throw fail("Answer every quiz question.");
    for (const d of content.demo) {
      const a = demoAnswers[d.id];
      if (!a || !["OK", "NOT_OK", "NA"].includes(a.result)) throw fail("Complete every demo checklist item.");
      if (a.result !== "OK" && !str(a.comment)) throw fail(`Add a comment for "${d.title}".`);
    }
    const correct = content.quiz.filter((q) => Number(quizAnswers[q.id]) === q.answer).length;
    const quizScore = Math.round((correct / content.quiz.length) * 1000) / 10;
    if (quizScore < content.passMark) {
      await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "RETRAINING", quizScore, quizAttempts: { increment: 1 }, quizAnswers, demoAnswers: null, videoProgress: 0, events: eventLog(o, "QUIZ_FAILED", req.user.id, `${quizScore}%`) } });
      return res.json({ success: true, passed: false, quizScore, passMark: content.passMark, message: `Quiz score ${quizScore}% is below the ${content.passMark}% pass mark. Review the training and try again.` });
    }
    await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "UNDER_REVIEW", quizScore, quizAttempts: { increment: 1 }, quizAnswers, demoAnswers, trainingSubmittedAt: new Date(), events: eventLog(o, "SUBMITTED_FOR_REVIEW", req.user.id, `Quiz ${quizScore}%`) } });
    res.json({ success: true, passed: true, quizScore, passMark: content.passMark, message: "Submitted for Back-Admin review." });
  } catch (e) { next(e); }
};

/* ----- refresher training, certificate, training content ----- */
exports.startRefresher = async (req, res, next) => {
  try {
    const o = await loadOnboarding(req.user.id, ["APPROVED"]);
    const info = await refresherInfo(o);
    if (!info.canStartRefresher) throw fail(`Refresher training opens ${REFRESHER_WINDOW_DAYS} days before your certification ends (${info.expiresAt ? new Date(info.expiresAt).toLocaleDateString("en-IN") : "date not set"}).`);
    // The auditor stays plannable until the certification actually ends; the new approval then renews it.
    await prisma.auditorOnboarding.update({ where: { userId: o.userId }, data: { status: "RETRAINING", videoProgress: 0, quizAnswers: null, demoAnswers: null, events: eventLog(o, "REFRESHER_STARTED", req.user.id, "Annual refresher training") } });
    res.json({ success: true, message: "Refresher training started." });
  } catch (e) { next(e); }
};

exports.certificatePdf = async (req, res, next) => {
  try {
    const card = await ownCard(req);
    const o = await prisma.auditorOnboarding.findUnique({ where: { userId: card.userId } });
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename=${card.auditorCode}-certificate.pdf`);
    await certificatePdf(res, { ...card, quizScore: o.quizScore, demoScore: o.demoScore, reviewScore: o.reviewScore });
  } catch (e) { next(e); }
};

exports.getTrainingContent = async (req, res, next) => {
  try { const c = await getContent(); res.json({ success: true, content: { videoUrl: c.videoUrl || "", passMark: c.passMark, quiz: c.quiz, demo: c.demo, updatedAt: c.updatedAt } }); } catch (e) { next(e); }
};

exports.saveTrainingContent = async (req, res, next) => {
  try {
    const passMark = Number(req.body.passMark);
    if (!Number.isFinite(passMark) || passMark < 50 || passMark > 100) throw fail("The pass mark must be between 50 and 100.");
    const videoUrl = str(req.body.videoUrl);
    if (videoUrl && !/^https?:\/\//i.test(videoUrl)) throw fail("The video link must start with http:// or https://.");
    const quiz = (Array.isArray(req.body.quiz) ? req.body.quiz : []).map((q, i) => ({ id: str(q.id) || `q${i + 1}`, text: str(q.text), options: (Array.isArray(q.options) ? q.options : []).map(str).filter(Boolean), answer: Number(q.answer) }));
    if (quiz.length < 3) throw fail("Add at least 3 quiz questions.");
    quiz.forEach((q, i) => { if (!q.text) throw fail(`Question ${i + 1} has no text.`); if (q.options.length < 2) throw fail(`Question ${i + 1} needs at least two options.`); if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) throw fail(`Choose the correct option for question ${i + 1}.`); });
    const demo = (Array.isArray(req.body.demo) ? req.body.demo : []).map((d, i) => ({ id: str(d.id) || `d${i + 1}`, title: str(d.title), scenario: str(d.scenario), imageUrl: str(d.imageUrl) || undefined, expected: str(d.expected).toUpperCase(), expectedNote: str(d.expectedNote) }));
    if (!demo.length) throw fail("Add at least one demo checklist item.");
    demo.forEach((d, i) => { if (!d.title || !d.scenario) throw fail(`Demo item ${i + 1} needs a title and a scenario.`); if (!["OK", "NOT_OK", "NA"].includes(d.expected)) throw fail(`Choose the expected answer for demo item ${i + 1}.`); });
    await getContent();
    const c = await prisma.trainingContent.update({ where: { id: "DEFAULT" }, data: { videoUrl: videoUrl || null, passMark: Math.round(passMark), quiz, demo } });
    res.json({ success: true, message: "Training content saved. It applies to everyone who starts or restarts training from now on.", content: c });
  } catch (e) { next(e); }
};

/* ----- photo, ID card, authority letter, verification ----- */
const savePhoto = async (userId, photo) => {
  if (!/^data:image\/(png|jpeg);base64,/.test(str(photo))) throw fail("Upload a JPEG or PNG photo.");
  if (photo.length > 600_000) throw fail("The photo is too large. Use a smaller image.");
  await prisma.auditorOnboarding.update({ where: { userId }, data: { photoUrl: photo } });
};
exports.setPhoto = async (req, res, next) => { try { await loadOnboarding(req.params.userId); await savePhoto(req.params.userId, req.body.photo); res.json({ success: true, message: "Photo saved." }); } catch (e) { next(e); } };
exports.setMyPhoto = async (req, res, next) => { try { await loadOnboarding(req.user.id); await savePhoto(req.user.id, req.body.photo); res.json({ success: true, message: "Photo saved." }); } catch (e) { next(e); } };

const cardFor = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user || user.role !== "AUDITOR" || !user.auditorOnboarding) throw fail("Auditor not found.", 404);
  const o = user.auditorOnboarding; const q = user.auditorQualification;
  return { userId, fullName: user.fullName, email: user.email, phone: o.phone, baseLocation: o.baseLocation, dateOfBirth: o.dateOfBirth, emergencyContact: o.emergencyContact, status: o.status, photoUrl: o.photoUrl, auditorCode: o.auditorCode, idIssuedAt: o.idIssuedAt, approvedAt: o.approvedAt,
    skills: q?.skills || [], regions: q?.supportedRegions || [], authorityLetterNumber: q?.authorityLetterNumber || null, certificationExpiresAt: q?.certificationExpiresAt || null, shadowAudits: q?.shadowAuditsCompleted || 0, backgroundVerified: Boolean(q?.backgroundVerified) };
};
const ownCard = async (req) => {
  const id = req.user.role === "AUDITOR" ? req.user.id : req.params.userId;
  if (req.user.role === "AUDITOR" && req.params.userId && req.params.userId !== "me" && req.params.userId !== req.user.id) throw fail("You can only open your own ID card.", 403);
  const card = await cardFor(id);
  if (card.status !== "APPROVED" || !card.auditorCode) throw fail("An ID card is issued once the auditor is approved.", 400);
  return card;
};
exports.idCard = async (req, res, next) => {
  try { const card = await ownCard(req); res.json({ success: true, card, qr: await qrDataUrl(verifyUrl(card.auditorCode)), verifyUrl: verifyUrl(card.auditorCode) }); } catch (e) { next(e); }
};
exports.idCardPdf = async (req, res, next) => {
  try { const card = await ownCard(req); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename=${card.auditorCode}-id-card.pdf`); await idCardPdf(res, card); } catch (e) { next(e); }
};
exports.letterPdf = async (req, res, next) => {
  try { const card = await ownCard(req); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename=${card.auditorCode}-authority-letter.pdf`); await authorityLetterPdf(res, card); } catch (e) { next(e); }
};
exports.verifyAuditor = async (req, res, next) => {
  try {
    const o = await prisma.auditorOnboarding.findUnique({ where: { auditorCode: String(req.params.code).toUpperCase() } });
    if (!o) return res.json({ success: true, valid: false });
    const card = await cardFor(o.userId);
    const live = card.status === "APPROVED" && (!card.certificationExpiresAt || new Date(card.certificationExpiresAt) > new Date());
    res.json({ success: true, valid: live, auditor: { fullName: card.fullName, auditorCode: card.auditorCode, photoUrl: card.photoUrl, skills: card.skills, regions: card.regions, validTill: card.certificationExpiresAt, authorityLetterNumber: card.authorityLetterNumber, status: live ? "Active" : "Not active" } });
  } catch (e) { next(e); }
};

// ---- Card change requests ------------------------------------------------------------------
const CHANGE_FIELDS = ["fullName", "phone", "emergencyContact", "dateOfBirth", "baseLocation", "photo"];

const cleanChanges = (raw) => {
  const out = {};
  for (const key of CHANGE_FIELDS) {
    const v = raw?.[key];
    if (v === undefined || v === null || str(v) === "") continue;
    if (key === "photo") { if (!/^data:image\/(png|jpeg);base64,/.test(str(v))) throw fail("Upload a JPEG or PNG photo."); if (str(v).length > 600_000) throw fail("The photo is too large. Use a smaller image."); out.photo = str(v); }
    else if (key === "dateOfBirth") { parseDob(v); out.dateOfBirth = str(v); }
    else out[key] = str(v).slice(0, 120);
  }
  if (!Object.keys(out).length) throw fail("Choose at least one detail to change.");
  return out;
};

exports.myProfile = async (req, res, next) => {
  try {
    const card = await cardFor(req.user.id);
    const o = await prisma.auditorOnboarding.findUnique({ where: { userId: req.user.id } });
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { username: true } });
    const requests = await prisma.auditorChangeRequest.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 20 });
    // Only what the auditor needs to see: what happened and when (no reviewer notes).
    const history = (Array.isArray(o.events) ? o.events : []).map((e) => ({ at: e.at, action: e.action })).reverse();
    res.json({ success: true, card: { ...card, photoUrl: card.photoUrl }, username: user.username, history, requests: requests.map((r) => ({ id: r.id, status: r.status, reason: r.reason, remarks: r.remarks, createdAt: r.createdAt, decidedAt: r.decidedAt, fields: Object.keys(r.changes || {}) })) });
  } catch (e) { next(e); }
};

exports.requestChange = async (req, res, next) => {
  try {
    const o = await prisma.auditorOnboarding.findUnique({ where: { userId: req.user.id }, include: { user: { select: { fullName: true } } } });
    if (!o) throw fail("No onboarding record for your account.", 404);
    if (await prisma.auditorChangeRequest.findFirst({ where: { userId: req.user.id, status: "PENDING" } })) throw fail("You already have a request waiting for Back-Admin. Wait for the decision before sending another.");
    const changes = cleanChanges(req.body.changes);
    const reason = str(req.body.reason);
    if (reason.length < 5) throw fail("Tell Back-Admin why the change is needed.");
    const request = await prisma.auditorChangeRequest.create({ data: { userId: req.user.id, changes, reason } });
    await prisma.auditorOnboarding.update({ where: { userId: req.user.id }, data: { events: eventLog(o, "CHANGE_REQUESTED", req.user.id, Object.keys(changes).join(", ")) } });
    await createNotification({ title: "ID card change requested", message: `${o.user.fullName} asked to change: ${Object.keys(changes).join(", ")}.`, type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientRole: "ADMIN", createdById: req.user.id, link: `/admin-dashboard/auditor-onboarding/${req.user.id}` }).catch(() => null);
    res.status(201).json({ success: true, id: request.id });
  } catch (e) { next(e); }
};

exports.decideChange = async (req, res, next) => {
  try {
    const request = await prisma.auditorChangeRequest.findUnique({ where: { id: req.params.requestId } });
    if (!request || request.userId !== req.params.userId) throw fail("Request not found.", 404);
    if (request.status !== "PENDING") throw fail("This request was already decided.");
    const approve = req.body.decision === "APPROVE";
    const remarks = str(req.body.remarks);
    if (!approve && !remarks) throw fail("Give a reason so the auditor knows why it was declined.");
    const o = await prisma.auditorOnboarding.findUnique({ where: { userId: request.userId } });
    if (approve) {
      const ch = request.changes || {};
      const data = {};
      if (ch.phone) data.phone = ch.phone;
      if (ch.emergencyContact) data.emergencyContact = ch.emergencyContact;
      if (ch.baseLocation) data.baseLocation = ch.baseLocation;
      if (ch.dateOfBirth) data.dateOfBirth = parseDob(ch.dateOfBirth);
      if (ch.photo) data.photoUrl = ch.photo;
      if (Object.keys(data).length) await prisma.auditorOnboarding.update({ where: { userId: request.userId }, data });
      if (ch.fullName) await prisma.user.update({ where: { id: request.userId }, data: { fullName: ch.fullName } });
    }
    await prisma.auditorChangeRequest.update({ where: { id: request.id }, data: { status: approve ? "APPROVED" : "REJECTED", remarks: remarks || null, decidedById: req.user.id, decidedAt: new Date() } });
    const fresh = await prisma.auditorOnboarding.findUnique({ where: { userId: request.userId } });
    await prisma.auditorOnboarding.update({ where: { userId: request.userId }, data: { events: eventLog(fresh, approve ? "CHANGE_APPROVED" : "CHANGE_DECLINED", req.user.id, remarks) } });
    await createNotification({ title: approve ? "Card change approved" : "Card change declined", message: approve ? "Your ID card now shows the updated details." : `Back-Admin declined your request: ${remarks}`, type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientId: request.userId, createdById: req.user.id, link: "/auditor-dashboard/profile" }).catch(() => null);
    res.json({ success: true });
  } catch (e) { next(e); }
};
