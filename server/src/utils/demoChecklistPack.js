// Sample checklist pack used to demonstrate the platform. The client's approved
// checklist replaces this content; the structure (module, discipline, tier and
// state rules, severity and priority) mirrors the integrated audit workbook.
const C = (moduleCode, discipline, sectionName, code, text, severity, priority, opts = {}) => ({
  moduleCode, discipline, sectionName, questionCode: code, questionText: text, severityOnFail: severity, mahindraPriority: priority,
  responseType: opts.type || "COMPLIANCE", measurementUnit: opts.unit || null, minimumValue: opts.min ?? null, maximumValue: opts.max ?? null,
  evidenceRequired: true, minimumEvidence: severity === "CRITICAL" ? 2 : 1, applicabilityRule: opts.rule || null,
  expectedCondition: opts.expect || null, regulationRef: opts.ref || null, weight: opts.weight || 1,
  naAllowed: true, naReasonRequired: true, isActive: true,
});

const SHOW = { facilityTypes: ["SHOWROOM"] };
const WORK = { facilityTypes: ["WORKSHOP"] };
const YARD = { facilityTypes: ["STOCKYARD"] };

const pack = [
  // ---- Infrastructure : site & shared
  C("SITE_SHARED", "INFRASTRUCTURE", "Site access", "S1.1", "Approach road is pucca and smooth, with no potholes or water-logging.", "MEDIUM", "IMPORTANT"),
  C("SITE_SHARED", "INFRASTRUCTURE", "Site access", "S1.2", "Entry and exit are clearly marked; no customer or service vehicles wait on the public road.", "MEDIUM", "IMPORTANT"),
  C("SITE_SHARED", "INFRASTRUCTURE", "Shared facilities", "S2.1", "Entry gate, perimeter wall and security cabin are intact, lit and staffed round the clock.", "HIGH", "URGENT", { rule: { sharedFacilityCode: "GATE" } }),
  C("SITE_SHARED", "INFRASTRUCTURE", "Shared facilities", "S2.2", "Customer parking is paved, bays are marked and lit at night, with no water accumulation.", "MEDIUM", "IMPORTANT", { rule: { sharedFacilityCode: "PARK" } }),
  C("SITE_SHARED", "INFRASTRUCTURE", "Statutory documents", "S3.1", "Valid trade licence and insurance are available for all facilities on the premises.", "HIGH", "URGENT"),
  C("SITE_SHARED", "INFRASTRUCTURE", "Safety", "S4.1", "First-aid kit is stocked, in date and accessible; trained first-aiders are available on each shift.", "MEDIUM", "IMPORTANT"),
  // ---- Infrastructure : showroom
  C("SR_SHOWROOM", "INFRASTRUCTURE", "Customer area", "SR1.1", "Showroom exterior, fascia and signage follow the current CI standard and are clean and lit.", "MEDIUM", "IMPORTANT", { rule: SHOW }),
  C("SR_SHOWROOM", "INFRASTRUCTURE", "Customer area", "SR1.2", "Reception and customer lounge are clean and functional, with drinking water and restrooms available.", "MEDIUM", "IMPORTANT", { rule: SHOW }),
  C("SR_SHOWROOM", "INFRASTRUCTURE", "Display", "SR2.1", "Display area has the minimum number of current-model vehicles with price boards and brochures.", "MEDIUM", "IMPORTANT", { rule: { ...SHOW, tiers: ["MADB", "CUBE"] } }),
  C("SR_SHOWROOM", "INFRASTRUCTURE", "Display", "SR2.2", "Dedicated test-drive vehicles are available and documented for each model sold.", "MEDIUM", "IMPORTANT", { rule: { ...SHOW, tiers: ["MADB"] } }),
  C("SR_SHOWROOM", "INFRASTRUCTURE", "EV readiness", "SR3.1", "BEV display, charging point and trained EV sales staff are available.", "HIGH", "URGENT", { rule: { ...SHOW, requiresBev: true } }),
  C("MANPOWER_SALES", "INFRASTRUCTURE", "Manpower", "MP-S1", "On-roll sales manpower is at or above the approved business plan.", "MEDIUM", "IMPORTANT", { rule: SHOW, evidenceRequired: false }),
  // ---- Infrastructure : workshop
  C("WS_WORKSHOP", "INFRASTRUCTURE", "Workshop bays", "WS1.1", "Mechanical bays are marked, unobstructed and equipped with lifts in working condition.", "HIGH", "URGENT", { rule: WORK }),
  C("WS_WORKSHOP", "INFRASTRUCTURE", "Workshop bays", "WS1.2", "Service reception, customer waiting area and job-card process follow the standard.", "MEDIUM", "IMPORTANT", { rule: { ...WORK, tiers: ["Main Dealer Workshop", "SMART Workshop"] } }),
  C("WS_WORKSHOP", "INFRASTRUCTURE", "Bodyshop", "WS2.1", "Paint booth interlocks, ventilation and filters are functional; paint storage is segregated.", "CRITICAL", "IMPORTANT_URGENT", { rule: { ...WORK, workshopTypes: ["Mechanical + Bodyshop", "Bodyshop only"] } }),
  C("WS_WORKSHOP", "INFRASTRUCTURE", "Environment", "WS3.1", "Used oil, batteries and hazardous waste are stored in a covered, bunded area and disposed through authorised vendors.", "HIGH", "URGENT", { rule: WORK, ref: "Hazardous Waste Rules" }),
  C("TOOLS_REGISTER", "INFRASTRUCTURE", "Tools & equipment", "TL1.1", "All mandatory (Must Have-Fast) workshop tools are available as per the register.", "HIGH", "URGENT", { rule: WORK }),
  C("TOOLS_REGISTER", "INFRASTRUCTURE", "Tools & equipment", "TL1.2", "Safety certificates and calibration labels on lifts and measuring tools are valid.", "CRITICAL", "IMPORTANT_URGENT", { rule: WORK }),
  C("MANPOWER_SERVICE", "INFRASTRUCTURE", "Manpower", "MP-W1", "On-roll trained technicians meet the workshop load norm.", "MEDIUM", "IMPORTANT", { rule: WORK, evidenceRequired: false }),
  // ---- Infrastructure : stockyard
  C("SY_STOCKYARD", "INFRASTRUCTURE", "Vehicle storage", "SY1.1", "Stock vehicles are parked with safe spacing and marked movement routes.", "HIGH", "URGENT", { rule: YARD }),
  C("SY_STOCKYARD", "INFRASTRUCTURE", "Receiving & PDI", "SY2.1", "Vehicle receiving bay and PDI area are paved, lit and covered.", "MEDIUM", "IMPORTANT", { rule: YARD }),
  C("SY_STOCKYARD", "INFRASTRUCTURE", "EV stock", "SY3.1", "EV stock is parked with charging safeguards and fire protection.", "CRITICAL", "IMPORTANT_URGENT", { rule: { ...YARD, requiresBev: true } }),
  // ---- Fire & life safety
  C("EFS_SAFETY", "FIRE", "Legal compliance", "F1.1", "Valid Fire NOC (and Form B returns where required) is available for the premises.", "CRITICAL", "IMPORTANT_URGENT", { ref: "State Fire & Life Safety Act" }),
  C("EFS_SAFETY", "FIRE", "Legal compliance", "F1.2", "Bihar Fire & Life Safety Act requirements for workshops are met (separate fire plan and signage).", "HIGH", "URGENT", { rule: { states: ["Bihar"] }, ref: "Bihar Fire & Life Safety Act" }),
  C("EFS_SAFETY", "FIRE", "Fire fighting", "F2.1", "Fire extinguishers are of the right type, in date, accessible and match the approved fire plan.", "CRITICAL", "IMPORTANT_URGENT"),
  C("EFS_SAFETY", "FIRE", "Fire fighting", "F2.2", "CO2 extinguisher is provided next to the main electrical panel.", "HIGH", "URGENT"),
  C("EFS_SAFETY", "FIRE", "Fire fighting", "F2.3", "Fire hydrant and sprinkler system are installed, charged and tested as per NBC where required.", "HIGH", "URGENT", { rule: { tiers: ["MADB", "Main Dealer Workshop", "Stand-Alone Accidental Workshop"] }, ref: "NBC 2016" }),
  C("EFS_SAFETY", "FIRE", "Detection", "F3.1", "Smoke or heat detection and fire alarm panel cover the workshop and showroom areas and are functional.", "HIGH", "URGENT"),
  C("EFS_SAFETY", "FIRE", "Emergency preparedness", "F4.1", "Emergency exits are unobstructed, signed with glow signage, and an evacuation plan and assembly point are displayed.", "CRITICAL", "IMPORTANT_URGENT"),
  C("EFS_SAFETY", "FIRE", "Emergency preparedness", "F4.2", "Mock fire drill has been conducted within the last 6 months with records.", "MEDIUM", "IMPORTANT"),
  C("EFS_SAFETY", "FIRE", "Fire prevention", "F5.1", "Flammable material, paint and diesel are stored in designated, ventilated areas away from ignition sources.", "CRITICAL", "IMPORTANT_URGENT", { rule: WORK }),
  C("EFS_SAFETY", "FIRE", "Fire prevention", "F5.2", "Battery charging area is ventilated, with no combustible material nearby.", "HIGH", "URGENT"),
  // ---- Electrical safety
  C("EFS_SAFETY", "ELECTRICAL", "Legal compliance", "E1.1", "Electrical inspection certificate / licence and the single-line diagram are available and displayed.", "CRITICAL", "IMPORTANT_URGENT", { ref: "CEA Regulations 2023" }),
  C("EFS_SAFETY", "ELECTRICAL", "Distribution", "E2.1", "Main LT panel is closed and labelled, with an insulating mat, shock-treatment chart and clear working space; no exposed live parts.", "CRITICAL", "IMPORTANT_URGENT"),
  C("EFS_SAFETY", "ELECTRICAL", "Distribution", "E2.2", "Distribution boards are closed and circuit-identified; no temporary joints or overloaded sockets.", "HIGH", "URGENT"),
  C("EFS_SAFETY", "ELECTRICAL", "Cabling", "E3.1", "Cables are properly dressed, glands and lugs are provided at terminations, and cable trays are used where required.", "HIGH", "URGENT"),
  C("EFS_SAFETY", "ELECTRICAL", "Earthing", "E4.1", "Highest measured earth-pit resistance is within the limit.", "CRITICAL", "IMPORTANT_URGENT", { type: "MEASUREMENT", unit: "ohm", max: 5, ref: "IS 3043" }),
  C("EFS_SAFETY", "ELECTRICAL", "Earthing", "E4.2", "Equipment and DG body and neutral have double earthing as per IS 3043.", "HIGH", "URGENT"),
  C("EFS_SAFETY", "ELECTRICAL", "Protection", "E5.1", "RCCB / ELCB is provided on final circuits and its trip time is within the limit.", "CRITICAL", "IMPORTANT_URGENT", { type: "MEASUREMENT", unit: "ms", max: 40, ref: "IS 12640" }),
  C("EFS_SAFETY", "ELECTRICAL", "Workshop equipment", "E6.1", "Air compressor, lifts, welding and washing equipment are earthed and electrically safe.", "HIGH", "URGENT", { rule: WORK }),
  C("EFS_SAFETY", "ELECTRICAL", "EV charging", "E7.1", "EV chargers are protected, labelled and isolated, with inspection reports available.", "HIGH", "URGENT", { rule: { requiresBev: true } }),
  C("EFS_SAFETY", "ELECTRICAL", "Illumination", "E8.1", "Lux level in the working area meets the standard and emergency lighting works.", "MEDIUM", "IMPORTANT", { type: "MEASUREMENT", unit: "lux", min: 200 }),
  C("EFS_SAFETY", "ELECTRICAL", "Incoming supply", "E9.1", "Transformer / RMU area is fenced, locked, signed and free from oil leakage.", "CRITICAL", "IMPORTANT_URGENT", { rule: { electricalSupplyTypes: ["HT supply", "HT + LT supply"] } }),
  // ---- Thermography
  C("THERMOGRAPHY", "THERMOGRAPHY", "Thermal scan", "T1.1", "Main LT panel scanned under load; hottest point rise above ambient is within the limit.", "CRITICAL", "IMPORTANT_URGENT", { type: "MEASUREMENT", unit: "°C rise", max: 15 }),
  C("THERMOGRAPHY", "THERMOGRAPHY", "Thermal scan", "T1.2", "Distribution boards and critical switchgear scanned with no loose-connection hotspot.", "HIGH", "URGENT", { type: "MEASUREMENT", unit: "°C rise", max: 15 }),
  C("THERMOGRAPHY", "THERMOGRAPHY", "Thermal scan", "T1.3", "APFC panel and capacitor banks scanned; no overheating or imbalance.", "HIGH", "URGENT", { type: "MEASUREMENT", unit: "°C rise", max: 15, rule: { tiers: ["MADB", "Main Dealer Workshop"] } }),
];

module.exports = { demoChecklistPack: pack.map((item, index) => ({ ...item, sortOrder: index + 1 })) };
