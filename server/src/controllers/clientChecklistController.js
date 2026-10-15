const prisma = require("../config/prisma");

const MODULES = [
  "SITE_SHARED", "EFS_SAFETY", "SR_SHOWROOM", "WS_WORKSHOP", "SY_STOCKYARD",
  "TOOLS_REGISTER", "MANPOWER_SALES", "MANPOWER_SERVICE", "MANPOWER_YARD", "THERMOGRAPHY",
];
const RESPONSE_TYPES = ["COMPLIANCE", "MEASUREMENT", "TEXT", "NUMBER"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const PRIORITIES = ["IMPORTANT_URGENT", "URGENT", "IMPORTANT", "REST"];
const DISCIPLINES = ["INFRASTRUCTURE", "FIRE", "ELECTRICAL", "THERMOGRAPHY"];
const defaultDiscipline = (moduleCode) => (moduleCode === "THERMOGRAPHY" ? "THERMOGRAPHY" : moduleCode === "EFS_SAFETY" ? "ELECTRICAL" : "INFRASTRUCTURE");

const badRequest = (message) => { const error = new Error(message); error.statusCode = 400; return error; };
const notFound = (message) => { const error = new Error(message); error.statusCode = 404; return error; };
const clean = (value) => (typeof value === "string" ? value.trim() : value);
const toJson = (value) => JSON.parse(JSON.stringify(value));

const versionInclude = {
  programme: { select: { id: true, name: true, code: true, financialYear: true } },
  items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }, { questionCode: "asc" }] },
  _count: { select: { snapshots: true } },
};

const locationInclude = {
  programme: { select: { id: true, name: true, code: true } },
  facilities: { where: { isActive: true }, orderBy: { facilityType: "asc" } },
  sharedMappings: true,
};

const getApplicableModules = (location) => {
  const types = new Set(location.facilities.map((item) => item.facilityType));
  const modules = ["SITE_SHARED", "EFS_SAFETY"];
  if (types.has("SHOWROOM")) modules.push("SR_SHOWROOM", "MANPOWER_SALES");
  if (types.has("WORKSHOP")) modules.push("WS_WORKSHOP", "TOOLS_REGISTER", "MANPOWER_SERVICE");
  if (types.has("STOCKYARD")) modules.push("SY_STOCKYARD", "MANPOWER_YARD");
  if (location.electricalSupplyType) modules.push("THERMOGRAPHY");
  return modules;
};

const matchesAny = (actualValues, expectedValues) =>
  !Array.isArray(expectedValues) || !expectedValues.length || expectedValues.some((value) => actualValues.includes(value));

const evaluateItem = (item, location, modules) => {
  if (!item.isActive) return { applicable: false, reason: "Item is inactive" };
  if (!modules.includes(item.moduleCode)) return { applicable: false, reason: `${item.moduleCode} module is not applicable` };
  const rule = item.applicabilityRule || {};
  const facilities = location.facilities;
  const facilityTypes = facilities.map((item) => item.facilityType);
  const ciLevels = facilities.map((item) => item.ciLevel).filter(Boolean);
  const workshopTypes = facilities.map((item) => item.workshopType).filter(Boolean);
  const electricalSupplyTypes = location.electricalSupplyType ? [location.electricalSupplyType] : [];

  if (!matchesAny(facilityTypes, rule.facilityTypes)) return { applicable: false, reason: "Facility type rule did not match" };
  if (!matchesAny(ciLevels, rule.ciLevels)) return { applicable: false, reason: "CI level rule did not match" };
  if (!matchesAny(workshopTypes, rule.workshopTypes)) return { applicable: false, reason: "Workshop type rule did not match" };
  if (!matchesAny(electricalSupplyTypes, rule.electricalSupplyTypes)) return { applicable: false, reason: "Electrical supply rule did not match" };
  if (Array.isArray(rule.tiers) && rule.tiers.length) {
    const tierMatch = facilities.some((f) => rule.tiers.includes(f.tier) && (!Array.isArray(rule.facilityTypes) || !rule.facilityTypes.length || rule.facilityTypes.includes(f.facilityType)));
    if (!tierMatch) return { applicable: false, reason: "Tier rule did not match" };
  }
  if (!matchesAny(location.state ? [location.state] : [], rule.states)) return { applicable: false, reason: "State rule did not match" };
  if (Array.isArray(rule.locationCodes) && rule.locationCodes.length && !rule.locationCodes.includes(location.locationCode)) return { applicable: false, reason: "Site-specific rule did not match" };
  if (rule.requiresBev === true && !facilities.some((item) => item.sellsBev)) return { applicable: false, reason: "BEV is not enabled" };
  if (rule.requiresPv === true && !facilities.some((item) => item.sellsPv)) return { applicable: false, reason: "PV is not enabled" };
  if (rule.requiresCv === true && !facilities.some((item) => item.sellsCv)) return { applicable: false, reason: "CV is not enabled" };
  if (rule.sharedFacilityCode) {
    const mapping = location.sharedMappings.find((item) => item.facilityCode === rule.sharedFacilityCode);
    if (!mapping) return { applicable: false, reason: `${rule.sharedFacilityCode} mapping is not configured` };
    if (rule.sharedArrangement && mapping.arrangement !== rule.sharedArrangement) {
      return { applicable: false, reason: `${rule.sharedFacilityCode} arrangement rule did not match` };
    }
  }
  return { applicable: true, reason: "Applicable" };
};

const normalizeRule = (rule) => {
  if (!rule || typeof rule !== "object") return null;
  const normalized = {};
  for (const field of ["facilityTypes", "ciLevels", "workshopTypes", "electricalSupplyTypes", "tiers", "states", "locationCodes"]) {
    if (Array.isArray(rule[field]) && rule[field].filter(Boolean).length) normalized[field] = [...new Set(rule[field].map(clean).filter(Boolean))];
  }
  for (const field of ["requiresBev", "requiresPv", "requiresCv"]) {
    if (rule[field] === true) normalized[field] = true;
  }
  if (clean(rule.sharedFacilityCode)) normalized.sharedFacilityCode = clean(rule.sharedFacilityCode).toUpperCase();
  if (clean(rule.sharedArrangement)) normalized.sharedArrangement = clean(rule.sharedArrangement).toUpperCase();
  return Object.keys(normalized).length ? normalized : null;
};

const normalizeItem = (body) => {
  const responseType = clean(body.responseType)?.toUpperCase() || "COMPLIANCE";
  const severityOnFail = clean(body.severityOnFail)?.toUpperCase() || "MEDIUM";
  const mahindraPriority = clean(body.mahindraPriority)?.toUpperCase() || "IMPORTANT";
  const minimumValue = body.minimumValue === "" || body.minimumValue == null ? null : Number(body.minimumValue);
  const maximumValue = body.maximumValue === "" || body.maximumValue == null ? null : Number(body.maximumValue);
  const data = {
    moduleCode: clean(body.moduleCode)?.toUpperCase(),
    sectionName: clean(body.sectionName),
    questionCode: clean(body.questionCode)?.toUpperCase(),
    questionText: clean(body.questionText),
    expectedCondition: clean(body.expectedCondition) || null,
    responseType,
    discipline: clean(body.discipline)?.toUpperCase() || defaultDiscipline(clean(body.moduleCode)?.toUpperCase()),
    severityOnFail,
    mahindraPriority,
    weight: Number(body.weight ?? 1),
    evidenceRequired: Boolean(body.evidenceRequired),
    minimumEvidence: Boolean(body.evidenceRequired) ? Number(body.minimumEvidence || 1) : 0,
    naAllowed: body.naAllowed !== false,
    naReasonRequired: body.naAllowed !== false && body.naReasonRequired !== false,
    measurementUnit: clean(body.measurementUnit) || null,
    minimumValue,
    maximumValue,
    regulationRef: clean(body.regulationRef) || null,
    applicabilityRule: normalizeRule(body.applicabilityRule),
    sortOrder: Number(body.sortOrder || 0),
    isActive: body.isActive !== false,
  };
  if (!MODULES.includes(data.moduleCode)) throw badRequest("Invalid checklist module.");
  if (!data.sectionName || !data.questionCode || !data.questionText) throw badRequest("Section, question code and question text are required.");
  if (!RESPONSE_TYPES.includes(responseType)) throw badRequest("Invalid response type.");
  if (!DISCIPLINES.includes(data.discipline)) throw badRequest("Invalid audit discipline.");
  if (!SEVERITIES.includes(severityOnFail)) throw badRequest("Invalid failure severity.");
  if (!PRIORITIES.includes(mahindraPriority)) throw badRequest("Invalid Mahindra priority.");
  if (!Number.isFinite(data.weight) || data.weight <= 0) throw badRequest("Weight must be greater than zero.");
  if (!Number.isInteger(data.minimumEvidence) || data.minimumEvidence < 0 || data.minimumEvidence > 10) throw badRequest("Minimum evidence must be between 0 and 10.");
  if ((minimumValue != null && !Number.isFinite(minimumValue)) || (maximumValue != null && !Number.isFinite(maximumValue))) throw badRequest("Measurement limits must be valid numbers.");
  if (minimumValue != null && maximumValue != null && minimumValue > maximumValue) throw badRequest("Minimum value cannot exceed maximum value.");
  return data;
};

const assertDraft = async (versionId) => {
  const version = await prisma.clientChecklistVersion.findUnique({ where: { id: versionId } });
  if (!version) throw notFound("Checklist version was not found.");
  if (version.status !== "DRAFT") throw badRequest("Published or archived checklist versions are immutable.");
  return version;
};

const starterItems = [
  ["SITE_SHARED", "Site Access", "SITE-001", "Is the approach road and dealer entrance safe, accessible and clearly identified?", "HIGH", "URGENT", true, null],
  ["SITE_SHARED", "Shared Facilities", "SITE-002", "Are shared parking areas available, marked and maintained?", "MEDIUM", "IMPORTANT", true, { sharedFacilityCode: "PARK", sharedArrangement: "SHARED" }],
  ["EFS_SAFETY", "Legal Compliance", "EFS-001", "Is the Fire NOC valid and available for verification?", "CRITICAL", "IMPORTANT_URGENT", true, null],
  ["EFS_SAFETY", "Electrical Safety", "EFS-002", "Is the highest measured earth-pit resistance within 5 ohm?", "CRITICAL", "IMPORTANT_URGENT", true, null, "MEASUREMENT", "ohm", null, 5],
  ["EFS_SAFETY", "EV Safety", "EFS-003", "Are EV charging points protected, labelled and safely isolated?", "HIGH", "URGENT", true, { requiresBev: true }],
  ["SR_SHOWROOM", "Customer Area", "SR-001", "Is the showroom customer lounge clean, functional and compliant with CI standards?", "MEDIUM", "IMPORTANT", true, { facilityTypes: ["SHOWROOM"] }],
  ["WS_WORKSHOP", "Workshop Bays", "WS-001", "Are mechanical workshop bays marked, unobstructed and maintained safely?", "HIGH", "URGENT", true, { facilityTypes: ["WORKSHOP"] }],
  ["WS_WORKSHOP", "Bodyshop", "WS-002", "Are paint booth interlocks, ventilation and fire controls functional?", "CRITICAL", "IMPORTANT_URGENT", true, { workshopTypes: ["Mechanical + Bodyshop", "Standalone Accidental"] }],
  ["SY_STOCKYARD", "Vehicle Storage", "SY-001", "Are stock vehicles parked with safe spacing and controlled movement routes?", "HIGH", "URGENT", true, { facilityTypes: ["STOCKYARD"] }],
  ["TOOLS_REGISTER", "Tools & Equipment", "TOOLS-001", "Are all mandatory workshop tools available with valid safety/calibration certificates?", "HIGH", "URGENT", true, { facilityTypes: ["WORKSHOP"] }],
  ["MANPOWER_SALES", "Sales Manpower", "MP-S-001", "Is on-roll sales manpower adequate against the approved business plan?", "MEDIUM", "IMPORTANT", false, { facilityTypes: ["SHOWROOM"] }],
  ["MANPOWER_SERVICE", "Service Manpower", "MP-W-001", "Is trained service manpower adequate for the workshop load?", "MEDIUM", "IMPORTANT", false, { facilityTypes: ["WORKSHOP"] }],
  ["MANPOWER_YARD", "Yard Manpower", "MP-Y-001", "Is stockyard manpower adequate for receiving, PDI and vehicle movement?", "MEDIUM", "IMPORTANT", false, { facilityTypes: ["STOCKYARD"] }],
  ["THERMOGRAPHY", "Thermal Scan", "TH-001", "Were critical panels scanned under load with no hotspot above the approved delta?", "CRITICAL", "IMPORTANT_URGENT", true, null, "MEASUREMENT", "°C delta", null, 15],
].map(([moduleCode, sectionName, questionCode, questionText, severityOnFail, mahindraPriority, evidenceRequired, applicabilityRule, responseType = "COMPLIANCE", measurementUnit = null, minimumValue = null, maximumValue = null], index) => ({
  moduleCode, sectionName, questionCode, questionText, severityOnFail, mahindraPriority,
  evidenceRequired, minimumEvidence: evidenceRequired ? (severityOnFail === "CRITICAL" ? 2 : 1) : 0,
  applicabilityRule, responseType, measurementUnit, minimumValue, maximumValue,
  expectedCondition: null, weight: 1, naAllowed: true, naReasonRequired: true,
  regulationRef: null, sortOrder: index + 1, isActive: true,
}));

exports.getConstants = (req, res) => res.json({ success: true, disciplines: DISCIPLINES, modules: MODULES, responseTypes: RESPONSE_TYPES, severities: SEVERITIES, priorities: PRIORITIES });

exports.createVersion = async (req, res, next) => {
  try {
    const programmeId = clean(req.body.programmeId);
    const name = clean(req.body.name);
    const versionNumber = clean(req.body.version);
    if (!programmeId || !name || !versionNumber) throw badRequest("Programme, checklist name and version are required.");
    const programme = await prisma.auditProgramme.findUnique({ where: { id: programmeId } });
    if (!programme) throw notFound("Audit programme was not found.");
    const version = await prisma.clientChecklistVersion.create({
      data: { programmeId, name, version: versionNumber, effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : null },
      include: versionInclude,
    });
    res.status(201).json({ success: true, message: "Checklist draft created successfully.", version });
  } catch (error) { next(error); }
};

exports.getVersions = async (req, res, next) => {
  try {
    const where = req.query.programmeId ? { programmeId: String(req.query.programmeId) } : {};
    const versions = await prisma.clientChecklistVersion.findMany({ where, include: versionInclude, orderBy: { createdAt: "desc" } });
    res.json({ success: true, versions });
  } catch (error) { next(error); }
};

exports.getVersion = async (req, res, next) => {
  try {
    const version = await prisma.clientChecklistVersion.findUnique({ where: { id: req.params.versionId }, include: versionInclude });
    if (!version) throw notFound("Checklist version was not found.");
    res.json({ success: true, version });
  } catch (error) { next(error); }
};

exports.createItem = async (req, res, next) => {
  try {
    await assertDraft(req.params.versionId);
    const item = await prisma.clientChecklistItem.create({ data: { versionId: req.params.versionId, ...normalizeItem(req.body) } });
    res.status(201).json({ success: true, message: "Checklist question added successfully.", item });
  } catch (error) { next(error); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const current = await prisma.clientChecklistItem.findUnique({ where: { id: req.params.itemId } });
    if (!current || current.versionId !== req.params.versionId) throw notFound("Checklist question was not found.");
    await assertDraft(current.versionId);
    const item = await prisma.clientChecklistItem.update({ where: { id: current.id }, data: normalizeItem(req.body) });
    res.json({ success: true, message: "Checklist question updated successfully.", item });
  } catch (error) { next(error); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const current = await prisma.clientChecklistItem.findUnique({ where: { id: req.params.itemId } });
    if (!current || current.versionId !== req.params.versionId) throw notFound("Checklist question was not found.");
    await assertDraft(current.versionId);
    await prisma.clientChecklistItem.delete({ where: { id: current.id } });
    res.json({ success: true, message: "Checklist question removed successfully." });
  } catch (error) { next(error); }
};

exports.addStarterItems = async (req, res, next) => {
  try {
    await assertDraft(req.params.versionId);
    const result = await prisma.clientChecklistItem.createMany({ data: starterItems.map((item) => ({ versionId: req.params.versionId, ...item })), skipDuplicates: true });
    res.status(201).json({ success: true, message: `${result.count} starter questions added.`, count: result.count });
  } catch (error) { next(error); }
};

exports.addDemoPack = async (req, res, next) => {
  try {
    await assertDraft(req.params.versionId);
    const { demoChecklistPack } = require("../utils/demoChecklistPack");
    const result = await prisma.clientChecklistItem.createMany({ data: demoChecklistPack.map((item) => ({ versionId: req.params.versionId, ...item })), skipDuplicates: true });
    res.status(201).json({ success: true, message: `${result.count} sample questions added.`, count: result.count });
  } catch (error) { next(error); }
};

exports.publishVersion = async (req, res, next) => {
  try {
    const version = await prisma.clientChecklistVersion.findUnique({ where: { id: req.params.versionId }, include: { _count: { select: { items: true } } } });
    if (!version) throw notFound("Checklist version was not found.");
    if (version.status !== "DRAFT") throw badRequest("Only a draft checklist can be published.");
    if (!version._count.items) throw badRequest("Add at least one checklist question before publishing.");
    const published = await prisma.clientChecklistVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: new Date() }, include: versionInclude });
    res.json({ success: true, message: "Checklist published and locked successfully.", version: published });
  } catch (error) { next(error); }
};

const buildPreview = async (locationId, versionId) => {
  const [location, version] = await Promise.all([
    prisma.dealerLocation.findUnique({ where: { id: locationId }, include: locationInclude }),
    prisma.clientChecklistVersion.findUnique({ where: { id: versionId }, include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } } }),
  ]);
  if (!location) throw notFound("Dealer location was not found.");
  if (!version) throw notFound("Checklist version was not found.");
  if (location.programmeId !== version.programmeId) throw badRequest("Checklist and location must belong to the same programme.");
  const modules = getApplicableModules(location);
  const evaluated = version.items.map((item) => ({ item, ...evaluateItem(item, location, modules) }));
  return {
    location,
    version,
    modules,
    applicableItems: evaluated.filter((entry) => entry.applicable).map((entry) => entry.item),
    excludedItems: evaluated.filter((entry) => !entry.applicable).map((entry) => ({ id: entry.item.id, questionCode: entry.item.questionCode, moduleCode: entry.item.moduleCode, reason: entry.reason })),
  };
};

exports.previewLocationChecklist = async (req, res, next) => {
  try {
    if (!req.query.versionId) throw badRequest("versionId is required.");
    const preview = await buildPreview(req.params.locationId, String(req.query.versionId));
    res.json({
      success: true,
      preview: {
        location: { id: preview.location.id, dealerName: preview.location.dealerName, locationName: preview.location.locationName, locationCode: preview.location.locationCode },
        checklist: { id: preview.version.id, name: preview.version.name, version: preview.version.version, status: preview.version.status },
        applicableModules: preview.modules,
        applicableCount: preview.applicableItems.length,
        excludedCount: preview.excludedItems.length,
        applicableItems: preview.applicableItems,
        excludedItems: preview.excludedItems,
      },
    });
  } catch (error) { next(error); }
};

const createSnapshot = async (locationId, versionId) => {
  const preview = await buildPreview(locationId, versionId);
  if (preview.version.status !== "PUBLISHED") throw badRequest("Publish the checklist before generating a location snapshot.");
  if (!preview.applicableItems.length) throw badRequest("No checklist questions are applicable to this location.");
  const existing = await prisma.locationChecklistSnapshot.findUnique({
    where: { locationId_versionId: { locationId: preview.location.id, versionId: preview.version.id } },
    include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } },
  });
  if (existing) return { snapshot: existing, created: false };
  const configuration = {
    programmeId: preview.location.programmeId,
    facilityTypes: preview.location.facilities.map((item) => item.facilityType),
    facilities: toJson(preview.location.facilities),
    sharedMappings: toJson(preview.location.sharedMappings),
    electricalSupplyType: preview.location.electricalSupplyType,
    applicableModules: preview.modules,
  };
  const snapshot = await prisma.locationChecklistSnapshot.create({
    data: {
      locationId: preview.location.id,
      versionId: preview.version.id,
      checklistName: preview.version.name,
      checklistVersion: preview.version.version,
      itemCount: preview.applicableItems.length,
      configuration,
      items: {
        create: preview.applicableItems.map((item) => ({
          sourceItemId: item.id,
          moduleCode: item.moduleCode,
          sectionName: item.sectionName,
          questionCode: item.questionCode,
          sortOrder: item.sortOrder,
          itemData: toJson(item),
        })),
      },
    },
    include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } },
  });
  return { snapshot, created: true };
};

exports.generateLocationSnapshot = async (req, res, next) => {
  try {
    const versionId = clean(req.body.versionId);
    if (!versionId) throw badRequest("versionId is required.");
    const { snapshot, created } = await createSnapshot(req.params.locationId, versionId);
    if (!created) return res.json({ success: true, message: "This location already has a snapshot for the selected checklist version.", snapshot });
    res.status(201).json({ success: true, message: "Location checklist snapshot generated successfully.", snapshot });
  } catch (error) { next(error); }
};

exports.getLocationSnapshots = async (req, res, next) => {
  try {
    const snapshots = await prisma.locationChecklistSnapshot.findMany({
      where: { locationId: req.params.locationId },
      include: { items: { orderBy: [{ moduleCode: "asc" }, { sortOrder: "asc" }] } },
      orderBy: { generatedAt: "desc" },
    });
    res.json({ success: true, snapshots });
  } catch (error) { next(error); }
};


exports.helpers = { DISCIPLINES, defaultDiscipline, MODULES, toJson, createSnapshot };

const XLSX = require("xlsx");
const CHECKLIST_COLUMNS = ["Module", "Discipline", "Section", "Question Code", "Question", "Expected Condition", "Response Type", "Severity On Fail", "Priority", "Weight", "Min Photos", "Unit", "Min Value", "Max Value", "Regulation", "Facility Types", "Tiers", "States", "Requires BEV"];

exports.checklistTemplate = (req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();
    const example = { Module: "EFS_SAFETY", Discipline: "FIRE", Section: "Fire fighting", "Question Code": "F2.1", Question: "Fire extinguishers are in date and accessible.", "Expected Condition": "", "Response Type": "COMPLIANCE", "Severity On Fail": "CRITICAL", Priority: "IMPORTANT_URGENT", Weight: 1, "Min Photos": 2, Unit: "", "Min Value": "", "Max Value": "", Regulation: "NBC 2016", "Facility Types": "WORKSHOP,SHOWROOM", Tiers: "", States: "", "Requires BEV": "" };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([example], { header: CHECKLIST_COLUMNS }), "Checklist");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["How to use"], ["One row per question. Module: " + MODULES.join(", ")], ["Discipline: " + DISCIPLINES.join(", ")], ["Severity: " + SEVERITIES.join(", ") + "   Priority: " + PRIORITIES.join(", ")], ["Facility Types, Tiers and States are comma separated and optional; blank means the question applies everywhere."], ["Response Type COMPLIANCE or MEASUREMENT (then fill Unit, Min Value or Max Value)."]]), "Read Me");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="checklist-template.xlsx"');
    res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (error) { next(error); }
};

// Reads checklist rows from a workbook buffer and adds them to a draft version.
const importChecklistBuffer = async (versionId, buffer, dryRun = false) => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Checklist || wb.Sheets[wb.SheetNames[0]], { defval: "" });
  if (!rows.length) throw badRequest("The checklist sheet is empty.");
  const list = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
  const existing = new Set((await prisma.clientChecklistItem.findMany({ where: { versionId }, select: { questionCode: true } })).map((i) => i.questionCode));
  const results = []; const data = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    try {
      const rule = { facilityTypes: list(row["Facility Types"]).map((x) => x.toUpperCase()), tiers: list(row.Tiers), states: list(row.States), requiresBev: /^(y|yes|true|1)$/i.test(String(row["Requires BEV"])) };
      const item = normalizeItem({
        moduleCode: row.Module, discipline: row.Discipline, sectionName: row.Section, questionCode: row["Question Code"], questionText: row.Question, expectedCondition: row["Expected Condition"],
        responseType: row["Response Type"] || "COMPLIANCE", severityOnFail: row["Severity On Fail"] || "MEDIUM", mahindraPriority: row.Priority || "IMPORTANT", weight: row.Weight || 1,
        evidenceRequired: true, minimumEvidence: row["Min Photos"] || 1, measurementUnit: row.Unit, minimumValue: row["Min Value"], maximumValue: row["Max Value"], regulationRef: row.Regulation,
        applicabilityRule: rule, sortOrder: existing.size + data.length + 1,
      });
      if (existing.has(item.questionCode) || data.some((d) => d.questionCode === item.questionCode)) { results.push({ line, code: item.questionCode, status: "SKIPPED", message: "Question code already exists in this version." }); return; }
      data.push(item); results.push({ line, code: item.questionCode, status: "ADDED", message: "" });
    } catch (e) { results.push({ line, code: String(row["Question Code"] || ""), status: "ERROR", message: e.message }); }
  });
  if (!dryRun && data.length) await prisma.clientChecklistItem.createMany({ data: data.map((d) => ({ versionId, ...d })) });
  const count = (st) => results.filter((r) => r.status === st).length;
  return { dryRun, totals: { rows: results.length, added: count("ADDED"), skipped: count("SKIPPED"), errors: count("ERROR") }, results };
};

exports.importItems = async (req, res, next) => {
  try {
    await assertDraft(req.params.versionId);
    if (!req.file) throw badRequest("Upload an Excel file.");
    res.json({ success: true, ...(await importChecklistBuffer(req.params.versionId, req.file.buffer, String(req.body.dryRun) === "true")) });
  } catch (error) { next(error); }
};

exports.helpers = { ...exports.helpers, importChecklistBuffer, normalizeItem };
