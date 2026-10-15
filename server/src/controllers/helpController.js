const prisma = require("../config/prisma");
const { createNotification, NOTIFICATION_TYPES } = require("../utils/notificationService");
const { POLICIES, GUIDES, TRAINING, CLIENT_ROLES } = require("../utils/helpDefaults");

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const isAdmin = (req) => req.user.role === "ADMIN";
const forRole = (audience, role) => (audience || []).includes("ALL") || (audience || []).includes(role);
const guideKeyFor = (role) => (role === "ADMIN" ? "ADMIN" : role === "AUDITOR" ? "AUDITOR" : "CLIENT");

// Starter content is created the first time anyone opens the help centre.
let seeded = false;
const ensureDefaults = async () => {
  if (seeded) return;
  if ((await prisma.policy.count()) === 0) await prisma.policy.createMany({ data: POLICIES.map((p) => ({ ...p, requiresAck: true })) });
  if ((await prisma.trainingModule.count()) === 0) await prisma.trainingModule.createMany({ data: TRAINING });
  seeded = true;
};

// ---- policies ------------------------------------------------------------------------------
const policiesFor = async (user) => {
  await ensureDefaults();
  const all = await prisma.policy.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const mine = all.filter((p) => forRole(p.audience, user.role));
  const acks = await prisma.policyAcknowledgement.findMany({ where: { userId: user.id, policyId: { in: mine.map((p) => p.id) } } });
  return mine.map((p) => {
    const ack = acks.filter((a) => a.policyId === p.id).sort((a, b) => b.version - a.version)[0];
    return { id: p.id, key: p.key, title: p.title, body: p.body, version: p.version, requiresAck: p.requiresAck, publishedAt: p.publishedAt, acceptedVersion: ack?.version || null, acceptedAt: ack?.acknowledgedAt || null, pending: p.requiresAck && (!ack || ack.version < p.version) };
  });
};

exports.policies = async (req, res, next) => { try { res.json({ success: true, policies: await policiesFor(req.user) }); } catch (e) { next(e); } };

exports.acknowledge = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const mine = (await policiesFor(req.user)).filter((p) => ids.includes(p.id));
    if (!mine.length) throw fail("Choose the policies you are accepting.");
    for (const p of mine) {
      await prisma.policyAcknowledgement.upsert({
        where: { userId_policyId_version: { userId: req.user.id, policyId: p.id, version: p.version } },
        create: { userId: req.user.id, policyId: p.id, version: p.version, ipAddress: req.ip || null, userAgent: str(req.headers["user-agent"]).slice(0, 250) || null },
        update: {},
      });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
};

// ---- guide ---------------------------------------------------------------------------------
exports.guide = async (req, res, next) => {
  try {
    const key = guideKeyFor(req.user.role);
    const progress = await prisma.userGuideProgress.findUnique({ where: { userId_guideKey: { userId: req.user.id, guideKey: key } } });
    res.json({ success: true, key, steps: GUIDES[key], progress: progress ? { stepIndex: progress.stepIndex, completed: Boolean(progress.completedAt), skipped: Boolean(progress.skippedAt) } : null });
  } catch (e) { next(e); }
};

exports.guideProgress = async (req, res, next) => {
  try {
    const key = guideKeyFor(req.user.role);
    const data = { stepIndex: Math.max(0, Math.min(50, Number(req.body.stepIndex) || 0)), ...(req.body.completed ? { completedAt: new Date() } : {}), ...(req.body.skipped ? { skippedAt: new Date() } : {}) };
    await prisma.userGuideProgress.upsert({ where: { userId_guideKey: { userId: req.user.id, guideKey: key } }, create: { userId: req.user.id, guideKey: key, ...data }, update: data });
    res.json({ success: true });
  } catch (e) { next(e); }
};

// What must be shown straight after login: unaccepted policies first, then the guide.
exports.bootstrap = async (req, res, next) => {
  try {
    const policies = (await policiesFor(req.user)).filter((p) => p.pending);
    const key = guideKeyFor(req.user.role);
    const progress = await prisma.userGuideProgress.findUnique({ where: { userId_guideKey: { userId: req.user.id, guideKey: key } } });
    res.json({ success: true, pendingPolicies: policies, showGuide: !progress || (!progress.completedAt && !progress.skippedAt), guideKey: key });
  } catch (e) { next(e); }
};

// ---- training ------------------------------------------------------------------------------
exports.training = async (req, res, next) => {
  try {
    await ensureDefaults();
    const modules = (await prisma.trainingModule.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })).filter((m) => forRole(m.audience, req.user.role));
    const done = await prisma.trainingProgress.findMany({ where: { userId: req.user.id, moduleId: { in: modules.map((m) => m.id) } } });
    const doneIds = new Set(done.map((d) => d.moduleId));
    res.json({ success: true, modules: modules.map((m) => ({ ...m, completed: doneIds.has(m.id) })), completedCount: doneIds.size, total: modules.length });
  } catch (e) { next(e); }
};

exports.completeTraining = async (req, res, next) => {
  try {
    const module = await prisma.trainingModule.findUnique({ where: { id: req.params.id } });
    if (!module || !forRole(module.audience, req.user.role)) throw fail("Training module not found.", 404);
    await prisma.trainingProgress.upsert({ where: { moduleId_userId: { moduleId: module.id, userId: req.user.id } }, create: { moduleId: module.id, userId: req.user.id }, update: {} });
    res.json({ success: true });
  } catch (e) { next(e); }
};

// ---- support tickets -----------------------------------------------------------------------
const CATEGORIES = ["REPORT", "ACCESS", "AUDIT", "TECHNICAL", "TRAINING", "BILLING", "OTHER"];
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];

const ticketCard = (t, names) => ({ id: t.id, ticketNumber: t.ticketNumber, category: t.category, priority: t.priority, subject: t.subject, status: t.status, reportId: t.reportId, createdAt: t.createdAt, updatedAt: t.updatedAt, resolvedAt: t.resolvedAt, requester: names?.[t.userId] || null, lastMessageAt: t.messages?.[0]?.createdAt || t.createdAt });
const namesOf = async (ids) => Object.fromEntries((await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, fullName: true, role: true, email: true } })).map((u) => [u.id, u]));

exports.listTickets = async (req, res, next) => {
  try {
    const where = isAdmin(req) ? (req.query.status ? { status: { in: String(req.query.status).split(",") } } : {}) : { userId: req.user.id };
    const tickets = await prisma.supportTicket.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const names = isAdmin(req) ? await namesOf(tickets.map((t) => t.userId)) : null;
    res.json({ success: true, tickets: tickets.map((t) => ticketCard(t, names)) });
  } catch (e) { next(e); }
};

exports.createTicket = async (req, res, next) => {
  try {
    const subject = str(req.body.subject); const description = str(req.body.description);
    const category = str(req.body.category).toUpperCase();
    if (subject.length < 4) throw fail("Give the problem a short title.");
    if (description.length < 10) throw fail("Describe the problem so we can help.");
    if (!CATEGORIES.includes(category)) throw fail("Choose a category.");
    const priority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(str(req.body.priority).toUpperCase()) ? str(req.body.priority).toUpperCase() : "NORMAL";
    const count = await prisma.supportTicket.count();
    const ticket = await prisma.supportTicket.create({ data: { ticketNumber: `SUP-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`, userId: req.user.id, category, priority, subject, description, reportId: str(req.body.reportId) || null, messages: { create: [{ authorId: req.user.id, body: description }] } } });
    await createNotification({ title: `New support ticket ${ticket.ticketNumber}`, message: `${subject}`, type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientRole: "ADMIN", createdById: req.user.id, link: `/admin-dashboard/help-admin?ticket=${ticket.id}` }).catch(() => null);
    res.status(201).json({ success: true, id: ticket.id, ticketNumber: ticket.ticketNumber });
  } catch (e) { next(e); }
};

const loadTicket = async (req) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket || (!isAdmin(req) && ticket.userId !== req.user.id)) throw fail("Ticket not found.", 404);
  return ticket;
};

exports.ticket = async (req, res, next) => {
  try {
    const t = await loadTicket(req);
    const names = await namesOf([t.userId, ...t.messages.map((m) => m.authorId)]);
    res.json({ success: true, ticket: { ...ticketCard(t, names), description: t.description }, messages: t.messages.filter((m) => isAdmin(req) || !m.internal).map((m) => ({ id: m.id, body: m.body, fromStaff: m.fromStaff, internal: m.internal, createdAt: m.createdAt, author: names[m.authorId]?.fullName || "—" })) });
  } catch (e) { next(e); }
};

exports.reply = async (req, res, next) => {
  try {
    const t = await loadTicket(req);
    const body = str(req.body.body);
    if (body.length < 2) throw fail("Write a message.");
    const staff = isAdmin(req); const internal = staff && Boolean(req.body.internal);
    await prisma.supportMessage.create({ data: { ticketId: t.id, authorId: req.user.id, fromStaff: staff, body, internal } });
    const nextStatus = staff ? (internal ? t.status : t.status === "OPEN" ? "IN_PROGRESS" : t.status) : (["RESOLVED", "CLOSED", "WAITING_ON_USER"].includes(t.status) ? "OPEN" : t.status);
    await prisma.supportTicket.update({ where: { id: t.id }, data: { status: nextStatus, updatedAt: new Date() } });
    if (staff && !internal) await createNotification({ title: `Reply on ${t.ticketNumber}`, message: body.slice(0, 120), type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientId: t.userId, createdById: req.user.id, link: "/help" }).catch(() => null);
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.updateTicket = async (req, res, next) => {
  try {
    const t = await loadTicket(req);
    const data = {};
    if (req.body.status) { if (!STATUSES.includes(req.body.status)) throw fail("Invalid status."); data.status = req.body.status; data.resolvedAt = ["RESOLVED", "CLOSED"].includes(req.body.status) ? new Date() : null; }
    if (req.body.priority) data.priority = req.body.priority;
    await prisma.supportTicket.update({ where: { id: t.id }, data });
    if (data.status === "RESOLVED") await createNotification({ title: `${t.ticketNumber} resolved`, message: "Your support request has been marked resolved. Reply if it is not fixed.", type: NOTIFICATION_TYPES.CLIENT_AUDIT_COMPLETED, recipientId: t.userId, createdById: req.user.id, link: "/help" }).catch(() => null);
    res.json({ success: true });
  } catch (e) { next(e); }
};

// ---- Back-Admin: policies and training content ---------------------------------------------
exports.adminPolicies = async (req, res, next) => {
  try {
    await ensureDefaults();
    const policies = await prisma.policy.findMany({ orderBy: { sortOrder: "asc" } });
    const users = await prisma.user.findMany({ where: { status: true }, select: { id: true, role: true } });
    const acks = await prisma.policyAcknowledgement.findMany({ select: { policyId: true, userId: true, version: true } });
    res.json({ success: true, policies: policies.map((p) => {
      const audience = users.filter((u) => forRole(p.audience, u.role));
      const accepted = audience.filter((u) => acks.some((a) => a.policyId === p.id && a.userId === u.id && a.version >= p.version)).length;
      return { ...p, audienceCount: audience.length, acceptedCount: accepted };
    }) });
  } catch (e) { next(e); }
};

exports.savePolicy = async (req, res, next) => {
  try {
    const title = str(req.body.title); const body = str(req.body.body);
    if (!title || body.length < 20) throw fail("A policy needs a title and its text.");
    const audience = (Array.isArray(req.body.audience) ? req.body.audience : []).map((a) => String(a).toUpperCase());
    if (!audience.length) throw fail("Choose who the policy applies to.");
    if (req.params.id) {
      const existing = await prisma.policy.findUnique({ where: { id: req.params.id } });
      if (!existing) throw fail("Policy not found.", 404);
      const changed = existing.body !== body || existing.title !== title;
      // A new version asks everyone who accepted the old one to accept again.
      const publish = Boolean(req.body.newVersion) && changed;
      await prisma.policy.update({ where: { id: existing.id }, data: { title, body, audience, requiresAck: req.body.requiresAck !== false, active: req.body.active !== false, ...(publish ? { version: { increment: 1 }, publishedAt: new Date() } : {}) } });
    } else {
      const key = str(req.body.key).toUpperCase().replace(/[^A-Z0-9_]+/g, "_") || `POLICY_${Date.now()}`;
      if (await prisma.policy.findUnique({ where: { key } })) throw fail("A policy with this key already exists.");
      await prisma.policy.create({ data: { key, title, body, audience, requiresAck: req.body.requiresAck !== false, sortOrder: 99 } });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.policyAcks = async (req, res, next) => {
  try {
    const policy = await prisma.policy.findUnique({ where: { id: req.params.id } });
    if (!policy) throw fail("Policy not found.", 404);
    const users = await prisma.user.findMany({ where: { status: true }, select: { id: true, fullName: true, email: true, role: true } });
    const acks = await prisma.policyAcknowledgement.findMany({ where: { policyId: policy.id, version: { gte: policy.version } } });
    const byUser = new Map(acks.map((a) => [a.userId, a]));
    res.json({ success: true, version: policy.version, people: users.filter((u) => forRole(policy.audience, u.role)).map((u) => ({ ...u, acceptedAt: byUser.get(u.id)?.acknowledgedAt || null })) });
  } catch (e) { next(e); }
};

exports.adminTraining = async (req, res, next) => {
  try {
    await ensureDefaults();
    const modules = await prisma.trainingModule.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const progress = await prisma.trainingProgress.groupBy({ by: ["moduleId"], _count: true });
    const counts = Object.fromEntries(progress.map((p) => [p.moduleId, p._count]));
    res.json({ success: true, modules: modules.map((m) => ({ ...m, completions: counts[m.id] || 0 })) });
  } catch (e) { next(e); }
};

exports.saveTraining = async (req, res, next) => {
  try {
    const title = str(req.body.title); const body = str(req.body.body);
    if (!title || body.length < 10) throw fail("A module needs a title and some content.");
    const audience = (Array.isArray(req.body.audience) ? req.body.audience : []).map((a) => String(a).toUpperCase());
    if (!audience.length) throw fail("Choose who the module is for.");
    const data = { title, summary: str(req.body.summary) || null, category: str(req.body.category).toUpperCase() || "GENERAL", audience, contentType: str(req.body.videoUrl) ? "VIDEO" : "ARTICLE", videoUrl: str(req.body.videoUrl) || null, body, minutes: Math.max(1, Math.min(240, Number(req.body.minutes) || 5)), published: req.body.published !== false, sortOrder: Number(req.body.sortOrder) || 50 };
    if (req.params.id) await prisma.trainingModule.update({ where: { id: req.params.id }, data }); else await prisma.trainingModule.create({ data });
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.deleteTraining = async (req, res, next) => {
  try { await prisma.trainingProgress.deleteMany({ where: { moduleId: req.params.id } }); await prisma.trainingModule.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { next(e); }
};

exports.meta = (req, res) => res.json({ success: true, categories: CATEGORIES, statuses: STATUSES, clientRoles: CLIENT_ROLES });
