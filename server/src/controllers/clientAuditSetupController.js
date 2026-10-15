const prisma = require("../config/prisma");

const PROGRAMME_TYPES = new Set(["FACILITY_AUDIT", "TD_VEHICLE_AUDIT"]);
const FACILITY_TYPES = new Set(["SHOWROOM", "WORKSHOP", "STOCKYARD"]);
const ARRANGEMENTS = new Set(["SHARED", "SEPARATE"]);

const clean = (value) => (typeof value === "string" ? value.trim() : value);
const requiredText = (value) => typeof value === "string" && value.trim().length > 0;
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
const validPhone = (value) => /^[6-9]\d{9}$/.test(value || "");

const badRequest = (message, errors) => {
  const error = new Error(message);
  error.statusCode = 400;
  if (errors) error.errors = errors;
  return error;
};

const normalizeProgramme = (body) => ({
  companyId: clean(body.companyId),
  name: clean(body.name),
  code: clean(body.code)?.toUpperCase(),
  programmeType: clean(body.programmeType)?.toUpperCase(),
  financialYear: clean(body.financialYear),
});

const validateProgramme = (programme) => {
  const missing = ["companyId", "name", "code", "financialYear"].filter(
    (field) => !requiredText(programme[field]),
  );
  if (missing.length) throw badRequest("Programme details are incomplete.", missing);
  if (!PROGRAMME_TYPES.has(programme.programmeType)) {
    throw badRequest("Invalid programme type.");
  }
};

const normalizeFacility = (facility) => ({
  facilityType: clean(facility.facilityType)?.toUpperCase(),
  displayName: clean(facility.displayName) || null,
  tier: clean(facility.tier) || null,
  ciLevel: clean(facility.ciLevel) || null,
  format: clean(facility.format) || null,
  workshopType: clean(facility.workshopType) || null,
  stockyardType: clean(facility.stockyardType) || null,
  sellsPv: Boolean(facility.sellsPv),
  sellsBev: Boolean(facility.sellsBev),
  sellsCv: Boolean(facility.sellsCv),
  isActive: facility.isActive !== false,
});

const normalizeSharedMapping = (mapping) => ({
  facilityCode: clean(mapping.facilityCode)?.toUpperCase(),
  description: clean(mapping.description) || null,
  arrangement: clean(mapping.arrangement)?.toUpperCase() || "SHARED",
  usedBy: Array.isArray(mapping.usedBy)
    ? [...new Set(mapping.usedBy.map((item) => clean(item)?.toUpperCase()).filter(Boolean))]
    : [],
  quantity: Number(mapping.quantity || 1),
  auditAtSite: mapping.auditAtSite !== false,
});

const normalizeLocation = (body) => ({
  programmeId: clean(body.programmeId),
  projectId: clean(body.projectId) || null,
  zone: clean(body.zone),
  regionalOffice: clean(body.regionalOffice),
  dealerName: clean(body.dealerName),
  dealerCode: clean(body.dealerCode)?.toUpperCase(),
  locationName: clean(body.locationName),
  locationCode: clean(body.locationCode)?.toUpperCase(),
  address: clean(body.address),
  city: clean(body.city) || null,
  district: clean(body.district) || null,
  state: clean(body.state) || null,
  latitude: Number(body.latitude),
  longitude: Number(body.longitude),
  geofenceRadiusM: Number(body.geofenceRadiusM || 200),
  contactName: clean(body.contactName),
  contactPhone: clean(body.contactPhone),
  contactEmail: clean(body.contactEmail)?.toLowerCase(),
  electricalSupplyType: clean(body.electricalSupplyType) || null,
  facilities: Array.isArray(body.facilities) ? body.facilities.map(normalizeFacility) : [],
  sharedMappings: Array.isArray(body.sharedMappings)
    ? body.sharedMappings.map(normalizeSharedMapping)
    : [],
});

const validateLocation = (location) => {
  const required = [
    "programmeId", "zone", "regionalOffice", "dealerName", "dealerCode",
    "locationName", "locationCode", "address", "contactName", "contactPhone",
    "contactEmail",
  ];
  const missing = required.filter((field) => !requiredText(location[field]));
  if (missing.length) throw badRequest("Location details are incomplete.", missing);
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    throw badRequest("Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    throw badRequest("Longitude must be between -180 and 180.");
  }
  if (!Number.isInteger(location.geofenceRadiusM) || location.geofenceRadiusM < 50 || location.geofenceRadiusM > 5000) {
    throw badRequest("Geofence radius must be between 50 and 5000 metres.");
  }
  if (!validPhone(location.contactPhone)) throw badRequest("Enter a valid 10-digit contact phone number.");
  if (!validEmail(location.contactEmail)) throw badRequest("Enter a valid contact email address.");
  if (!location.facilities.length) throw badRequest("Select at least one facility.");

  const facilityTypes = location.facilities.map((item) => item.facilityType);
  if (facilityTypes.some((type) => !FACILITY_TYPES.has(type))) throw badRequest("Invalid facility type.");
  if (new Set(facilityTypes).size !== facilityTypes.length) throw badRequest("A facility type can be selected only once.");

  for (const mapping of location.sharedMappings) {
    if (!requiredText(mapping.facilityCode) || !ARRANGEMENTS.has(mapping.arrangement)) {
      throw badRequest("Shared facility mapping is invalid.");
    }
    if (!Number.isInteger(mapping.quantity) || mapping.quantity < 1) {
      throw badRequest("Shared facility quantity must be at least 1.");
    }
    if (mapping.usedBy.some((type) => !facilityTypes.includes(type))) {
      throw badRequest("Shared facility mapping contains a facility that is not present at this location.");
    }
  }
};

const getApplicableModules = (location) => {
  const types = new Set(location.facilities.filter((item) => item.isActive).map((item) => item.facilityType));
  const modules = ["SITE_SHARED", "EFS_SAFETY"];
  if (types.has("SHOWROOM")) modules.push("SR_SHOWROOM", "MANPOWER_SALES");
  if (types.has("WORKSHOP")) modules.push("WS_WORKSHOP", "TOOLS_REGISTER", "MANPOWER_SERVICE");
  if (types.has("STOCKYARD")) modules.push("SY_STOCKYARD", "MANPOWER_YARD");
  if (location.electricalSupplyType) modules.push("THERMOGRAPHY");
  return modules;
};

const locationInclude = {
  programme: { include: { company: { select: { id: true, companyName: true } } } },
  project: { select: { id: true, projectName: true, status: true } },
  facilities: { orderBy: { facilityType: "asc" } },
  sharedMappings: { orderBy: { facilityCode: "asc" } },
};

const withModules = (location) => ({ ...location, applicableModules: getApplicableModules(location) });

exports.createProgramme = async (req, res, next) => {
  try {
    const data = normalizeProgramme(req.body);
    validateProgramme(data);
    const company = await prisma.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
    if (!company) throw badRequest("Selected company does not exist.");
    const programme = await prisma.auditProgramme.create({ data });
    res.status(201).json({ success: true, message: "Audit programme created successfully.", programme });
  } catch (error) { next(error); }
};

exports.getProgrammes = async (req, res, next) => {
  try {
    const where = req.query.companyId ? { companyId: String(req.query.companyId) } : {};
    const programmes = await prisma.auditProgramme.findMany({
      where,
      include: { company: { select: { id: true, companyName: true } }, _count: { select: { locations: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, programmes });
  } catch (error) { next(error); }
};

exports.createLocation = async (req, res, next) => {
  try {
    const data = normalizeLocation(req.body);
    validateLocation(data);
    const programme = await prisma.auditProgramme.findUnique({ where: { id: data.programmeId } });
    if (!programme) throw badRequest("Selected audit programme does not exist.");
    if (programme.programmeType !== "FACILITY_AUDIT") throw badRequest("Facility setup requires a Facility Audit programme.");
    if (data.projectId) {
      const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { id: true, companyId: true } });
      if (!project || project.companyId !== programme.companyId) throw badRequest("Linked project must belong to the programme company.");
    }

    const { facilities, sharedMappings, ...locationData } = data;
    const location = await prisma.dealerLocation.create({
      data: {
        ...locationData,
        facilities: { create: facilities },
        sharedMappings: { create: sharedMappings },
      },
      include: locationInclude,
    });
    res.status(201).json({ success: true, message: "Dealer location setup created successfully.", location: withModules(location) });
  } catch (error) { next(error); }
};

exports.getLocations = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.programmeId) where.programmeId = String(req.query.programmeId);
    if (req.query.companyId) where.programme = { companyId: String(req.query.companyId) };
    const locations = await prisma.dealerLocation.findMany({ where, include: locationInclude, orderBy: { createdAt: "desc" } });
    res.json({ success: true, locations: locations.map(withModules) });
  } catch (error) { next(error); }
};

exports.getLocation = async (req, res, next) => {
  try {
    const location = await prisma.dealerLocation.findUnique({ where: { id: req.params.locationId }, include: locationInclude });
    if (!location) {
      const error = new Error("Dealer location was not found."); error.statusCode = 404; throw error;
    }
    res.json({ success: true, location: withModules(location) });
  } catch (error) { next(error); }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const data = normalizeLocation(req.body);
    validateLocation(data);
    const current = await prisma.dealerLocation.findUnique({ where: { id: req.params.locationId }, include: { programme: true } });
    if (!current) { const error = new Error("Dealer location was not found."); error.statusCode = 404; throw error; }
    if (data.programmeId !== current.programmeId) throw badRequest("A location cannot be moved to another programme.");
    if (data.projectId) {
      const project = await prisma.project.findUnique({ where: { id: data.projectId }, select: { companyId: true } });
      if (!project || project.companyId !== current.programme.companyId) throw badRequest("Linked project must belong to the programme company.");
    }
    const { facilities, sharedMappings, ...locationData } = data;
    const location = await prisma.$transaction(async (tx) => {
      await tx.facility.deleteMany({ where: { locationId: current.id } });
      await tx.sharedFacilityMapping.deleteMany({ where: { locationId: current.id } });
      return tx.dealerLocation.update({
        where: { id: current.id },
        data: { ...locationData, facilities: { create: facilities }, sharedMappings: { create: sharedMappings } },
        include: locationInclude,
      });
    });
    res.json({ success: true, message: "Dealer location setup updated successfully.", location: withModules(location) });
  } catch (error) { next(error); }
};

exports.getSetupOptions = async (req, res, next) => {
  try {
    const [companies, projects] = await Promise.all([
      prisma.company.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: "asc" } }),
      prisma.project.findMany({ select: { id: true, companyId: true, projectName: true, status: true }, orderBy: { projectName: "asc" } }),
    ]);
    res.json({
      success: true,
      companies,
      projects,
      constants: {
        programmeTypes: [...PROGRAMME_TYPES],
        facilityTypes: [...FACILITY_TYPES],
        sharedFacilityCodes: ["GATE", "PARK", "ACC", "IT", "WASH"],
        electricalSupplyTypes: ["LT supply", "HT supply", "HT + LT supply"],
      },
    });
  } catch (error) { next(error); }
};


exports.helpers = { normalizeLocation, validateLocation, locationInclude, withModules, badRequest };
