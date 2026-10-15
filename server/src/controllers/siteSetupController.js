const XLSX = require("xlsx");
const { issueCredentials } = require("../utils/credentials");
const prisma = require("../config/prisma");
const crypto = require("crypto");
const { computeReadiness, FACILITY_TYPES, DISCIPLINES, ACCESS_ROLES } = require("../utils/siteSetupReadiness");
const { helpers } = require("./clientAuditSetupController");
const { locationWhereForUser } = require("../utils/scope");
const { helpers: checklistHelpers } = require("./clientChecklistController");

const { normalizeLocation, validateLocation, badRequest } = helpers;
const EDITABLE = new Set(["DRAFT", "RETURNED"]);
const FACILITY_LABELS = { SHOWROOM: "Showroom", WORKSHOP: "Workshop", STOCKYARD: "Stockyard" };
const SHARED_CODES = ["GATE", "PARK", "ACC", "IT", "WASH"];

const notFound = (message) => { const e = new Error(message); e.statusCode = 404; return e; };
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

const emptyData = () => ({
  identity: {}, location: { geofenceRadiusM: 200 },
  facilities: { items: [], electricalSupplyType: "", sharedMappings: [] },
  scope: {}, volumes: {}, manpower: [], tools: [], access: [],
});

const present = (request) => {
  const readiness = computeReadiness(request.data);
  return { ...request, readiness: readiness.percent, readinessSections: readiness.sections };
};

const summary = (request) => {
  const id = request.data?.identity || {};
  return {
    id: request.id, companyId: request.companyId, status: request.status, source: request.source,
    readiness: request.readiness, reviewRemarks: request.reviewRemarks, submittedAt: request.submittedAt,
    updatedAt: request.updatedAt, locationId: request.locationId,
    locationName: id.locationName || "", locationCode: id.locationCode || "",
    dealerName: id.dealerName || "", zone: id.zone || "", regionalOffice: id.regionalOffice || "",
    company: request.company ? { id: request.company.id, companyName: request.company.companyName } : undefined,
  };
};

const ensureProgramme = async (company) => {
  const existing = await prisma.auditProgramme.findFirst({
    where: { companyId: company.id, programmeType: "FACILITY_AUDIT" }, orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.auditProgramme.create({
    data: {
      companyId: company.id, name: `${company.companyName} Facility Audit`, code: "DEFAULT",
      programmeType: "FACILITY_AUDIT", financialYear: "2026-27",
    },
  });
};

const publishedVersions = async (companyId) => {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return [];
  const programme = await ensureProgramme(company);
  return prisma.clientChecklistVersion.findMany({ where: { programmeId: programme.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { id: true, name: true, version: true, publishedAt: true, _count: { select: { items: true } } } });
};
const withDefaultChecklist = async (companyId, data) => {
  if (data.checklist?.versionId) return data;
  const [latest] = await publishedVersions(companyId);
  return latest ? { ...data, checklist: { versionId: latest.id } } : data;
};

exports.companyChecklists = async (req, res, next) => {
  try { res.json({ success: true, versions: (await publishedVersions(req.params.companyId)).map((v) => ({ ...v, itemCount: v._count.items })) }); } catch (e) { next(e); }
};

const duplicateCodeError = async (companyId, locationCode, ignoreRequestId) => {
  const code = str(locationCode).toUpperCase();
  if (!code) return null;
  const site = await prisma.dealerLocation.findFirst({ where: { locationCode: code, programme: { companyId } }, select: { id: true } });
  if (site) return `A site with location code ${code} already exists for this company.`;
  const pending = await prisma.siteSetupRequest.findMany({
    where: { companyId, status: { in: ["DRAFT", "SUBMITTED", "RETURNED"] }, ...(ignoreRequestId ? { id: { not: ignoreRequestId } } : {}) },
    select: { data: true },
  });
  if (pending.some((p) => str(p.data?.identity?.locationCode).toUpperCase() === code)) {
    return `A pending site setup with location code ${code} already exists.`;
  }
  return null;
};

exports.companiesOverview = async (req, res, next) => {
  try {
    const [companies, sites, requests] = await Promise.all([
      prisma.company.findMany({ select: { id: true, companyName: true, email: true, address: true, logoUrl: true, contactName: true, contactPhone: true, createdAt: true }, orderBy: { companyName: "asc" } }),
      prisma.dealerLocation.groupBy({ by: ["programmeId"], _count: { _all: true } }),
      prisma.siteSetupRequest.groupBy({ by: ["companyId", "status"], _count: { _all: true } }),
    ]);
    const programmes = await prisma.auditProgramme.findMany({ select: { id: true, companyId: true } });
    const programmeCompany = Object.fromEntries(programmes.map((p) => [p.id, p.companyId]));
    const siteCount = {};
    sites.forEach((s) => { const c = programmeCompany[s.programmeId]; siteCount[c] = (siteCount[c] || 0) + s._count._all; });
    const reqCount = {};
    requests.forEach((r) => { (reqCount[r.companyId] ||= {})[r.status] = r._count._all; });
    res.json({
      success: true,
      companies: companies.map((c) => ({
        ...c, siteCount: siteCount[c.id] || 0,
        draftCount: (reqCount[c.id]?.DRAFT || 0) + (reqCount[c.id]?.RETURNED || 0),
        submittedCount: reqCount[c.id]?.SUBMITTED || 0,
      })),
    });
  } catch (e) { next(e); }
};

exports.companySites = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.companyId }, select: { id: true, companyName: true, email: true, address: true, logoUrl: true, contactName: true, contactPhone: true } });
    if (!company) throw notFound("Company not found.");
    const [sites, requests] = await Promise.all([
      prisma.dealerLocation.findMany({ where: { programme: { companyId: company.id } }, include: { facilities: true }, orderBy: { createdAt: "desc" } }),
      prisma.siteSetupRequest.findMany({ where: { companyId: company.id, status: { not: "APPROVED" } }, orderBy: { updatedAt: "desc" } }),
    ]);
    res.json({ success: true, company, sites, requests: requests.map(summary) });
  } catch (e) { next(e); }
};

exports.listRequests = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.companyId) where.companyId = String(req.query.companyId);
    const requests = await prisma.siteSetupRequest.findMany({ where, include: { company: { select: { id: true, companyName: true } } }, orderBy: { updatedAt: "desc" } });
    res.json({ success: true, requests: requests.map(summary) });
  } catch (e) { next(e); }
};

exports.createRequest = async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: String(req.body.companyId || "") }, select: { id: true } });
    if (!company) throw badRequest("Select a valid company.");
    const data = await withDefaultChecklist(company.id, req.body.data || emptyData());
    const readiness = computeReadiness(data).percent;
    const request = await prisma.siteSetupRequest.create({ data: { companyId: company.id, data, readiness, createdById: req.user?.id || null } });
    res.status(201).json({ success: true, request: present(request) });
  } catch (e) { next(e); }
};

exports.getRequest = async (req, res, next) => {
  try {
    const request = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id }, include: { company: { select: { id: true, companyName: true } } } });
    if (!request) throw notFound("Site setup request not found.");
    res.json({ success: true, request: present(request) });
  } catch (e) { next(e); }
};

exports.updateRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (!EDITABLE.has(current.status)) throw badRequest("Only draft or returned requests can be edited.");
    const data = req.body.data;
    if (!data || typeof data !== "object") throw badRequest("Setup data is required.");
    const readiness = computeReadiness(data).percent;
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { data, readiness } });
    res.json({ success: true, request: present(request) });
  } catch (e) { next(e); }
};

exports.deleteRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (!EDITABLE.has(current.status)) throw badRequest("Only draft or returned requests can be deleted.");
    await prisma.siteSetupRequest.delete({ where: { id: current.id } });
    res.json({ success: true });
  } catch (e) { next(e); }
};

exports.submitRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (!EDITABLE.has(current.status)) throw badRequest("This request has already been submitted.");
    const readiness = computeReadiness(current.data);
    if (readiness.percent < 100) throw badRequest("Complete all sections before submitting.", readiness.sections.filter((s) => s.applies && !s.complete && !s.optional).map((s) => s.label));
    const dup = await duplicateCodeError(current.companyId, current.data.identity?.locationCode, current.id);
    if (dup) throw badRequest(dup);
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { status: "SUBMITTED", submittedAt: new Date(), reviewRemarks: null, readiness: 100 } });
    res.json({ success: true, message: "Submitted for review.", request: present(request) });
  } catch (e) { next(e); }
};

exports.returnRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (current.status !== "SUBMITTED") throw badRequest("Only submitted requests can be returned.");
    if (!str(req.body.remarks)) throw badRequest("Add remarks for the changes needed.");
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { status: "RETURNED", reviewRemarks: str(req.body.remarks), reviewedById: req.user?.id || null, reviewedAt: new Date() } });
    res.json({ success: true, message: "Returned for changes.", request: present(request) });
  } catch (e) { next(e); }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (current.status !== "SUBMITTED") throw badRequest("Only submitted requests can be rejected.");
    if (!str(req.body.remarks)) throw badRequest("Add a reason for rejection.");
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { status: "REJECTED", reviewRemarks: str(req.body.remarks), reviewedById: req.user?.id || null, reviewedAt: new Date() } });
    res.json({ success: true, message: "Request rejected.", request: present(request) });
  } catch (e) { next(e); }
};

const locationBodyFromData = (data, programmeId) => {
  const id = data.identity || {}; const loc = data.location || {}; const fac = data.facilities || {};
  return {
    programmeId, zone: id.zone, regionalOffice: id.regionalOffice, dealerName: id.dealerName,
    dealerCode: id.dealerCode, locationName: id.locationName, locationCode: id.locationCode,
    address: loc.address, city: id.city, district: id.district, state: id.state,
    latitude: loc.latitude, longitude: loc.longitude, geofenceRadiusM: loc.geofenceRadiusM,
    contactName: loc.contactName, contactPhone: loc.contactPhone, contactEmail: loc.contactEmail,
    electricalSupplyType: fac.electricalSupplyType,
    facilities: (fac.items || []).map((i) => ({ ...i, displayName: i.displayName || FACILITY_LABELS[i.facilityType] })),
    sharedMappings: (fac.sharedMappings || []).filter((m) => m.enabled !== false),
  };
};

const ROLE_SCOPE = { CORPORATE_MANAGER: [], ZONAL_MANAGER: ["zone"], REGIONAL_MANAGER: ["zone", "regionalOffice"], SITE_INCHARGE: ["zone", "regionalOffice", "locationId"], SITE_USER: ["zone", "regionalOffice", "locationId"] };
// Creates (or extends) the users who will cover this site. Returns login details for new users, shown once.
const provisionAccess = async (access, site, companyId) => {
  const out = [];
  for (const a of access || []) {
    const email = str(a.email).toLowerCase(); const role = a.role; const fullName = str(a.fullName);
    if (!fullName || !email || !ACCESS_ROLES.includes(role)) continue;
    const parts = ROLE_SCOPE[role];
    const scope = { companyId, zone: parts.includes("zone") ? site.zone : null, regionalOffice: parts.includes("regionalOffice") ? site.regionalOffice : null, locationId: parts.includes("locationId") ? site.id : null };
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== role) { out.push({ fullName, email, role, note: `Already a ${existing.role}; not changed` }); continue; }
      await prisma.userScope.create({ data: { userId: existing.id, ...scope } });
      out.push({ fullName, email, role, username: existing.username, note: "Existing user: this site was added to their access" });
      continue;
    }
    const { username, password, hash } = await issueCredentials();
    await prisma.user.create({ data: { fullName, email, username, password: hash, mustChangePassword: true, role, companyId, scopes: { create: [scope] } } });
    out.push({ fullName, email, role, username, password });
  }
  return out;
};

exports.approveRequest = async (req, res, next) => {
  try {
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id }, include: { company: true } });
    if (!current) throw notFound("Site setup request not found.");
    if (current.status !== "SUBMITTED") throw badRequest("Only submitted requests can be approved.");
    const readiness = computeReadiness(current.data);
    if (readiness.percent < 100) throw badRequest("The request is incomplete.");
    const dup = await duplicateCodeError(current.companyId, current.data.identity?.locationCode, current.id);
    if (dup) throw badRequest(dup);
    const programme = await ensureProgramme(current.company);
    const data = normalizeLocation(locationBodyFromData(current.data, programme.id));
    validateLocation(data);
    const id = current.data.identity || {};
    const { facilities, sharedMappings, ...locationData } = data;
    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.dealerLocation.create({
        data: {
          ...locationData,
          sapCode: str(id.sapCode) || null, parentCode: str(id.parentCode) || null, madbCode: str(id.madbCode) || null,
          category: str(id.category) || null, cityClassification: str(id.cityClassification) || null,
          retailFormat: str(id.retailFormat) || null,
          profile: { scope: current.data.scope, volumes: current.data.volumes, manpower: current.data.manpower, tools: current.data.tools, checklist: current.data.checklist || null },
          facilities: { create: facilities }, sharedMappings: { create: sharedMappings },
        },
      });
      await tx.siteSetupRequest.update({ where: { id: current.id }, data: { status: "APPROVED", locationId: created.id, reviewRemarks: str(req.body.remarks) || null, reviewedById: req.user?.id || null, reviewedAt: new Date() } });
      return created;
    });
    let snapshotNote = "";
    const versionId = current.data.checklist?.versionId;
    if (versionId) {
      try { await checklistHelpers.createSnapshot(location.id, versionId); } catch (error) { snapshotNote = ` The checklist could not be attached yet: ${error.message}`; }
    }
    let credentials = [];
    try { credentials = await provisionAccess(current.data.access, location, current.companyId); } catch (error) { snapshotNote += ` Some users could not be created: ${error.message}`; }
    res.json({ success: true, message: `Site approved and created.${snapshotNote}`, locationId: location.id, credentials });
  } catch (e) { next(e); }
};

/* ---------- Excel template & import ---------- */
const SITE_COLUMNS = [
  "Dealer Name", "Dealer Code", "SAP Code", "Parent Code", "MADB Code", "Category", "Location Name", "Location Code",
  "Zone", "Regional Office", "State", "District", "City", "City Classification", "Address", "Latitude", "Longitude",
  "Geofence Radius (m)", "Contact Name", "Contact Phone", "Contact Email", "Electrical Supply",
  "Showroom Tier", "Showroom CI Level", "Showroom Format", "Workshop Tier", "Workshop CI Level", "Workshop Type",
  "Stockyard Type", "Sells BEV (Y/N)", "Scope Showroom", "Scope Workshop", "Scope Stockyard",
  "Showroom Area (sq ft)", "Monthly PV Retail", "Test Drives Per Day", "Mechanical ROs (3 mo)", "Mechanical Bays", "Checklist Version",
];
const MANPOWER_COLUMNS = ["Location Code", "Facility", "Role", "Required", "On Roll"];
const USER_COLUMNS = ["Location Code", "Full Name", "Email", "Role"];
const TOOL_COLUMNS = ["Location Code", "Tool", "Category", "Required", "Available", "Valid Till (YYYY-MM-DD)"];

exports.downloadTemplate = (req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();
    const example = {
      "Dealer Name": "Sample Motors Pvt Ltd", "Dealer Code": "SMP01", "SAP Code": "SL010001", "Parent Code": "", "MADB Code": "",
      Category: "A", "Location Name": "Patna", "Location Code": "SMP01-PAT1", Zone: "East", "Regional Office": "Patna", State: "Bihar",
      District: "Patna", City: "Patna", "City Classification": "Tier 2", Address: "Main Road, Patna", Latitude: 25.5941, Longitude: 85.1376,
      "Geofence Radius (m)": 200, "Contact Name": "A Kumar", "Contact Phone": "9876543210", "Contact Email": "dealer@example.com",
      "Electrical Supply": "LT supply", "Showroom Tier": "MADB", "Showroom CI Level": "CI 2024-25", "Showroom Format": "",
      "Workshop Tier": "Main Dealer Workshop", "Workshop CI Level": "CI 2024-25", "Workshop Type": "Mechanical + Bodyshop",
      "Stockyard Type": "", "Sells BEV (Y/N)": "Y", "Scope Showroom": "INFRA,FIRE,ELECTRICAL,THERMOGRAPHY",
      "Scope Workshop": "INFRA,FIRE,ELECTRICAL,THERMOGRAPHY", "Scope Stockyard": "", "Showroom Area (sq ft)": 5000,
      "Monthly PV Retail": 60, "Test Drives Per Day": 8, "Mechanical ROs (3 mo)": 900, "Mechanical Bays": 20,
    };
    const sites = XLSX.utils.json_to_sheet([example], { header: SITE_COLUMNS });
    sites["!cols"] = SITE_COLUMNS.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, sites, "Sites");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Location Code": "SMP01-PAT1", Facility: "WORKSHOP", Role: "Technician", Required: 12, "On Roll": 10 }], { header: MANPOWER_COLUMNS }), "Manpower");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Location Code": "SMP01-PAT1", Tool: "Torque wrench set", Category: "Must Have", Required: 4, Available: 4, "Valid Till (YYYY-MM-DD)": "2027-03-31" }], { header: TOOL_COLUMNS }), "Tools");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Location Code": "SMP01-PAT1", "Full Name": "R Singh", Email: "r.singh@example.com", Role: "SITE_USER" }], { header: USER_COLUMNS }), "Users");
    const notes = XLSX.utils.aoa_to_sheet([
      ["How to use"], ["One row per site in 'Sites'. Use the same Location Code in 'Manpower' and 'Tools' to attach rows to a site."],
      ["Scope columns: comma-separated from INFRA, FIRE, ELECTRICAL, THERMOGRAPHY. Leave blank when the facility is not present."],
      ["A facility is added when its Tier (showroom/workshop) or Stockyard Type is filled."],
      ["Users sheet: Role is one of CORPORATE_MANAGER, ZONAL_MANAGER, REGIONAL_MANAGER, SITE_INCHARGE, SITE_USER. Each is given access to this site (and its zone, office or company for the manager roles)."],
      ["Checklist Version (optional): the version label of a published checklist; blank uses the latest published one."],
      ["Existing location codes are skipped, never overwritten."],
    ]);
    XLSX.utils.book_append_sheet(wb, notes, "Read Me");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="site-setup-template.xlsx"');
    res.send(buffer);
  } catch (e) { next(e); }
};

const yes = (v) => /^(y|yes|true|1)$/i.test(str(v));
const scopeOf = (v) => {
  const items = str(v).toUpperCase().split(/[,;/]+/).map((x) => x.trim()).filter(Boolean);
  return Object.fromEntries(DISCIPLINES.map((d) => [d, items.includes(d)]));
};

const rowToData = (row, manpower, tools) => {
  const g = (k) => str(row[k]);
  const items = []; const scope = {}; const bev = yes(row["Sells BEV (Y/N)"]);
  if (g("Showroom Tier")) { items.push({ facilityType: "SHOWROOM", tier: g("Showroom Tier"), ciLevel: g("Showroom CI Level") || "CI 2024-25", format: g("Showroom Format"), sellsPv: true, sellsBev: bev, sellsCv: false, isActive: true }); scope.SHOWROOM = scopeOf(row["Scope Showroom"]); }
  if (g("Workshop Tier")) { items.push({ facilityType: "WORKSHOP", tier: g("Workshop Tier"), ciLevel: g("Workshop CI Level") || "CI 2024-25", workshopType: g("Workshop Type"), sellsPv: true, sellsBev: bev, sellsCv: false, isActive: true }); scope.WORKSHOP = scopeOf(row["Scope Workshop"]); }
  if (g("Stockyard Type")) { items.push({ facilityType: "STOCKYARD", tier: "Standard", stockyardType: g("Stockyard Type"), sellsPv: true, sellsBev: bev, sellsCv: false, isActive: true }); scope.STOCKYARD = scopeOf(row["Scope Stockyard"]); }
  const n = (k) => (str(row[k]) === "" ? "" : Number(row[k]));
  return {
    identity: { dealerName: g("Dealer Name"), dealerCode: g("Dealer Code"), sapCode: g("SAP Code"), parentCode: g("Parent Code"), madbCode: g("MADB Code"), category: g("Category"), locationName: g("Location Name"), locationCode: g("Location Code"), zone: g("Zone"), regionalOffice: g("Regional Office"), state: g("State"), district: g("District"), city: g("City"), cityClassification: g("City Classification") },
    location: { address: g("Address"), latitude: n("Latitude"), longitude: n("Longitude"), geofenceRadiusM: str(row["Geofence Radius (m)"]) === "" ? 200 : Number(row["Geofence Radius (m)"]), contactName: g("Contact Name"), contactPhone: g("Contact Phone"), contactEmail: g("Contact Email") },
    facilities: { items, electricalSupplyType: g("Electrical Supply"), sharedMappings: SHARED_CODES.map((c) => ({ facilityCode: c, arrangement: "SEPARATE", usedBy: items.map((i) => i.facilityType), quantity: 1, auditAtSite: false, enabled: false })) },
    scope,
    volumes: { showroomAreaSqFt: n("Showroom Area (sq ft)"), monthlyPvRetail: n("Monthly PV Retail"), testDrivesPerDay: n("Test Drives Per Day"), mechanicalRos: n("Mechanical ROs (3 mo)"), mechanicalBays: n("Mechanical Bays") },
    manpower, tools, access: [],
  };
};

/* Update mode: a row whose Location Code already belongs to a live site corrects that site instead of being skipped.
   Only cells that are filled change anything, so a partial sheet never blanks existing data. */
const UPDATE_TEXT = [["dealerName", "Dealer Name"], ["dealerCode", "Dealer Code"], ["locationName", "Location Name"], ["zone", "Zone"], ["regionalOffice", "Regional Office"], ["state", "State"], ["district", "District"], ["city", "City"], ["address", "Address"], ["contactName", "Contact Name"], ["contactPhone", "Contact Phone"], ["contactEmail", "Contact Email"], ["electricalSupplyType", "Electrical Supply"], ["sapCode", "SAP Code"], ["parentCode", "Parent Code"], ["madbCode", "MADB Code"], ["category", "Category"], ["cityClassification", "City Classification"]];
const UPDATE_NUMBER = [["latitude", "Latitude"], ["longitude", "Longitude"], ["geofenceRadiusM", "Geofence Radius (m)"]];

const updateLiveSite = async (live, row, manpower, tools, dryRun) => {
  const changes = []; const data = {};
  for (const [field, column] of UPDATE_TEXT) { const v = str(row[column]); if (v && v !== (live[field] || "")) { data[field] = v; changes.push(column); } }
  for (const [field, column] of UPDATE_NUMBER) { const raw = str(row[column]); if (raw === "") continue; const v = Number(raw); if (!Number.isFinite(v)) throw badRequest(`${column} must be a number.`); if (v !== live[field]) { data[field] = v; changes.push(column); } }
  const incoming = rowToData(row, manpower, tools);
  const profile = { ...(live.profile || {}) };
  const scope = { ...(profile.scope || {}) }; let scopeChanged = false;
  for (const [facility, column] of [["SHOWROOM", "Scope Showroom"], ["WORKSHOP", "Scope Workshop"], ["STOCKYARD", "Scope Stockyard"]]) if (str(row[column])) { scope[facility] = incoming.scope[facility]; scopeChanged = true; }
  if (scopeChanged) { profile.scope = scope; changes.push("Scope"); }
  const volumes = { ...(profile.volumes || {}) }; let volumesChanged = false;
  for (const [k, v] of Object.entries(incoming.volumes)) if (v !== "" && v !== volumes[k]) { volumes[k] = v; volumesChanged = true; }
  if (volumesChanged) { profile.volumes = volumes; changes.push("Volumes"); }
  if (manpower.length) { profile.manpower = mergeRows(profile.manpower, incoming.manpower, "append", (r) => `${r.facilityType}|${r.role}`.toLowerCase()); changes.push("Manpower"); }
  if (tools.length) { profile.tools = mergeRows(profile.tools, incoming.tools, "append", (r) => String(r.name).toLowerCase()); changes.push("Tools"); }
  const facilityRows = incoming.facilities.items;
  if (facilityRows.length) changes.push("Facilities");
  if (!changes.length) return { changed: [] };
  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      await tx.dealerLocation.update({ where: { id: live.id }, data: { ...data, profile } });
      for (const f of facilityRows) {
        const fields = { displayName: FACILITY_LABELS[f.facilityType], tier: f.tier || null, ciLevel: f.ciLevel || null, format: f.format || null, workshopType: f.workshopType || null, stockyardType: f.stockyardType || null, sellsPv: Boolean(f.sellsPv), sellsBev: Boolean(f.sellsBev), sellsCv: Boolean(f.sellsCv), isActive: true };
        await tx.facility.upsert({ where: { locationId_facilityType: { locationId: live.id, facilityType: f.facilityType } }, update: fields, create: { locationId: live.id, facilityType: f.facilityType, ...fields } });
      }
    });
  }
  return { changed: changes };
};

exports.importSites = async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("Upload an Excel file.");
    const company = await prisma.company.findUnique({ where: { id: String(req.body.companyId || "") }, select: { id: true } });
    if (!company) throw badRequest("Select a valid company.");
    const dryRun = String(req.body.dryRun) === "true";
    const updateMode = String(req.body.mode || "").toUpperCase() === "UPDATE";
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) : []);
    const siteRows = sheet("Sites");
    if (!siteRows.length) throw badRequest("The 'Sites' sheet is empty or missing.");
    const manpowerBy = {}; sheet("Manpower").forEach((r) => { const k = str(r["Location Code"]).toUpperCase(); if (k) (manpowerBy[k] ||= []).push({ facilityType: str(r.Facility).toUpperCase(), role: str(r.Role), required: Number(r.Required), onRoll: str(r["On Roll"]) === "" ? "" : Number(r["On Roll"]) }); });
    const toolsBy = {}; sheet("Tools").forEach((r) => { const k = str(r["Location Code"]).toUpperCase(); if (k) (toolsBy[k] ||= []).push({ name: str(r.Tool), category: str(r.Category), required: Number(r.Required), available: str(r.Available) === "" ? "" : Number(r.Available), validTill: str(r["Valid Till (YYYY-MM-DD)"]) }); });

    const usersBy = {}; sheet("Users").forEach((r) => { const k = str(r["Location Code"]).toUpperCase(); if (k && str(r.Email)) (usersBy[k] ||= []).push({ fullName: str(r["Full Name"]), email: str(r.Email), role: str(r.Role).toUpperCase() }); });
    const seen = new Set(); const results = [];
    for (let i = 0; i < siteRows.length; i += 1) {
      const row = siteRows[i]; const line = i + 2;
      const code = str(row["Location Code"]).toUpperCase();
      if (!code) { results.push({ line, status: "ERROR", message: "Location Code is missing." }); continue; }
      if (seen.has(code)) { results.push({ line, code, status: "SKIPPED", message: "Duplicate Location Code in this file." }); continue; }
      seen.add(code);
      if (updateMode) {
        const live = await prisma.dealerLocation.findFirst({ where: { locationCode: code, programme: { companyId: company.id } } });
        if (live) {
          try {
            const { changed } = await updateLiveSite(live, row, manpowerBy[code] || [], toolsBy[code] || [], dryRun);
            results.push({ line, code, status: changed.length ? "UPDATED" : "UNCHANGED", message: changed.length ? `${dryRun ? "Will update" : "Updated"}: ${changed.join(", ")}` : "Nothing to change." });
          } catch (error) { results.push({ line, code, status: "ERROR", message: error.message }); }
          continue;
        }
      }
      const dup = await duplicateCodeError(company.id, code);
      if (dup) { results.push({ line, code, status: "SKIPPED", message: dup }); continue; }
      const data = await withDefaultChecklist(company.id, { ...rowToData(row, manpowerBy[code] || [], toolsBy[code] || []), access: usersBy[code] || [] });
      const wanted = str(row["Checklist Version"]);
      if (wanted) { const v = (await publishedVersions(company.id)).find((x) => x.version === wanted || x.name === wanted); if (v) data.checklist = { versionId: v.id }; }
      const readiness = computeReadiness(data);
      const status = readiness.percent === 100 ? "SUBMITTED" : "DRAFT";
      const missing = readiness.sections.filter((s) => s.applies && !s.complete).map((s) => s.label);
      if (!dryRun) {
        await prisma.siteSetupRequest.create({ data: { companyId: company.id, data, readiness: readiness.percent, status, source: "EXCEL", createdById: req.user?.id || null, submittedAt: status === "SUBMITTED" ? new Date() : null } });
      }
      results.push({ line, code, status: status === "SUBMITTED" ? "READY" : "INCOMPLETE", readiness: readiness.percent, message: missing.length ? `Needs: ${missing.join(", ")}` : "Ready for review." });
    }
    const count = (s) => results.filter((r) => r.status === s).length;
    res.json({ success: true, dryRun, totals: { rows: results.length, ready: count("READY"), incomplete: count("INCOMPLETE"), skipped: count("SKIPPED"), updated: count("UPDATED"), unchanged: count("UNCHANGED"), errors: count("ERROR") }, results });
  } catch (e) { next(e); }
};

/* ----- tools & manpower register upload (new request or live site) ----- */
const REG_TOOL_COLUMNS = ["Tool", "Category", "Required", "Available", "Valid Till (YYYY-MM-DD)"];
const REG_MAN_COLUMNS = ["Facility", "Role", "Required", "On Roll"];

exports.registersTemplate = (req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Tool: "Torque wrench set", Category: "Must Have", Required: 4, Available: 4, "Valid Till (YYYY-MM-DD)": "2027-03-31" }], { header: REG_TOOL_COLUMNS }), "Tools");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Facility: "WORKSHOP", Role: "Technician", Required: 12, "On Roll": 10 }], { header: REG_MAN_COLUMNS }), "Manpower");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="tools-manpower-template.xlsx"');
    res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (e) { next(e); }
};

const parseRegisters = (buffer) => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = (n) => (wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" }) : []);
  const tools = sheet("Tools").filter((r) => str(r.Tool)).map((r) => ({ name: str(r.Tool), category: str(r.Category), required: Number(r.Required), available: str(r.Available) === "" ? "" : Number(r.Available), validTill: str(r["Valid Till (YYYY-MM-DD)"]) }));
  const manpower = sheet("Manpower").filter((r) => str(r.Role)).map((r) => ({ facilityType: str(r.Facility).toUpperCase(), role: str(r.Role), required: Number(r.Required), onRoll: str(r["On Roll"]) === "" ? "" : Number(r["On Roll"]) }));
  if (!tools.length && !manpower.length) throw badRequest("No tools or manpower rows were found. Use the template sheets named Tools and Manpower.");
  return { tools, manpower };
};
const mergeRows = (current = [], incoming, mode, keyOf) => {
  if (mode === "replace") return incoming;
  const map = new Map(current.map((r) => [keyOf(r), r])); incoming.forEach((r) => map.set(keyOf(r), r));
  return [...map.values()];
};
const applyRegisters = (target, parsed, mode) => ({
  tools: parsed.tools.length ? mergeRows(target.tools, parsed.tools, mode, (r) => r.name.toLowerCase()) : (target.tools || []),
  manpower: parsed.manpower.length ? mergeRows(target.manpower, parsed.manpower, mode, (r) => `${r.facilityType}|${r.role}`.toLowerCase()) : (target.manpower || []),
});

exports.importRegistersToRequest = async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("Upload an Excel file.");
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (!EDITABLE.has(current.status)) throw badRequest("Only draft or returned requests can be edited.");
    const parsed = parseRegisters(req.file.buffer);
    const data = { ...current.data, ...applyRegisters(current.data, parsed, req.body.mode === "replace" ? "replace" : "append") };
    const readiness = computeReadiness(data).percent;
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { data, readiness } });
    res.json({ success: true, message: `${parsed.tools.length} tool(s) and ${parsed.manpower.length} manpower row(s) loaded.`, request: present(request) });
  } catch (e) { next(e); }
};

exports.importRegistersToSite = async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("Upload an Excel file.");
    const site = await prisma.dealerLocation.findUnique({ where: { id: req.params.locationId } });
    if (!site) throw notFound("Site not found.");
    const parsed = parseRegisters(req.file.buffer);
    const profile = { ...(site.profile || {}), ...applyRegisters(site.profile || {}, parsed, req.body.mode === "replace" ? "replace" : "append") };
    await prisma.dealerLocation.update({ where: { id: site.id }, data: { profile } });
    res.json({ success: true, message: `${parsed.tools.length} tool(s) and ${parsed.manpower.length} manpower row(s) loaded.`, profile });
  } catch (e) { next(e); }
};

exports.siteOverview = async (req, res, next) => {
  try {
    const site = await prisma.dealerLocation.findUnique({ where: { id: req.params.locationId }, include: { facilities: true, sharedMappings: true, programme: { select: { id: true, name: true, companyId: true, company: { select: { companyName: true } } } } } });
    if (!site) throw notFound("Site not found.");
    if (req.user.role !== "ADMIN") {
      const visible = await prisma.dealerLocation.count({ where: { AND: [await locationWhereForUser(req.user), { id: site.id }] } });
      if (!visible) { const e = new Error("You cannot access this site."); e.statusCode = 403; throw e; }
    }
    const [snapshots, versions, proposals, jobs] = await Promise.all([
      prisma.locationChecklistSnapshot.findMany({ where: { locationId: site.id }, select: { id: true, versionId: true, checklistName: true, checklistVersion: true, itemCount: true, generatedAt: true }, orderBy: { generatedAt: "desc" } }),
      prisma.clientChecklistVersion.findMany({ where: { programmeId: site.programmeId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { id: true, name: true, version: true, publishedAt: true } }),
      prisma.checklistProposal.findMany({ where: { reachData: { path: ["locationCode"], equals: site.locationCode } }, orderBy: { createdAt: "desc" } }),
      prisma.clientAuditJob.findMany({ where: { locationId: site.id, isDemo: false }, select: { id: true, status: true, facilityType: true, scheduledStart: true }, orderBy: { scheduledStart: "desc" }, take: 10 }),
    ]);
    res.json({ success: true, site, snapshots, versions, proposals, jobs });
  } catch (e) { next(e); }
};

/* ----- one workbook for everything: fill a single site setup, and upload a checklist ----- */
exports.fillFromExcel = async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("Upload an Excel file.");
    const current = await prisma.siteSetupRequest.findUnique({ where: { id: req.params.id } });
    if (!current) throw notFound("Site setup request not found.");
    if (!EDITABLE.has(current.status)) throw badRequest("Only draft or returned requests can be edited.");
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = (n) => (wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" }) : []);
    const rows = sheet("Sites");
    if (!rows.length) throw badRequest("The 'Sites' sheet is empty or missing. Use the workbook template.");
    const code = str(current.data.identity?.locationCode).toUpperCase();
    const row = rows.find((r) => str(r["Location Code"]).toUpperCase() === code) || rows[0];
    const key = str(row["Location Code"]).toUpperCase();
    const forKey = (name) => sheet(name).filter((r) => str(r["Location Code"]).toUpperCase() === key);
    const manpower = forKey("Manpower").map((r) => ({ facilityType: str(r.Facility).toUpperCase(), role: str(r.Role), required: Number(r.Required), onRoll: str(r["On Roll"]) === "" ? "" : Number(r["On Roll"]) }));
    const tools = forKey("Tools").map((r) => ({ name: str(r.Tool), category: str(r.Category), required: Number(r.Required), available: str(r.Available) === "" ? "" : Number(r.Available), validTill: str(r["Valid Till (YYYY-MM-DD)"]) }));
    const access = forKey("Users").map((r) => ({ fullName: str(r["Full Name"]), email: str(r.Email), role: str(r.Role).toUpperCase() }));
    let data = { ...rowToData(row, manpower, tools), access };
    const wanted = str(row["Checklist Version"]);
    if (wanted) { const v = (await publishedVersions(current.companyId)).find((x) => x.version === wanted || x.name === wanted); if (v) data.checklist = { versionId: v.id }; }
    data = await withDefaultChecklist(current.companyId, { ...data, checklist: data.checklist || current.data.checklist });
    const dup = await duplicateCodeError(current.companyId, data.identity.locationCode, current.id);
    if (dup) throw badRequest(dup);
    const readiness = computeReadiness(data).percent;
    const request = await prisma.siteSetupRequest.update({ where: { id: current.id }, data: { data, readiness } });
    res.json({ success: true, message: `Filled from row for ${key}.`, request: present(request) });
  } catch (e) { next(e); }
};

exports.uploadChecklist = async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("Upload an Excel file.");
    const company = await prisma.company.findUnique({ where: { id: req.params.companyId } });
    if (!company) throw notFound("Company not found.");
    const name = str(req.body.name) || "Uploaded checklist"; const version = str(req.body.version) || "1.0";
    const programme = await ensureProgramme(company);
    if (await prisma.clientChecklistVersion.findUnique({ where: { programmeId_version: { programmeId: programme.id, version } } })) throw badRequest(`A checklist with version ${version} already exists. Choose another version label.`);
    const created = await prisma.clientChecklistVersion.create({ data: { programmeId: programme.id, name, version } });
    let result;
    try { result = await checklistHelpers.importChecklistBuffer(created.id, req.file.buffer, false); } catch (error) { await prisma.clientChecklistVersion.delete({ where: { id: created.id } }); throw error; }
    if (!result.totals.added) { await prisma.clientChecklistVersion.delete({ where: { id: created.id } }); throw badRequest("No valid questions were found in the file.", result.results.filter((r) => r.status === "ERROR").slice(0, 5).map((r) => `Row ${r.line}: ${r.message}`)); }
    await prisma.clientChecklistVersion.update({ where: { id: created.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    res.status(201).json({ success: true, message: `${result.totals.added} question(s) uploaded and published as ${name} v${version}.`, version: { id: created.id, name, version, itemCount: result.totals.added }, totals: result.totals });
  } catch (e) { next(e); }
};
