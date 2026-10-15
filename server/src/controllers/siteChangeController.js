const prisma = require("../config/prisma");
const { locationWhereForUser } = require("../utils/scope");
const { createNotification } = require("../utils/notificationService");

// Site master data is changed by Back-Admin only. A site user or an auditor who sees something wrong raises a change
// request with the reason (and a photo if useful); Back-Admin approves or declines it. Approval applies the change and
// keeps the previous values on the request, so every change to a site can be traced.
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

const TEXT_FIELDS = { contactName: "Contact name", contactPhone: "Contact phone", contactEmail: "Contact email", address: "Address", city: "City", district: "District", state: "State", electricalSupplyType: "Electrical supply" };
const NUMBER_FIELDS = { latitude: "Latitude", longitude: "Longitude", geofenceRadiusM: "Geofence radius (m)" };
const LABELS = { ...TEXT_FIELDS, ...NUMBER_FIELDS };

const cleanChanges = (raw, current) => {
  const out = {};
  for (const key of Object.keys(TEXT_FIELDS)) { const v = str(raw?.[key]); if (v && v !== str(current[key])) out[key] = v.slice(0, 200); }
  for (const key of Object.keys(NUMBER_FIELDS)) {
    if (raw?.[key] === undefined || raw[key] === "" || raw[key] === null) continue;
    const v = Number(raw[key]); if (!Number.isFinite(v)) throw fail(`${LABELS[key]} must be a number.`);
    if (key === "latitude" && Math.abs(v) > 90) throw fail("Latitude must be between -90 and 90.");
    if (key === "longitude" && Math.abs(v) > 180) throw fail("Longitude must be between -180 and 180.");
    if (key === "geofenceRadiusM" && (v < 20 || v > 2000)) throw fail("Geofence radius must be between 20 and 2000 metres.");
    if (v !== current[key]) out[key] = v;
  }
  if (out.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contactEmail)) throw fail("Enter a valid contact email.");
  if (!Object.keys(out).length) throw fail("Change at least one detail from its current value.");
  return out;
};

const canSee = async (user, locationId) => {
  if (user.role === "ADMIN") return true;
  if (user.role === "AUDITOR") return Boolean(await prisma.clientAuditJobAssignment.findFirst({ where: { auditorId: user.id, job: { locationId } }, select: { id: true } }));
  return Boolean(await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(user), { id: locationId }] } }));
};

exports.create = async (req, res, next) => {
  try {
    const locationId = str(req.body.locationId);
    const location = await prisma.dealerLocation.findUnique({ where: { id: locationId } });
    if (!location || !(await canSee(req.user, locationId))) throw fail("You cannot request a change for this site.", 403);
    const reason = str(req.body.reason);
    if (reason.length < 5) throw fail("Give the reason for the change.");
    const photo = str(req.body.photo);
    if (photo && !/^data:image\/(png|jpeg);base64,/.test(photo)) throw fail("The photo must be a JPEG or PNG.");
    if (photo.length > 600_000) throw fail("The photo is too large. Use a smaller image.");
    const changes = cleanChanges(req.body.changes, location);
    if (await prisma.siteChangeRequest.findFirst({ where: { locationId, requestedById: req.user.id, status: "PENDING" } })) throw fail("You already have a change request waiting for review for this site.");
    const request = await prisma.siteChangeRequest.create({ data: { locationId, requestedById: req.user.id, changes, reason, photoUrl: photo || null } });
    await createNotification({ title: "Site change request", message: `${Object.keys(changes).map((k) => LABELS[k]).join(", ")} for ${location.locationName}: ${reason.slice(0, 80)}`, type: "SITE_CHANGE_REQUESTED", recipientRole: "ADMIN", createdById: req.user.id, link: "/admin-dashboard/site-change-requests" });
    res.status(201).json({ success: true, message: "Change request sent to Back-Admin.", request });
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (str(req.query.status)) where.status = str(req.query.status);
    if (req.user.role !== "ADMIN") {
      if (req.user.role === "AUDITOR") where.requestedById = req.user.id;
      else { const visible = await prisma.dealerLocation.findMany({ where: await locationWhereForUser(req.user), select: { id: true } }); where.locationId = { in: visible.map((l) => l.id) }; }
    }
    if (str(req.query.locationId)) where.locationId = str(req.query.locationId);
    const requests = await prisma.siteChangeRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    const [locs, people] = await Promise.all([
      prisma.dealerLocation.findMany({ where: { id: { in: [...new Set(requests.map((r) => r.locationId))] } }, select: { id: true, locationName: true, locationCode: true, contactName: true, contactPhone: true, contactEmail: true, address: true, city: true, district: true, state: true, electricalSupplyType: true, latitude: true, longitude: true, geofenceRadiusM: true } }),
      prisma.user.findMany({ where: { id: { in: [...new Set(requests.map((r) => r.requestedById))] } }, select: { id: true, fullName: true, role: true } }),
    ]);
    const L = Object.fromEntries(locs.map((l) => [l.id, l])); const P = Object.fromEntries(people.map((p) => [p.id, p]));
    res.json({ success: true, labels: LABELS, requests: requests.map((r) => ({ ...r, photoUrl: req.user.role === "ADMIN" || r.requestedById === req.user.id ? r.photoUrl : null, location: L[r.locationId] || null, requestedBy: P[r.requestedById] || null })) });
  } catch (e) { next(e); }
};

exports.decide = async (req, res, next) => {
  try {
    const request = await prisma.siteChangeRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw fail("Change request not found.", 404);
    if (request.status !== "PENDING") throw fail("This request has already been decided.");
    const approve = req.body.approve === true; const remarks = str(req.body.remarks);
    if (!approve && !remarks) throw fail("Give the reason for declining.");
    const location = await prisma.dealerLocation.findUnique({ where: { id: request.locationId } });
    if (!location) throw fail("The site no longer exists.", 404);
    const previous = Object.fromEntries(Object.keys(request.changes).map((k) => [k, location[k] ?? null]));
    await prisma.$transaction([
      ...(approve ? [prisma.dealerLocation.update({ where: { id: location.id }, data: request.changes })] : []),
      prisma.siteChangeRequest.update({ where: { id: request.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: req.user.id, decidedAt: new Date(), decisionRemarks: remarks || null, previousValues: approve ? previous : null } }),
    ]);
    await createNotification({ title: approve ? "Site change approved" : "Site change declined", message: `${location.locationName}: ${approve ? "your change was applied." : remarks}`, type: "SITE_CHANGE_DECIDED", recipientId: request.requestedById, createdById: req.user.id, link: "/user-dashboard" });
    res.json({ success: true, message: approve ? "Change approved and applied to the site." : "Change declined." });
  } catch (e) { next(e); }
};
