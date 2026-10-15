// Turns an audit job and its responses into the data the Word report template needs.
// `blank: true` produces the empty template: every field is a [placeholder] to complete in Word.
const fs = require("fs");
const path = require("path");
const { itemDiscipline, itemsInJobScope } = require("./auditScope");

// Order used everywhere: electrical, fire, infrastructure, thermography.
const DISCIPLINES = ["ELECTRICAL", "FIRE", "INFRASTRUCTURE", "THERMOGRAPHY"];
const LABEL = { ELECTRICAL: "Electrical Safety Audit", FIRE: "Fire Safety Audit", INFRASTRUCTURE: "Infrastructure Audit", THERMOGRAPHY: "Thermography Audit" };
const SHORT = { ELECTRICAL: "E", FIRE: "F", INFRASTRUCTURE: "I", THERMOGRAPHY: "T" };
const FILE_TAG = { ELECTRICAL: "ELEC", FIRE: "FIRE", INFRASTRUCTURE: "INFRA", THERMOGRAPHY: "THERMO" };
const FACILITY = { SHOWROOM: "SHOWROOM", WORKSHOP: "WORKSHOP", STOCKYARD: "STOCKYARD" };
const CLOSURE_DAYS = { IMPORTANT_URGENT: 14, URGENT: 42, IMPORTANT: 90, REST: 180 };

const ph = (label) => `[${label}]`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).replace(/ /g, "-") : "");
const short = (text, n = 110) => { const t = String(text || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const riskFor = (percent) => (percent === null || percent === undefined ? "—" : percent <= 25 ? "High Risk" : percent <= 75 ? "Medium Risk" : "Low Risk");
const typeFor = (severity) => (severity === "CRITICAL" ? "Critical" : severity === "HIGH" ? "Major" : "Minor");
const priorityFor = (severity) => (severity === "CRITICAL" ? "P1" : severity === "HIGH" ? "P2" : "P3");

// Accepts "ELECTRICAL", "ELECTRICAL,FIRE", or "ALL". Unknown names are ignored.
const parseScope = (raw) => {
  const text = String(raw || "ALL").toUpperCase();
  if (text === "ALL") return [...DISCIPLINES];
  const picked = text.split(",").map((s) => s.trim()).filter((s) => DISCIPLINES.includes(s));
  return DISCIPLINES.filter((d) => picked.includes(d));
};

// ---- images -------------------------------------------------------------------------------
const sniff = (buf) => {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: "jpg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { type: "jpg", width: 800, height: 600 };
  }
  return null; // WebP and others are not embedded; the report shows a placeholder instead
};

const loadImage = async (url) => {
  try {
    if (!url) return null;
    let buf;
    if (url.startsWith("data:")) { const m = /^data:[^;]+;base64,(.+)$/.exec(url); if (!m) return null; buf = Buffer.from(m[1], "base64"); }
    else if (/^https?:\/\//.test(url)) { const res = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!res.ok) return null; buf = Buffer.from(await res.arrayBuffer()); }
    else return null;
    const info = sniff(buf);
    return info ? { data: buf, ...info } : null;
  } catch { return null; }
};

const loadMany = async (urls) => {
  const out = new Map();
  const unique = [...new Set(urls.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 6) {
    const batch = unique.slice(i, i + 6);
    const loaded = await Promise.all(batch.map(loadImage));
    batch.forEach((u, k) => out.set(u, loaded[k]));
  }
  return out;
};

// ---- reference text per audit type --------------------------------------------------------
const ABBREVIATIONS = {
  ELECTRICAL: [["APFC", "Automatic Power Factor Controller"], ["CBCT", "Core Balancing Current Transformer"], ["DB", "Distribution Board"], ["ELR", "Earth Leakage Relay"], ["kVA", "Kilo Volt Ampere (Apparent Power)"], ["LT", "Low Tension"], ["NEC", "National Electrical Code"], ["PF", "Power Factor"], ["RCBO", "Residual Current Operated Circuit Breaker with Integral Over Current Protection"], ["RMS", "Root Mean Square"], ["SEB", "State Electricity Board"], ["THD", "Total Harmonic Distortion"], ["UPS", "Uninterrupted Power Supply"]],
  FIRE: [["FACP", "Fire Alarm Control Panel"], ["NBC", "National Building Code of India"], ["NOC", "No Objection Certificate"], ["MCP", "Manual Call Point"], ["ABC", "Multipurpose dry chemical powder (extinguisher class)"], ["CO2", "Carbon dioxide (extinguisher type)"]],
  INFRASTRUCTURE: [["OEM", "Original Equipment Manufacturer"], ["CI", "Corporate Identity"], ["SOP", "Standard Operating Procedure"], ["PPE", "Personal Protective Equipment"]],
  THERMOGRAPHY: [["IR", "Infrared"], ["ΔT", "Temperature rise above ambient or reference"], ["MCCB", "Moulded Case Circuit Breaker"]],
};
const EQUIPMENT = {
  ELECTRICAL: ["Power & Harmonics Analyzer - Chauvin Arnoux", "Kusam-Meco KM2709 Power Clamp Meter", "Clamp Earth Tester – HTC CE-8201", "Kusam-Meco Lux Meter"],
  FIRE: ["[Fire safety instrument / make / model / calibration due date]"],
  INFRASTRUCTURE: ["[Measuring instrument / make / model / calibration due date]"],
  THERMOGRAPHY: ["Flir C5 Thermal Imager"],
};
const STANDARDS = {
  ELECTRICAL: ["IEEE 1100 – 2005 IEEE Recommended Practice for Powering & Grounding Electronic Equipment", "IEEE 519 – 2014 IEEE Recommended Practices & Requirements for Harmonic Control in Electrical Power System", "IS 3043 – 1987 Indian Standard Code of Practice for Earthing", "National Building Code of India (NBC)", "CEA Regulations, 2023", "NEC 2023"],
  FIRE: ["National Building Code of India (NBC) – Part 4: Fire and Life Safety", "IS 2190 – Selection, installation and maintenance of first-aid fire extinguishers", "IS 3844 – Installation of internal fire hydrants in multi-storeyed buildings", "IS 15105 – Design and installation of fixed automatic sprinkler fire extinguishing systems", "IS 2189 – Installation of automatic fire detection and alarm systems"],
  INFRASTRUCTURE: ["National Building Code of India (NBC)", "[OEM infrastructure and facility guidelines referred]"],
  THERMOGRAPHY: ["ISO 18434-1 – Condition monitoring and diagnostics of machines: Thermography", "[Client or OEM thermography acceptance criteria referred]"],
};
const uniqPairs = (lists) => { const seen = new Set(); return lists.flat().filter(([a]) => (seen.has(a) ? false : seen.add(a))); };
const uniq = (lists) => [...new Set(lists.flat())];

const titleFor = (disciplines) => {
  if (disciplines.length === 1) return { title: `${LABEL[disciplines[0]].toUpperCase()} REPORT`, scopeLabel: LABEL[disciplines[0]], subtitle: "" };
  const all = disciplines.length === DISCIPLINES.length;
  return {
    title: all ? "COMBINED AUDIT REPORT" : "INTEGRATED AUDIT REPORT",
    scopeLabel: all ? "Combined Audit" : "Integrated Audit",
    subtitle: `Scope: ${disciplines.map((d) => LABEL[d].replace(" Audit", "")).join(" • ")}`,
  };
};

const sample = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));

// ---- main ---------------------------------------------------------------------------------
// Reports carry the SGS branding. Name, address and about text can be overridden from the environment.
const ASSETS = path.join(__dirname, "..", "assets");
const readAsset = (name) => { try { return fs.readFileSync(path.join(ASSETS, name)); } catch { return null; } };
const issuerFromEnv = () => {
  let about = [];
  try { about = JSON.parse(readAsset("sgs-about.json")?.toString() || "[]"); } catch { about = []; }
  if (process.env.REPORT_ISSUER_ABOUT) about = [{ text: process.env.REPORT_ISSUER_ABOUT, bullet: false }];
  const logoBuf = readAsset("sgs-logo.png");
  return {
    name: process.env.REPORT_ISSUER_NAME || "SGS India Private Limited",
    short: process.env.REPORT_ISSUER_SHORT || "SGS India Pvt. Ltd.",
    brand: process.env.REPORT_ISSUER_BRAND || "SGS",
    address: process.env.REPORT_ISSUER_ADDRESS || "Ecospace, Block 3A, 2nd Floor, East Wing Premises IIF/11, Rajarhat, New Town, Action Area II, Kolkata, West Bengal 700160",
    about,
    logo: logoBuf ? { type: "png", data: logoBuf, width: 447, height: 220 } : null,
  };
};

const buildReportData = async ({ report, disciplines, blank = false }) => {
  const issuer = issuerFromEnv();
  const { title, scopeLabel, subtitle } = titleFor(disciplines);
  const year = new Date().getFullYear();
  const base = { title, scopeLabel, subtitle, issuer, year, templateDate: "02.12.2023", disciplines };
  const abbreviations = uniqPairs(disciplines.map((d) => ABBREVIATIONS[d]));
  const equipment = uniq(disciplines.map((d) => EQUIPMENT[d]));
  const standards = uniq(disciplines.map((d) => STANDARDS[d]));
  const annexFlags = { earthLoop: disciplines.includes("ELECTRICAL"), powerQuality: disciplines.includes("ELECTRICAL"), thermography: disciplines.includes("THERMOGRAPHY"), fireRegister: disciplines.includes("FIRE") };

  if (blank || !report) {
    return {
      ...base, reportNo: ph("Report number"), visitDate: ph("DD-Month-YYYY"),
      client: { name: ph("Client company") },
      site: { sapCode: ph("SAP code"), parentCode: ph("Parent code"), locationCode: ph("Location code"), dealerName: ph("Dealership name"), address: ph("Address"), type: ph("Showroom / Workshop / Stockyard"), zone: ph("Zone"), regionalOffice: ph("Regional office"), state: ph("State"), city: ph("City / town") },
      control: { no: "00", date: ph("DD-MM-YYYY"), history: ph("Draft audit report"), preparedBy: ph("Name"), reviewedBy: ph("Name"), authorisedBy: ph("Name") },
      visit: { rows: [["Audit planned", ph("DD-Mon-YYYY")], ["Audit started", ph("DD-Mon-YYYY, HH:MM")], ["Audit completed", ph("DD-Mon-YYYY, HH:MM (duration)")], ["Synced on", ph("DD-Mon-YYYY, HH:MM")], ["Reviewed on", ph("DD-Mon-YYYY, HH:MM")], ["Approved on", ph("DD-Mon-YYYY, HH:MM")], ["Revision", ph("Revision 00")], ["Audit team", ph("Lead auditor, auditors")], ["GPS coordinates (check-in)", ph("Latitude, Longitude")], ["GPS accuracy / distance from site", ph("± m / m from site")]], facade: null, mapUrl: "" },
      keyObservations: [ph("Key audit observation 1"), ph("Key audit observation 2")],
      conclusion: ph("Overall conclusion of the audit"),
      overall: { percent: null, percentText: ph("Score %"), risk: ph("Risk level") },
      disciplineScores: disciplines.length > 1 ? disciplines.map((d) => ({ label: LABEL[d], percentText: ph("%"), risk: ph("Risk"), nc: ph("n") })) : [],
      criticalNc: false, criticalAreas: [ph("Area of critical non-compliance")],
      pictures: sample(4, (n) => ({ image: null, caption: ph(`Caption for photograph ${n}`) })),
      sections: disciplines.map((d) => ({ key: d, label: LABEL[d], categories: [{ name: ph("Section / category"), rows: sample(3, (n) => ({ sno: n, type: ph("Critical / Major / Minor"), question: ph("Checklist question"), code: "", document: ph("Document required"), level: "NA", observation: ph("Auditor's observation") })) }] })),
      actions: sample(3, (n) => ({ ref: ph("Q no."), observation: ph("Observation"), recommendation: ph("Recommendation"), priority: "P2", priorityLabel: "Priority 2", image: null, actionPlan: ph("Action plan"), responsibility: ph("Name"), targetDate: ph("Date"), status: "Open" })),
      annex: {
        earthLoop: annexFlags.earthLoop ? sample(4, (n) => [String(n), ph("Location"), ph("Equipment id"), ph("Ω"), ph("OK / NOT OK")]) : null,
        thermography: annexFlags.thermography ? sample(3, (n) => [String(n), ph("Area"), ph("Panel / asset"), { image: null }, ph("°C"), ph("Remarks")]) : null,
        powerQuality: annexFlags.powerQuality ? sample(3, (n) => [String(n), ph("Area"), ph("Parameter"), ph("Measured"), ph("Limit"), ph("Remark")]) : null,
        fireRegister: annexFlags.fireRegister ? sample(3, (n) => [String(n), ph("Equipment / system"), ph("Location"), ph("DD-MM-YYYY"), ph("DD-MM-YYYY"), ph("Status")]) : null,
      },
      abbreviations, equipment, standards,
    };
  }

  const job = report.job; const loc = job.location;
  const responses = new Map();
  for (const session of job.sessions) for (const r of session.responses || []) if (r.responseStatus === "SUBMITTED") responses.set(r.snapshotItemId, r);
  const inScope = itemsInJobScope(job.snapshot.items, job).filter((i) => disciplines.includes(itemDiscipline(i)));
  inScope.sort((a, b) => (a.moduleCode === b.moduleCode ? a.sortOrder - b.sortOrder : a.moduleCode.localeCompare(b.moduleCode)));

  // evidence images (capped so the document stays a sensible size)
  const ncItems = inScope.filter((i) => responses.get(i.id)?.result === "NON_COMPLIANT");
  const wanted = [];
  for (const item of ncItems) for (const e of (responses.get(item.id).evidence || []).slice(0, 2)) wanted.push(e.imageUrl);
  for (const item of inScope.filter((i) => itemDiscipline(i) === "THERMOGRAPHY" && i.itemData.responseType === "MEASUREMENT")) for (const e of (responses.get(item.id)?.evidence || []).slice(0, 1)) wanted.push(e.imageUrl);
  const firstSession = [...job.sessions].sort((a, b) => new Date(a.checkedInAt) - new Date(b.checkedInAt))[0] || null;
  if (firstSession?.checkInEvidenceUrl) wanted.push(firstSession.checkInEvidenceUrl);
  const images = await loadMany(wanted.slice(0, 49));
  const firstImage = (resp) => { for (const e of resp?.evidence || []) { const img = images.get(e.imageUrl); if (img) return img; } return null; };

  // scoring for exactly this scope (same rules as the QC score)
  const score = (items) => {
    let earned = 0; let possible = 0; let nc = 0;
    for (const item of items) {
      const r = responses.get(item.id); if (!r || r.result === "NA") continue;
      const weight = Number(item.itemData?.weight || 1); possible += weight;
      if (r.result === "COMPLIANT") earned += weight;
      else if (r.result === "NON_COMPLIANT") { nc += 1; if (r.closedOnSpot) earned += weight * 0.5; }
    }
    const percent = possible ? Math.round((earned / possible) * 1000) / 10 : null;
    return { percent, nc, answered: items.filter((i) => responses.get(i.id)).length };
  };
  const overallScore = score(inScope);
  const disciplineScores = disciplines.map((d) => { const s = score(inScope.filter((i) => itemDiscipline(i) === d)); return { label: LABEL[d], percentText: s.percent === null ? "—" : `${s.percent}%`, risk: riskFor(s.percent), nc: s.nc }; });

  // check sheets
  const sections = disciplines.map((d) => {
    const items = inScope.filter((i) => itemDiscipline(i) === d);
    const categories = []; let sno = 0;
    for (const item of items) {
      const r = responses.get(item.id); const data = item.itemData || {};
      const name = item.sectionName || "General";
      let cat = categories.find((c) => c.name === name); if (!cat) { cat = { name, rows: [] }; categories.push(cat); }
      sno += 1;
      const level = !r ? "—" : r.result === "COMPLIANT" ? "3" : r.result === "NON_COMPLIANT" ? "0" : "NA";
      const observation = r?.observation || (r?.result === "COMPLIANT" ? "Found compliant." : r?.result === "NA" ? r.naReason || "Not applicable." : r ? "—" : "Not assessed.");
      cat.rows.push({ sno, type: typeFor(data.severityOnFail), question: data.questionText || item.questionCode, code: item.questionCode, document: data.regulationRef || data.expectedCondition || "—", level, observation: r?.measurementValue !== null && r?.measurementValue !== undefined ? `${observation} (Measured: ${r.measurementValue}${data.measurementUnit ? ` ${data.measurementUnit}` : ""})` : observation });
    }
    return { key: d, label: LABEL[d], categories, items };
  });

  // actions and pictures from the non-compliances
  const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const ncSorted = [...ncItems].sort((a, b) => (sevRank[a.itemData?.severityOnFail] ?? 2) - (sevRank[b.itemData?.severityOnFail] ?? 2));
  const snoOf = new Map(); sections.forEach((s) => s.categories.forEach((c) => c.rows.forEach((row) => snoOf.set(row.code, row.sno))));
  const refFor = (item) => `${disciplines.length > 1 ? `${SHORT[itemDiscipline(item)]} ` : ""}${snoOf.get(item.questionCode) ?? ""}`;
  const actions = ncSorted.map((item) => {
    const r = responses.get(item.id); const data = item.itemData || {}; const p = priorityFor(data.severityOnFail);
    const nc = r.nonCompliance;
    const days = CLOSURE_DAYS[data.mahindraPriority] || 90;
    const target = r.targetDate || nc?.targetDate;
    return { ref: refFor(item), observation: r.observation || nc?.observation || data.questionText, recommendation: r.recommendation || nc?.recommendation || ph("Recommendation"), priority: p, priorityLabel: `Priority ${p.slice(1)}`, image: firstImage(r), actionPlan: nc?.correctiveAction || ph("Action plan"), responsibility: r.responsiblePerson || nc?.responsiblePerson || ph("Responsible person"), targetDate: target ? fmtDate(target) : `Within ${days} days`, status: nc?.status === "CLOSED" ? "Close" : "Open" };
  });
  const pictures = [];
  // The first photograph is always the site front facade, taken by the auditor at check-in.
  const facade = firstSession?.checkInEvidenceUrl ? images.get(firstSession.checkInEvidenceUrl) || null : null;
  if (firstSession) pictures.push({ image: facade, caption: "Site front facade (check-in photograph)" });
  for (const item of ncSorted) {
    const r = responses.get(item.id);
    for (const e of (r.evidence || []).slice(0, 2)) { pictures.push({ image: images.get(e.imageUrl) || null, caption: short(r.observation || item.itemData?.questionText) }); if (pictures.length >= 25) break; }
    if (pictures.length >= 25) break;
  }
  if (!pictures.length) pictures.push(...sample(2, (n) => ({ image: null, caption: ph(`Caption for photograph ${n}`) })));

  const critical = ncSorted.filter((i) => i.itemData?.severityOnFail === "CRITICAL");
  const keyObservations = ncSorted.slice(0, 15).map((i) => short(responses.get(i.id).observation || i.itemData?.questionText, 160));
  const completion = job.sessions.find((s) => s.completion)?.completion;
  const counts = { compliant: inScope.filter((i) => responses.get(i.id)?.result === "COMPLIANT").length, na: inScope.filter((i) => responses.get(i.id)?.result === "NA").length };
  const applicable = counts.compliant + overallScore.nc;
  const conclusion = [
    applicable ? `${counts.compliant} of ${applicable} applicable requirements were found compliant (${overallScore.percent ?? "—"}%), with ${overallScore.nc} non-compliance${overallScore.nc === 1 ? "" : "s"}${critical.length ? `, of which ${critical.length} ${critical.length === 1 ? "is" : "are"} critical` : ""}.` : "The assessment is not yet complete.",
    completion?.finalRemarks ? `Auditor's remarks: ${completion.finalRemarks}` : "",
  ].filter(Boolean).join(" ");

  // measurement annexures from checklist measurements
  const measured = (d, test) => sections.find((s) => s.key === d)?.items.filter((i) => i.itemData?.responseType === "MEASUREMENT" && test(i.itemData) && responses.get(i.id)) || [];
  const earthItems = measured("ELECTRICAL", (x) => /ohm|Ω/i.test(x.measurementUnit || ""));
  const thermoItems = measured("THERMOGRAPHY", () => true);
  const annex = {
    earthLoop: annexFlags.earthLoop ? (earthItems.length ? earthItems.map((i, n) => { const r = responses.get(i.id); return [String(n + 1), i.sectionName, short(i.itemData.questionText, 70), String(r.measurementValue ?? "—"), r.result === "COMPLIANT" ? `OK (limit ${i.itemData.maximumValue ?? "—"} Ω)` : "NOT OK"]; }) : sample(4, (n) => [String(n), ph("Location"), ph("Equipment id"), ph("Ω"), ph("OK / NOT OK")])) : null,
    thermography: annexFlags.thermography ? (thermoItems.length ? thermoItems.map((i, n) => { const r = responses.get(i.id); return [String(n + 1), i.sectionName, short(i.itemData.questionText, 80), { image: firstImage(r) }, r.measurementValue !== null && r.measurementValue !== undefined ? `${r.measurementValue}${i.itemData.measurementUnit ? ` ${i.itemData.measurementUnit}` : ""}` : "—", r.observation || (r.result === "COMPLIANT" ? "The temperature is well within limit." : "Further inspection recommended.")]; }) : sample(3, (n) => [String(n), ph("Area"), ph("Panel / asset"), { image: null }, ph("°C"), ph("Remarks")])) : null,
    powerQuality: annexFlags.powerQuality ? sample(3, (n) => [String(n), ph("Area"), ph("Parameter"), ph("Measured"), ph("Limit"), ph("Remark")]) : null,
    fireRegister: annexFlags.fireRegister ? sample(3, (n) => [String(n), ph("Equipment / system"), ph("Location"), ph("DD-MM-YYYY"), ph("DD-MM-YYYY"), ph("Status")]) : null,
  };

  const when = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—");
  const time = (d) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—");
  const endedAt = firstSession?.completion?.completedAt || firstSession?.endedAt;
  const minutes = firstSession && endedAt ? Math.max(1, Math.round((new Date(endedAt) - new Date(firstSession.checkedInAt)) / 60000)) : null;
  const gps = firstSession ? `${firstSession.checkInLatitude.toFixed(6)}° ${firstSession.checkInLatitude >= 0 ? "N" : "S"}, ${firstSession.checkInLongitude.toFixed(6)}° ${firstSession.checkInLongitude >= 0 ? "E" : "W"}` : "—";
  const team = job.assignments.map((a) => `${a.auditor.fullName}${a.assignmentRole === "LEAD" ? " (Lead)" : ""}`).join(", ");
  const dateOnly = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
  const hist = (...actions) => (report.history || []).find((h) => actions.includes(h.action))?.createdAt || null;
  const opened = (report.history || []).filter((h) => h.action === "REVISION_OPENED").length;
  const visit = {
    rows: [
      ["Audit planned", dateOnly(job.scheduledStart)],
      ["Audit started", firstSession ? when(firstSession.checkedInAt) : "Not started"],
      ["Audit completed", endedAt ? `${when(endedAt)}${minutes ? ` (${minutes} min)` : ""}` : firstSession ? "In progress" : "—"],
      ["Synced on", when(hist("SUBMIT") || firstSession?.completion?.completedAt || report.generatedAt)],
      ["Reviewed on", hist("CORRECTION_RAISED", "APPROVE") ? when(hist("CORRECTION_RAISED", "APPROVE")) : "Review pending"],
      ["Approved on", report.approvedAt ? when(report.approvedAt) : "Not yet approved"],
      ["Revision", `Revision ${String(Math.max(0, (report.revision || 1) - 1)).padStart(2, "0")}${opened ? ` · ${opened} revision${opened === 1 ? "" : "s"} opened after issue` : ""}`],
      ["Audit team", team || "—"],
      ["GPS coordinates (check-in)", gps],
      ["GPS accuracy / distance from site", firstSession ? `± ${Math.round(firstSession.gpsAccuracy)} m  /  ${Math.round(firstSession.distanceFromSiteM)} m from the site (geofence ${loc.geofenceRadiusM || "—"} m)` : "—"],
    ],
    facade, mapUrl: firstSession ? `https://www.google.com/maps?q=${firstSession.checkInLatitude},${firstSession.checkInLongitude}` : "",
  };
  const lead = job.assignments.find((a) => a.assignmentRole === "LEAD") || job.assignments[0];
  const tag = disciplines.length === DISCIPLINES.length ? "ALL" : disciplines.map((d) => FILE_TAG[d]).join("-");
  const visitDate = job.sessions.map((s) => s.checkedInAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || job.scheduledStart;
  return {
    ...base,
    reportNo: `${report.reportNumber}/${tag}`, visitDate: fmtDate(visitDate), fileTag: tag, revisionTag: `_Rev${String(Math.max(0, (report.revision || 1) - 1)).padStart(2, "0")}`,
    client: { name: loc.programme?.company?.companyName || ph("Client company") },
    site: { sapCode: loc.sapCode || "NA", parentCode: loc.parentCode || "NA", locationCode: loc.locationCode || "NA", dealerName: loc.dealerName, address: loc.address || loc.locationName, type: FACILITY[job.facilityType] || "SITE", zone: String(loc.zone || "").toUpperCase(), regionalOffice: String(loc.regionalOffice || "").toUpperCase(), state: String(loc.state || "").toUpperCase(), city: String(loc.city || loc.locationName || "").toUpperCase() },
    control: { no: String(Math.max(0, (report.revision || 1) - 1)).padStart(2, "0"), date: fmtDate(new Date()), history: ["PUBLISHED", "SIGNED_OFF"].includes(report.status) ? "Final audit report" : "Draft audit report", preparedBy: lead?.auditor?.fullName || ph("Name"), reviewedBy: ph("Name"), authorisedBy: ph("Name") },
    visit, keyObservations, conclusion,
    overall: { percent: overallScore.percent, percentText: overallScore.percent === null ? "—" : `${overallScore.percent}%`, risk: riskFor(overallScore.percent) },
    disciplineScores: disciplines.length > 1 ? disciplineScores : [],
    criticalNc: critical.length > 0, criticalAreas: critical.slice(0, 10).map((i) => short(responses.get(i.id).observation || i.itemData?.questionText, 160)),
    pictures, sections, actions, annex, abbreviations, equipment, standards,
  };
};

// What is loaded to build (and to freeze) a report.
const fullInclude = {
  history: { orderBy: { createdAt: "asc" } },
  job: { include: {
    location: { include: { programme: { include: { company: { select: { companyName: true } } } } } },
    snapshot: { include: { items: true } },
    assignments: { include: { auditor: { select: { id: true, fullName: true } } } },
    sessions: { include: { completion: true, responses: { include: { evidence: { orderBy: { createdAt: "asc" } }, nonCompliance: true } } } },
  } },
};

module.exports = { fullInclude, DISCIPLINES, LABEL, FILE_TAG, parseScope, buildReportData };
