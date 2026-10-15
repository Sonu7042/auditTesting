const FACILITY_TYPES = ["SHOWROOM", "WORKSHOP", "STOCKYARD"];
const DISCIPLINES = ["INFRA", "FIRE", "ELECTRICAL", "THERMOGRAPHY"];

const filled = (v) => (typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null && v !== "");
const num = (v) => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
const validPhone = (v) => /^[6-9]\d{9}$/.test(String(v || ""));

const facilityTypes = (data) =>
  (data?.facilities?.items || []).map((item) => item.facilityType).filter(Boolean);

const ACCESS_ROLES = ["CORPORATE_MANAGER", "ZONAL_MANAGER", "REGIONAL_MANAGER", "SITE_INCHARGE", "SITE_USER"];

// Sections in the order they are filled in. Access is optional (weight 0): users can also be added later.
const SECTIONS = [
  {
    key: "identity", label: "Identity & territory", weight: 15,
    check: (d) => {
      const x = d.identity || {};
      return ["dealerName", "dealerCode", "locationName", "locationCode", "zone", "regionalOffice", "state", "city"].filter((f) => !filled(x[f]));
    },
  },
  {
    key: "location", label: "Location & contacts", weight: 15,
    check: (d) => {
      const x = d.location || {}; const m = [];
      if (!filled(x.address)) m.push("address");
      if (!num(x.latitude) || Math.abs(Number(x.latitude)) > 90) m.push("latitude");
      if (!num(x.longitude) || Math.abs(Number(x.longitude)) > 180) m.push("longitude");
      const r = Number(x.geofenceRadiusM);
      if (!Number.isInteger(r) || r < 50 || r > 5000) m.push("geofenceRadiusM (50-5000)");
      if (!filled(x.contactName)) m.push("contactName");
      if (!validPhone(x.contactPhone)) m.push("contactPhone (10 digits)");
      if (!validEmail(x.contactEmail)) m.push("contactEmail");
      return m;
    },
  },
  {
    key: "facilities", label: "Facilities & profile", weight: 15,
    check: (d) => {
      const m = []; const items = d.facilities?.items || [];
      if (!items.length) return ["at least one facility"];
      const types = items.map((i) => i.facilityType);
      if (types.some((t) => !FACILITY_TYPES.includes(t)) || new Set(types).size !== types.length) m.push("valid unique facilities");
      items.forEach((i) => { if (!filled(i.tier)) m.push(`${i.facilityType} tier`); });
      if (!filled(d.facilities?.electricalSupplyType)) m.push("electricalSupplyType");
      return m;
    },
  },
  {
    key: "scope", label: "Audit scope", weight: 10,
    check: (d) => {
      const m = []; const scope = d.scope || {};
      facilityTypes(d).forEach((t) => { if (!DISCIPLINES.some((x) => scope[t]?.[x])) m.push(`${t} audit types`); });
      return facilityTypes(d).length ? m : ["facilities first"];
    },
  },
  { key: "checklist", label: "Checklist", weight: 20, check: (d) => (d.checklist?.versionId ? [] : ["a checklist version"]) },
  {
    key: "tools", label: "Tools register", weight: 10,
    applies: (d) => facilityTypes(d).includes("WORKSHOP"),
    check: (d) => {
      const rows = d.tools || [];
      if (!rows.length) return ["tools rows"];
      return rows.some((r) => !filled(r.name) || !num(r.required) || !filled(r.validTill)) ? ["tool name, required qty and validity date"] : [];
    },
  },
  {
    key: "volumes", label: "Manpower & volumes", weight: 15,
    check: (d) => {
      const m = []; const v = d.volumes || {};
      if (!Object.values(v).some((x) => num(x))) m.push("at least one volume figure");
      const rows = d.manpower || [];
      if (!rows.length) m.push("manpower rows");
      else if (rows.some((r) => !filled(r.role) || !num(r.required))) m.push("manpower role and required count");
      return m;
    },
  },
  {
    key: "access", label: "Access (optional)", weight: 0, optional: true,
    check: (d) => {
      const rows = d.access || [];
      if (!rows.length) return ["no users added yet"];
      return rows.some((r) => !filled(r.fullName) || !validEmail(r.email) || !ACCESS_ROLES.includes(r.role)) ? ["name, valid email and role for every user"] : [];
    },
  },
];

const computeReadiness = (data = {}) => {
  let total = 0; let done = 0;
  const sections = SECTIONS.map((s) => {
    const applies = s.applies ? s.applies(data) : true;
    const missing = applies ? s.check(data) : [];
    const complete = applies && missing.length === 0;
    if (applies) { total += s.weight; if (complete) done += s.weight; }
    return { key: s.key, label: s.label, weight: s.weight, applies, complete, missing, optional: Boolean(s.optional) };
  });
  return { percent: total ? Math.round((done / total) * 100) : 0, sections };
};

module.exports = { computeReadiness, FACILITY_TYPES, DISCIPLINES, ACCESS_ROLES };
