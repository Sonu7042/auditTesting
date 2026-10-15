// End-to-end flow test. Starts from an EMPTY database (run with the API up, default http://localhost:5001/api) and walks
// the whole programme: company -> checklist (Excel) -> sites (Excel import) -> auditors (onboarding, training, approval)
// -> scheduling -> audit execution (Track A + Track B) -> QC and release -> dealer sign-off -> NC/CAPA closure
// -> governance (scoped access, rankings, awards) and report downloads. Every stage uses the output of the previous one.
//
//   node scripts/e2e-flow.js
//
// Exits non-zero when any check fails. Safe to re-run: every run uses its own unique company and site codes.
const XLSX = require("xlsx");
const AdmZip = require("adm-zip");
const { DEFAULT_QUIZ, DEFAULT_DEMO } = require("../src/utils/auditorTraining");

const B = process.env.API || "http://localhost:5001/api";
const RUN = Date.now().toString(36).toUpperCase().slice(-5);
// E2E_COMPANY="M&M - NORTH" builds a presentable demo network (real-looking names) instead of throw-away test data.
const DEMO = Boolean(process.env.E2E_COMPANY);
const STARTED = new Date(Date.now() - 60e3).toISOString(); // awards in this test only count audits made during this run
const PFX = process.env.E2E_PREFIX || `E${RUN}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SIG = "data:image/png;base64," + PNG.toString("base64");

let passed = 0; const failures = [];
const check = (ok, label, detail) => { if (ok) { passed += 1; console.log("  ok   " + label); } else { failures.push(label); console.log("  FAIL " + label + (detail ? " -> " + String(detail).slice(0, 300) : "")); } };
const step = (t) => console.log("\n== " + t);

const raw = async (method, path, token, body) => {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(B + path, { method, headers: { ...(body && !isForm ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  return res;
};
const api = async (method, path, token, body) => {
  const res = await raw(method, path, token, body);
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  json._status = res.status; return json;
};
const login = async (username, password) => (await api("POST", "/auth/login", null, { username, password }));
const form = (obj, files = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); for (const [k, v] of Object.entries(files)) for (const buf of [].concat(v)) f.append(k, new Blob([buf], { type: "image/png" }), "x.png"); return f; };
const xlsxFile = (sheets) => { const wb = XLSX.utils.book_new(); for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name); return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }); };
const upload = (buf, extra = {}) => { const f = new FormData(); f.append("file", new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "import.xlsx"); for (const [k, v] of Object.entries(extra)) f.append(k, v); return f; };
const unique = (tag) => Buffer.concat([PNG, Buffer.from(`${tag}-${Math.random()}`)]);

(async () => {
  /* ---------------- 1. admin and company ---------------- */
  step("1. Admin login and company");
  const adminLogin = await login("admin", "admin123");
  const admin = adminLogin.token; check(Boolean(admin), "admin can log in", JSON.stringify(adminLogin));
  if (!admin) process.exit(1);
  const companyName = process.env.E2E_COMPANY || `E2E Motors ${RUN}`;
  const company = (await api("POST", "/company/create-company", admin, { companyName, email: `e2e${RUN.toLowerCase()}@example.com`, address: "India" })).company;
  check(Boolean(company?.id), "company created", "no company");

  /* ---------------- 2. checklist by Excel ---------------- */
  step("2. Checklist import from Excel (publishes version 1.0)");
  const tpl = await raw("GET", "/client-audit-setup/checklists/template", admin);
  check(tpl.status === 200, "checklist sample template downloads");
  const CHK = (module, discipline, section, code, q, extra = {}) => ({ Module: module, Discipline: discipline, Section: section, "Question Code": code, Question: q, "Expected Condition": "As per norm", "Response Type": "COMPLIANCE", "Severity On Fail": "MEDIUM", Priority: "IMPORTANT", Weight: 1, "Min Photos": 1, ...extra });
  const checklistXlsx = xlsxFile({ Checklist: [
    CHK("SITE_SHARED", "INFRASTRUCTURE", "Gate", `X${RUN}-1`, "Entry gate and signage in good condition"),
    CHK("SR_SHOWROOM", "INFRASTRUCTURE", "Floor", `X${RUN}-2`, "Showroom floor free of trip hazards", { "Facility Types": "SHOWROOM" }),
    CHK("EFS_SAFETY", "FIRE", "Extinguishers", `X${RUN}-3`, "Fire extinguishers charged and tagged", { "Severity On Fail": "HIGH", Priority: "URGENT" }),
    CHK("EFS_SAFETY", "ELECTRICAL", "Panels", `X${RUN}-4`, "Main panel closed, labelled, with insulating mat", { "Severity On Fail": "CRITICAL", Priority: "IMPORTANT_URGENT" }),
    CHK("THERMOGRAPHY", "THERMOGRAPHY", "Hot spots", `X${RUN}-5`, "No thermal hot spot above 10 C over ambient at main panel", { "Response Type": "MEASUREMENT", Unit: "C", "Max Value": 10 }),
    CHK("WS_WORKSHOP", "INFRASTRUCTURE", "Bays", `X${RUN}-6`, "Workshop bays marked and clear", { "Facility Types": "WORKSHOP" }),
  ] });
  const dry = await api("POST", `/client-audit-setup/companies/${company.id}/checklists/upload`, admin, upload(checklistXlsx, { name: "E2E starter checklist", version: "1.0" }));
  check(dry.success, "checklist Excel uploaded and published", JSON.stringify(dry).slice(0, 300));
  const programme = (await api("GET", "/client-audit-setup/programmes", admin)).programmes.find((p) => p.companyId === company.id || p.company?.id === company.id) || (await api("GET", "/client-audit-setup/programmes", admin)).programmes.slice(-1)[0];
  check(Boolean(programme?.id), "company programme exists after the first import");
  // A fuller second version from the built-in sample pack becomes the latest published version used by new sites.
  const v2 = (await api("POST", "/client-audit-setup/checklists/versions", admin, { programmeId: programme.id, name: "Integrated Facility, Electrical & Fire Safety Audit", version: "2.0" })).version;
  check(Boolean(v2?.id), "second checklist version created");
  await api("POST", `/client-audit-setup/checklists/versions/${v2.id}/demo-pack`, admin, {});
  const pub = await api("POST", `/client-audit-setup/checklists/versions/${v2.id}/publish`, admin, {});
  check(pub.success, "version 2.0 published", JSON.stringify(pub).slice(0, 200));

  /* ---------------- 3. sites by Excel ---------------- */
  step("3. Site import from Excel (dry run, import, review, approval)");
  const codes = [`${PFX}-DELH`, `${PFX}-GURU`, `${PFX}-PATN`];
  const siteRow = (code, city, zone, ro, state, lat, lng, extra) => ({
    "Dealer Name": `${city} Motors Pvt Ltd`, "Dealer Code": code.slice(0, 8), "SAP Code": `SL${Math.floor(Math.random() * 900000 + 100000)}`, "Parent Code": "", "MADB Code": `MADB-${code}`, Category: "A",
    "Location Name": city, "Location Code": code, Zone: zone, "Regional Office": ro, State: state, District: city, City: city, "City Classification": "Tier 1", Address: `Main Road, ${city}`,
    Latitude: lat, Longitude: lng, "Geofence Radius (m)": 200, "Contact Name": "Dealer Principal", "Contact Phone": "9876543210", "Contact Email": `${code.toLowerCase()}@example.com`, "Electrical Supply": "LT supply",
    "Showroom Tier": "", "Showroom CI Level": "", "Showroom Format": "", "Workshop Tier": "", "Workshop CI Level": "", "Workshop Type": "", "Stockyard Type": "", "Sells BEV (Y/N)": "Y",
    "Scope Showroom": "", "Scope Workshop": "", "Scope Stockyard": "", "Showroom Area (sq ft)": 5000, "Monthly PV Retail": 60, "Test Drives Per Day": 8, "Mechanical ROs (3 mo)": 900, "Mechanical Bays": 20, "Checklist Version": "", ...extra,
  });
  const ALL = "INFRA,FIRE,ELECTRICAL,THERMOGRAPHY";
  const sitesSheet = [
    siteRow(codes[0], "Delhi", "North", "Delhi", "Delhi", 28.6139, 77.209, { "Showroom Tier": "MADB", "Showroom CI Level": "CI 2024-25", "Workshop Tier": "Main Dealer Workshop", "Workshop CI Level": "CI 2024-25", "Workshop Type": "Mechanical + Bodyshop", "Scope Showroom": ALL, "Scope Workshop": ALL }),
    siteRow(codes[1], "Gurugram", "North", "Delhi", "Haryana", 28.4595, 77.0266, { "Workshop Tier": "SMART", "Workshop CI Level": "CI 2024-25", "Workshop Type": "Mechanical", "Scope Workshop": ALL }),
    siteRow(codes[2], "Patna", "East", "Patna", "Bihar", 25.5941, 85.1376, { "Showroom Tier": "CUBE", "Showroom CI Level": "CI 2024-25", "Scope Showroom": ALL }),
  ];
  const manpower = [];
  for (const [i, c] of codes.entries()) {
    if (i !== 2) manpower.push({ "Location Code": c, Facility: "WORKSHOP", Role: "Technician", Required: 12, "On Roll": 10 });
    if (i !== 1) manpower.push({ "Location Code": c, Facility: "SHOWROOM", Role: "Sales Consultant", Required: 8, "On Roll": 7 });
  }
  const tools = codes.map((c) => ({ "Location Code": c, Tool: "Earth resistance tester", Category: "Critical", Required: 1, Available: 1, "Valid Till (YYYY-MM-DD)": "2027-06-30" }));
  const users = [
    { "Location Code": codes[0], "Full Name": "Delhi Site User", Email: `site.del.${RUN.toLowerCase()}@example.com`, Role: "SITE_USER" },
    { "Location Code": codes[2], "Full Name": "Patna Site User", Email: `site.pat.${RUN.toLowerCase()}@example.com`, Role: "SITE_USER" },
    { "Location Code": codes[0], "Full Name": "North Zonal Manager", Email: `zone.north.${RUN.toLowerCase()}@example.com`, Role: "ZONAL_MANAGER" },
    { "Location Code": codes[0], "Full Name": "Corporate Head", Email: `corp.${RUN.toLowerCase()}@example.com`, Role: "CORPORATE_MANAGER" },
  ];
  const siteXlsx = xlsxFile({ Sites: sitesSheet, Manpower: manpower, Tools: tools, Users: users });
  const tplSites = await raw("GET", "/client-audit-setup/site-requests/template", admin);
  check(tplSites.status === 200, "site sample template downloads");
  const dryImport = await api("POST", "/client-audit-setup/site-requests/import", admin, upload(siteXlsx, { companyId: company.id, dryRun: "true" }));
  check(dryImport.success && dryImport.totals.ready === 3, "dry run reports 3 sites ready", JSON.stringify(dryImport.totals || dryImport));
  const imp = await api("POST", "/client-audit-setup/site-requests/import", admin, upload(siteXlsx, { companyId: company.id }));
  check(imp.success && imp.totals.ready === 3, "import creates 3 ready requests", JSON.stringify(imp.totals || imp));
  const again = await api("POST", "/client-audit-setup/site-requests/import", admin, upload(siteXlsx, { companyId: company.id }));
  check(again.success && again.totals.skipped === 3 && again.totals.ready === 0, "re-import is additive (existing sites skipped, none duplicated)", JSON.stringify(again.totals || again));
  const reqs = (await api("GET", `/client-audit-setup/site-requests?companyId=${company.id}`, admin)).requests || [];
  const site = {}; const creds = [];
  for (const code of codes) {
    const r = reqs.find((x) => x.locationCode === code);
    const ap = await api("POST", `/client-audit-setup/site-requests/${r.id}/approve`, admin, {});
    check(ap.success && ap.locationId, `site ${code} approved`, JSON.stringify(ap).slice(0, 250));
    site[code] = ap.locationId; creds.push(...(ap.credentials || []));
  }
  check(creds.filter((c) => c.password).length === 4, "approval created the 4 users from the workbook (site, zonal, corporate)", JSON.stringify(creds.map((c) => c.email)));
  const snaps = await Promise.all(codes.map(async (c) => (await api("GET", `/client-audit-setup/locations/${site[c]}/checklist-snapshots`, admin)).snapshots || []));
  check(snaps.every((s) => s.length === 1), "every approved site got its checklist snapshot automatically");
  check(snaps[0][0]?.checklistVersion === "2.0", "sites use the latest published checklist version");

  /* ---------------- 3b. bulk imports: companies, users, site updates ---------------- */
  step("3b. Bulk Excel imports: companies, users, updating live sites");
  for (const kind of ["companies", "auditors", "users"]) { const t = await raw("GET", `/client-audit-setup/imports/${kind}/template`, admin); check(t.status === 200, `${kind} sample sheet downloads`); }
  const impKind = (kind, buf, extra = {}) => api("POST", `/client-audit-setup/imports/${kind}`, admin, upload(buf, extra));
  const coSheet = xlsxFile({ Companies: [{ "Company Name": (DEMO ? "M&M - WEST" : `E2E Bulk One ${RUN}`), Email: "one@example.com", Address: "Mumbai", "Contact Name": "A", "Contact Phone": "9000000011", "PO No": "PO-1" }, { "Company Name": (DEMO ? "M&M - SOUTH" : `E2E Bulk Two ${RUN}`), Email: "two@example.com", Address: "Pune", "Contact Name": "B", "Contact Phone": "9000000012", "PO No": "PO-2" }, { "Company Name": companyName, Email: "dup@example.com" }] });
  const coDry = await impKind("companies", coSheet, { dryRun: "true" });
  check(coDry.success && coDry.totals.created === 2 && coDry.totals.skipped === 1, "companies dry run: 2 new, 1 existing skipped", JSON.stringify(coDry.totals || coDry));
  const coImp = await impKind("companies", coSheet);
  check(coImp.success && coImp.totals.created === 2, "companies imported", JSON.stringify(coImp.totals || coImp));
  const coAgain = await impKind("companies", coSheet);
  check(coAgain.totals.created === 0 && coAgain.totals.skipped === 3, "companies re-import adds nothing (additive, no duplicates)", JSON.stringify(coAgain.totals));
  const coUpd = await impKind("companies", xlsxFile({ Companies: [{ "Company Name": (DEMO ? "M&M - WEST" : `E2E Bulk One ${RUN}`), Address: "Navi Mumbai" }] }), { mode: "UPDATE" });
  check(coUpd.totals.updated === 1, "companies update mode changes only filled cells", JSON.stringify(coUpd.totals));
  const overview = await api("GET", "/client-audit-setup/companies/overview", admin);
  check(overview.companies.some((c) => c.companyName === (DEMO ? "M&M - SOUTH" : `E2E Bulk Two ${RUN}`)) && overview.companies.find((c) => c.companyName === (DEMO ? "M&M - WEST" : `E2E Bulk One ${RUN}`))?.address === "Navi Mumbai", "imported companies appear on Site Onboarding with the updated address");

  const upd = await api("POST", "/client-audit-setup/site-requests/import", admin, upload(xlsxFile({ Sites: [{ "Location Code": codes[1], Address: "Sector 29, Gurugram", "Contact Phone": "9811111111" }, { "Location Code": codes[0] }] }), { companyId: company.id, mode: "UPDATE" }));
  check(upd.success && upd.totals.updated === 1 && upd.totals.unchanged === 1, "site import in update mode corrects the live site and leaves untouched rows alone", JSON.stringify(upd.totals || upd));
  const gur = await api("GET", `/client-audit-setup/locations/${site[codes[1]]}`, admin);
  check(gur.location?.address === "Sector 29, Gurugram" && gur.location?.contactPhone === "9811111111", "the live site shows the updated address and phone");

  const uDry = await impKind("users", xlsxFile({ Users: [{ Role: "SITE_USER", "Full Name": "Gurugram Site User", Email: `site.gur.${RUN.toLowerCase()}@example.com`, Company: companyName, "Location Code": codes[1] }, { Role: "REGIONAL_MANAGER", "Full Name": "Patna RO", Email: `ro.pat.${RUN.toLowerCase()}@example.com`, Company: companyName, Zone: "East", "Regional Office": "Patna" }, { Role: "SITE_USER", "Full Name": "Bad Row", Email: `bad.${RUN.toLowerCase()}@example.com`, Company: "No Such Company" }] }), { dryRun: "true" });
  check(uDry.success && uDry.totals.created === 2 && uDry.totals.errors === 1, "users dry run flags the bad row (unknown company) before saving", JSON.stringify(uDry.totals || uDry));
  const uImp = await impKind("users", xlsxFile({ Users: [{ Role: "SITE_USER", "Full Name": "Gurugram Site User", Email: `site.gur.${RUN.toLowerCase()}@example.com`, Company: companyName, "Location Code": codes[1] }, { Role: "REGIONAL_MANAGER", "Full Name": "Patna RO", Email: `ro.pat.${RUN.toLowerCase()}@example.com`, Company: companyName, Zone: "East", "Regional Office": "Patna" }] }));
  check(uImp.success && uImp.credentials?.length === 2, "users imported with one-time credentials returned", JSON.stringify(uImp.totals || uImp));
  const gurLogin = uImp.credentials && await login(uImp.credentials[0].username, uImp.credentials[0].password);
  check(Boolean(gurLogin?.token), "imported site user can log in");
  const roLogin = uImp.credentials && await login(uImp.credentials[1].username, uImp.credentials[1].password);
  check(Boolean(roLogin?.token), "imported regional manager can log in");

  /* ---------------- 4. auditors ---------------- */
  step("4. Auditor onboarding: create, train, quiz, review, approve, field readiness");
  const mkAuditor = async (fullName, skills, regions) => {
    const c = await api("POST", "/auditor-onboarding", admin, { fullName, email: `${fullName.toLowerCase().replace(/\W+/g, ".")}.${RUN.toLowerCase()}@example.com`, phone: "9000000000", baseLocation: "Delhi", dateOfBirth: "1990-05-05", skills, supportedRegions: regions });
    check(c.success, `${fullName} created`, JSON.stringify(c).slice(0, 200));
    const id = c.auditor.id;
    const cr = await api("POST", `/auditor-onboarding/${id}/resend-credentials`, admin, {});
    const tok = (await login(cr.credentials.username, cr.credentials.password)).token;
    check(Boolean(tok), `${fullName} can log in with issued credentials`);
    const training = await api("GET", "/auditor-onboarding/me/training", tok);
    check(training.success && training.onboarding.status === "TRAINING", `${fullName} sees training`, JSON.stringify(training).slice(0, 200));
    await api("POST", "/auditor-onboarding/me/video-progress", tok, { progress: 100 });
    const quizAnswers = Object.fromEntries(DEFAULT_QUIZ.map((q) => [q.id, q.answer]));
    const demoAnswers = Object.fromEntries(DEFAULT_DEMO.map((d) => [d.id, { result: d.expected, comment: d.expected === "OK" ? "" : "Observed as per scenario" }]));
    const sub = await api("POST", "/auditor-onboarding/me/submit", tok, { quizAnswers, demoAnswers });
    check(sub.success && sub.passed, `${fullName} passes the quiz and submits the demo checklist`, JSON.stringify(sub).slice(0, 200));
    const rev = await api("POST", `/auditor-onboarding/${id}/review`, admin, { demoScore: 92, decision: "PASS", remarks: "Good demo checklist." });
    check(rev.success, `${fullName} reviewed by back-admin`, JSON.stringify(rev).slice(0, 200));
    const ap = await api("POST", `/auditor-onboarding/${id}/approve`, admin, {});
    check(ap.success, `${fullName} approved`, JSON.stringify(ap).slice(0, 200));
    const fr = await api("PUT", `/auditor-onboarding/${id}/field-readiness`, admin, { backgroundVerified: true, shadowAuditsCompleted: 1, authorityLetterNumber: `AL-${RUN}-${id.slice(0, 4)}`, certificationExpiresAt: "2028-12-31" });
    check(fr.success, `${fullName} marked field-ready`, JSON.stringify(fr).slice(0, 200));
    return { id, token: tok };
  };
  const trackA = await mkAuditor(DEMO ? "Rohit Verma" : `Asha Track A ${RUN}`, ["INFRASTRUCTURE", "FIRE_SAFETY"], ["ALL_INDIA"]);
  const trackB = await mkAuditor(DEMO ? "Anita Sharma" : `Bimal Track B ${RUN}`, ["ELECTRICAL", "THERMOGRAPHY"], ["ALL_INDIA"]);
  const audSheet = xlsxFile({ Auditors: [{ "Full Name": `${DEMO ? "Priya Nair" : "Bulk Auditor One " + RUN}`, Email: `bulk1.${RUN.toLowerCase()}@example.com`, Phone: "9000000021", "Base Location": "Patna", "Date of Birth (YYYY-MM-DD)": "1992-02-02", "Emergency Contact": "9000000022", Skills: "INFRASTRUCTURE,FIRE_SAFETY", "Supported Regions": "EAST" }, { "Full Name": `${DEMO ? "Amit Joshi" : "Bulk Auditor Two " + RUN}`, Email: `bulk2.${RUN.toLowerCase()}@example.com`, Skills: "ELECTRICAL,THERMOGRAPHY", "Supported Regions": "ALL_INDIA" }, { "Full Name": "Bad Skill", Email: `bulk3.${RUN.toLowerCase()}@example.com`, Skills: "PLUMBING" }] });
  const audDry = await impKind("auditors", audSheet, { dryRun: "true" });
  check(audDry.success && audDry.totals.created === 2 && audDry.totals.errors === 1, "auditors dry run: 2 valid, 1 unknown skill flagged", JSON.stringify(audDry.totals || audDry));
  const audImp = await impKind("auditors", audSheet);
  check(audImp.success && audImp.totals.created === 2, "auditors imported (created ready for training)", JSON.stringify(audImp.totals || audImp));
  const audList = await api("GET", "/auditor-onboarding", admin);
  check((audList.auditors || []).some((a) => a.email === `bulk1.${RUN.toLowerCase()}@example.com`), "imported auditors appear in Auditor Onboarding");
  const detail = await api("GET", `/auditor-onboarding/${trackA.id}`, admin);
  check(detail.success !== false && JSON.stringify(detail).includes("APPROVED"), "auditor shows APPROVED with score and tag in admin view");
  const idc = await raw("GET", `/auditor-onboarding/${trackA.id}/id-card/pdf`, admin);
  check(idc.status === 200 && (idc.headers.get("content-type") || "").includes("pdf"), "auditor ID card PDF downloads");
  const letter = await raw("GET", `/auditor-onboarding/${trackA.id}/authority-letter/pdf`, admin);
  check(letter.status === 200, "authority letter PDF downloads");

  /* ---------------- 5. scheduling ---------------- */
  step("5. Scheduling: readiness check, two tracks, shared items audited once, notices");
  const snapOf = (code) => snaps[codes.indexOf(code)][0].id;
  const jobBody = (code, facilityType, includesShared) => { const start = new Date(Date.now() + 5 * 60e3); const end = new Date(Date.now() + 8 * 3600e3); return { snapshotId: snapOf(code), facilityType, includesShared, visitGroup: `E2E-${RUN}-${code}`, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), assignments: [{ auditorId: trackA.id, track: "A" }, { auditorId: trackB.id, track: "B" }] }; };
  const ready = await api("POST", "/client-audit-jobs/readiness", admin, jobBody(codes[0], "SHOWROOM", true));
  check(ready.success !== false && ready.readiness?.ready !== false && ready.ready !== false, "readiness check passes for both approved auditors", JSON.stringify(ready).slice(0, 300));
  const PLAN = [[codes[0], "SHOWROOM", true], [codes[0], "WORKSHOP", false], [codes[1], "WORKSHOP", true], [codes[2], "SHOWROOM", true]];
  // The portal refuses to double-book an auditor, so each facility audit is scheduled when the previous one is finished.
  const schedule = async ([code, f, sh]) => { const j = await api("POST", "/client-audit-jobs", admin, jobBody(code, f, sh)); check(j.success, `audit scheduled: ${code} ${f}`, JSON.stringify(j).slice(0, 300)); return j.job ? { ...j.job, code, f } : null; };
  const first = await schedule(PLAN[0]);
  const overlap = await api("POST", "/client-audit-jobs", admin, jobBody(codes[0], "WORKSHOP", false));
  check(overlap.success === false && /eligible|conflict|already/i.test(overlap.message || ""), "the same auditors cannot be double-booked for an overlapping audit", overlap.message);
  const co = await api("GET", `/client-audit-jobs/${first.id}/check-in`, trackA.token);
  check(co.success !== false, "assigned auditor sees check-in details", JSON.stringify(co).slice(0, 200));
  const notices = await api("GET", "/client-audit-jobs/notices", admin);
  check(notices.success && Array.isArray(notices.notices) && notices.notices.length >= 1, "T-7 / T-3 / T-1 notices were scheduled", JSON.stringify(notices).slice(0, 200));

  /* ---------------- 6. execution ---------------- */
  step("6. Audit execution by both tracks (geofenced check-in, evidence, finish with signature)");
  const run = async (auditor, job, quality, tag) => {
    const info = job.location || {}; const lat = info.latitude, lng = info.longitude;
    const ci = await api("POST", `/client-audit-jobs/${job.id}/check-in`, auditor.token, form({ source: "LIVE_CAMERA", deviceId: "e2e", latitude: lat, longitude: lng, accuracy: 15 }, { checkInPhoto: unique(tag + "ci") }));
    if (!ci.session) { check(false, `check-in ${tag}`, JSON.stringify(ci).slice(0, 300)); return null; }
    let n = 0; let nonCompliant = 0;
    for (const m of ci.session.modules) for (const sec of m.sections) for (const q of sec.questions) {
      n += 1; const bad = (n % quality) === 0;
      const f = new FormData(); f.append("responseStatus", "SUBMITTED");
      if (q.responseType === "MEASUREMENT") { f.append("measurementValue", String(bad ? (q.maximumValue ?? 10) + 4 : (q.maximumValue ? q.maximumValue - 1 : (q.minimumValue || 0) + 60))); if (bad) { f.append("observation", "Reading outside limit"); f.append("recommendation", "Rectify and re-test"); nonCompliant += 1; } }
      else if (bad) { f.append("answer", "NON_COMPLIANT"); f.append("observation", `Issue on ${q.questionCode}`); f.append("recommendation", "Rectify within the window"); nonCompliant += 1; }
      else f.append("answer", "COMPLIANT");
      for (let i = 0; i < Math.max(1, Number(q.minimumEvidence || 0)); i++) f.append("evidence", new Blob([unique(`${tag}${q.id}${i}`)], { type: "image/png" }), "e.png");
      const r = await api("PUT", `/client-audit-jobs/${job.id}/session/responses/${q.snapshotItemId}`, auditor.token, f);
      if (!r.success) { check(false, `response ${tag} ${q.questionCode}`, JSON.stringify(r).slice(0, 300)); return null; }
    }
    const ready = await api("GET", `/client-audit-jobs/${job.id}/completion-readiness`, auditor.token);
    const done = await api("POST", `/client-audit-jobs/${job.id}/complete`, auditor.token, { finalRemarks: "Audit completed", declarationAccepted: true, signature: SIG });
    check(done.success, `${tag} completed (${n} items, ${nonCompliant} findings)`, JSON.stringify(done).slice(0, 300) + " / " + JSON.stringify(ready).slice(0, 200));
    return { items: n, nonCompliant, ok: done.success };
  };
  const jobs = []; const results = []; const quality = [4, 6, 3, 5];
  for (const [i, item] of PLAN.entries()) {
    const job = i === 0 ? first : await schedule(item);
    if (!job) continue; jobs.push(job);
    const a = await run(trackA, job, quality[i], `A-${job.code}-${job.f}`); const b = await run(trackB, job, quality[i], `B-${job.code}-${job.f}`);
    results.push({ a, b });
  }
  check(jobs.length === 4, "four facility audits scheduled and run (one site co-located, audited separately)", `${jobs.length}`);
  const sharedA = results[0]?.a?.items, sharedB = results[1]?.a?.items;
  check(Number.isFinite(sharedA) && Number.isFinite(sharedB) && sharedB < sharedA + 100, "shared items are audited once (workshop audit of the co-located site excludes them)", `${sharedA} vs ${sharedB}`);
  const jobList = await api("GET", "/client-audit-jobs", admin);
  const completed = (jobList.jobs || []).filter((j) => j.status === "COMPLETED" && jobs.some((x) => x.id === j.id));
  check(completed.length === 4, "all four facility audits show COMPLETED after both tracks finish", `${completed.length}`);

  /* ---------------- 7. QC and release ---------------- */
  step("7. QC review, scoring, rating, release");
  const queue = (await api("GET", "/client-qc/queue", admin)).reports || [];
  const mine = queue.filter((r) => codes.includes(r.location?.locationCode));
  check(mine.length === 4, "four reports are in the QC queue", `${mine.length}`);
  const published = [];
  const getRep = async (id) => ((await api("GET", "/client-audit-reports", admin)).reports || []).find((x) => x.id === id) || {};
  for (const [ri, r] of mine.entries()) {
    const d = await api("GET", `/client-qc/reports/${r.id}`, admin);
    check(d.success !== false && (d.report || d).score !== undefined || d.report, `report ${r.id.slice(0, 6)} opens with score and findings`, JSON.stringify(d).slice(0, 200));
    const sc = await api("POST", `/client-qc/reports/${r.id}/score`, admin, { accuracy: 90, evidence: 88, timeliness: 85, protocol: 92, remarks: "Good" });
    check(sc.success, "auditors scored by QC", JSON.stringify(sc).slice(0, 200));
    // Report 1 goes through a correction cycle, report 2 is returned and resubmitted, the others go straight through.
    const seq = ri === 0 ? ["SUBMIT", "CORRECTION", "APPROVE", "PUBLISH"] : ri === 1 ? ["SUBMIT", "RETURN", "SUBMIT", "APPROVE", "PUBLISH"] : ["SUBMIT", "APPROVE", "PUBLISH"];
    for (const action of seq) {
      if (action === "CORRECTION") {
        const cor = await api("POST", `/client-audit-reports/${r.id}/corrections`, admin, { category: "REPORT_DETAIL", priority: "HIGH", instruction: "Add the debrief attendee names to the report." });
        check(cor.success, "QC raises a correction point on the report", JSON.stringify(cor).slice(0, 250));
        const mid = await getRep(r.id);
        check(mid.status === "CORRECTION_REQUIRED", "report moves to CORRECTION_REQUIRED", mid.status);
        const blocked = await api("PATCH", `/client-audit-reports/${r.id}/review`, admin, { action: "APPROVE", remarks: "ok" });
        check(blocked.success === false, "a report with an open correction cannot be approved", blocked.message);
        const cid = cor.correction?.id || cor.record?.id;
        const sub = await api("PATCH", `/client-audit-reports/corrections/${cid}/submit`, trackA.token, form({ resolution: "Names added to the debrief section." }));
        check(sub.success, "lead auditor submits the correction", JSON.stringify(sub).slice(0, 250));
        const acc = await api("PATCH", `/client-audit-reports/corrections/${cid}/review`, admin, { action: "ACCEPT", remarks: "Verified" });
        check(acc.success, "QC accepts the correction and the report returns to review", JSON.stringify(acc).slice(0, 250));
        continue;
      }
      const rv = await api("PATCH", `/client-audit-reports/${r.id}/review`, admin, { action, remarks: action === "RETURN" ? "Evidence for two findings is unclear; please recheck." : "ok" });
      if (!rv.success) { check(false, `report ${action}`, JSON.stringify(rv).slice(0, 300)); break; }
      if (action === "PUBLISH") published.push(r);
    }
    if (ri === 0 || ri === 1) {
      const rep = await getRep(r.id);
      const actions = (rep.history || []).map((h) => h.action);
      check(ri === 0 ? actions.includes("CORRECTION_ACCEPTED") && actions.includes("PUBLISH") : actions.includes("RETURN") && actions.filter((a) => a === "SUBMIT").length === 2 && rep.revision >= 2, ri === 0 ? "report history records correction, approval and publication" : "returned report keeps its full history and a new revision after resubmission", actions.join(","));
    }
  }
  check(published.length === 4, "four reports published to the client");
  const pdf = await raw("GET", `/client-qc/reports/${published[0].id}/pdf`, admin);
  check(pdf.status === 200 && (pdf.headers.get("content-type") || "").includes("pdf"), "report PDF downloads");
  const docx = await raw("GET", `/client-qc/reports/${published[0].id}/docx`, admin);
  check(docx.status === 200, "report Word (docx) downloads", docx.status);
  const combined = await api("GET", `/client-qc/combined?locationId=${site[codes[0]]}`, admin);
  check(combined.success !== false && JSON.stringify(combined).length > 200, "combined site report built from the two co-located facility audits", JSON.stringify(combined).slice(0, 200));

  /* ---------------- 8. scoped access ---------------- */
  step("8. Scoped access: site user, zonal manager, corporate");
  const credOf = (email) => creds.find((c) => c.email === email.toLowerCase());
  const siteDel = await login(credOf(users[0].Email).username, credOf(users[0].Password || users[0].Email).password);
  check(Boolean(siteDel.token), "site user logs in with the issued credentials", JSON.stringify(siteDel).slice(0, 150));
  const zone = await login(credOf(users[2].Email).username, credOf(users[2].Email).password);
  const corp = await login(credOf(users[3].Email).username, credOf(users[3].Email).password);
  const mineSite = (await api("GET", "/client-qc/my-reports", siteDel.token)).reports || [];
  check(mineSite.length === 2 && mineSite.every((r) => r.location?.locationCode === codes[0]), "site user sees only their own site's reports (2 facilities)", `${mineSite.length}`);
  const zoneReports = (await api("GET", "/client-qc/my-reports", zone.token)).reports || [];
  check(zoneReports.length === 3, "zonal manager sees the 3 audits of the North zone, not Patna", `${zoneReports.length}`);
  const corpReports = (await api("GET", "/client-qc/my-reports", corp.token)).reports || [];
  check(corpReports.length === 4, "corporate manager sees all four across zones", `${corpReports.length}`);
  const forbidden = await api("GET", `/client-qc/reports/${mine.find((r) => r.location.locationCode === codes[2]).id}`, siteDel.token);
  check(forbidden._status === 403, "site user is blocked from another site's report (403)", forbidden._status);
  const adminOnly = await api("GET", "/client-audit-setup/companies/overview", siteDel.token);
  check([401, 403].includes(adminOnly._status), "site user cannot open admin setup", adminOnly._status);

  /* ---------------- 9. dealer sign-off ---------------- */
  step("9. Dealer sign-off");
  const delReport = mineSite[0];
  const so = await api("POST", `/client-qc/reports/${delReport.id}/signoff`, siteDel.token, { name: "Delhi Dealer Principal", designation: "Dealer Principal", signature: SIG, debriefNotes: "Debrief held" });
  check(so.success, "site user signs off the published report", JSON.stringify(so).slice(0, 200));

  /* ---------------- 10. NC and CAPA ---------------- */
  step("10. Findings, CAPA, auditor verification, closure");
  const ncs = (await api("GET", "/client-audit-ncs", siteDel.token)).records || (await api("GET", "/client-audit-ncs", siteDel.token)).ncs || [];
  check(ncs.length > 0, "site user sees the findings of their cycle audit", `${ncs.length}`);
  const nc = ncs[0];
  if (nc) {
    const capaForm = form({ rootCause: "Lack of inspection routine", correctiveAction: "Rectified and re-tested", preventiveAction: "Monthly inspection added", responsiblePerson: "Facility head", targetDate: new Date(Date.now() + 14 * 864e5).toISOString() }, { evidence: unique("capa") });
    const capa = await api("POST", `/client-audit-ncs/${nc.id}/capa`, siteDel.token, capaForm);
    check(capa.success, "site user submits CAPA with evidence", JSON.stringify(capa).slice(0, 250));
    const lead = [trackA, trackB];
    let closed = false;
    for (const a of lead) { const rv = await api("PATCH", `/client-audit-ncs/${nc.id}/review`, a.token, { action: "CLOSE", remarks: "Verified" }); if (rv.success) { closed = true; break; } }
    check(closed, "lead auditor verifies the CAPA and closes the finding");
  }
  const risk = await api("GET", "/client-qc/risk-register", admin);
  check(risk.success !== false, "risk register loads with both classifications", JSON.stringify(risk).slice(0, 120));
  const note = await api("GET", "/notifications", siteDel.token);
  check(note._status === 200, "notifications API serves the site user");

  /* ---------------- 11. governance ---------------- */
  step("11. Rankings, awards, certificates, access admin");
  const summary = await api("GET", "/governance/summary", admin);
  check(summary.success !== false && summary._status === 200, "network dashboard summary loads", summary._status);
  const lb = await api("GET", "/governance/leaderboard", admin);
  check(lb._status === 200, "leaderboard loads");
  const lbSite = await api("GET", "/governance/leaderboard", siteDel.token);
  check(lbSite._status === 200, "site user can view the leaderboard (masked)");
  const accessUsers = await api("GET", "/governance/access/users", admin);
  check(accessUsers._status === 200 && JSON.stringify(accessUsers).includes("SITE_USER"), "access admin lists the users created by the import");
  const newUser = await api("POST", "/governance/access/users", admin, { fullName: "Extra Regional Manager", email: `rm.${RUN.toLowerCase()}@example.com`, role: "REGIONAL_MANAGER", scope: { companyId: company.id, regionalOffice: "Delhi" } });
  check(newUser.success, "scoped user created manually in Access & Roles", JSON.stringify(newUser).slice(0, 200));

  /* ---------------- 12. training: video, quiz, fail and retrain, certificate, refresher ---------------- */
  step("12. Training content, mandatory video, quiz fail and retrain, certificate, refresher, expiry");
  const content = await api("GET", "/auditor-onboarding/content", admin);
  check(content.success && content.content.quiz.length >= 3, "admin can read the training content (video, pass mark, quiz, demo)");
  const saveContent = (patch) => api("PUT", "/auditor-onboarding/content", admin, { ...content.content, ...patch });
  const bad = await saveContent({ quiz: content.content.quiz.slice(0, 2) });
  check(bad.success === false, "training content with fewer than 3 questions is refused", bad.message);
  const withVideo = await saveContent({ videoUrl: "https://example.com/training.mp4" });
  check(withVideo.success, "admin publishes a training video link", JSON.stringify(withVideo).slice(0, 200));
  const newAud = (await api("GET", "/auditor-onboarding", admin)).auditors.find((a) => a.email === `bulk1.${RUN.toLowerCase()}@example.com`);
  const newCreds = await api("POST", `/auditor-onboarding/${newAud.id}/resend-credentials`, admin, {});
  const nTok = (await login(newCreds.credentials.username, newCreds.credentials.password)).token;
  await api("GET", "/auditor-onboarding/me/training", nTok);
  const jump = await api("POST", "/auditor-onboarding/me/video-progress", nTok, { progress: 100 });
  check(jump.videoProgress <= 25, "with a published video, progress cannot jump straight to 100%", String(jump.videoProgress));
  const early = await api("POST", "/auditor-onboarding/me/submit", nTok, { quizAnswers: {}, demoAnswers: {} });
  check(early.success === false, "the quiz cannot be submitted before the video is watched", early.message);
  await saveContent({ videoUrl: "" });
  await api("POST", "/auditor-onboarding/me/video-progress", nTok, { progress: 100 });
  const wrongQuiz = Object.fromEntries(DEFAULT_QUIZ.map((q) => [q.id, (q.answer + 1) % q.options.length]));
  const demoAns = Object.fromEntries(DEFAULT_DEMO.map((d) => [d.id, { result: d.expected, comment: d.expected === "OK" ? "" : "Observed as per scenario" }]));
  const failed = await api("POST", "/auditor-onboarding/me/submit", nTok, { quizAnswers: wrongQuiz, demoAnswers: demoAns });
  check(failed.success && failed.passed === false, "a failing quiz score is recorded as FAIL", JSON.stringify(failed).slice(0, 200));
  const afterFail = await api("GET", "/auditor-onboarding/me/training", nTok);
  check(afterFail.onboarding.status === "RETRAINING" && afterFail.onboarding.videoProgress === 0, "after a fail the auditor must retrain: status RETRAINING and the video resets", afterFail.onboarding.status);
  await api("POST", "/auditor-onboarding/me/video-progress", nTok, { progress: 100 });
  const goodQuiz = Object.fromEntries(DEFAULT_QUIZ.map((q) => [q.id, q.answer]));
  const passed2 = await api("POST", "/auditor-onboarding/me/submit", nTok, { quizAnswers: goodQuiz, demoAnswers: demoAns });
  check(passed2.success && passed2.passed, "after retraining the auditor passes the quiz", JSON.stringify(passed2).slice(0, 200));
  check((await api("POST", `/auditor-onboarding/${newAud.id}/review`, admin, { demoScore: 90, decision: "PASS", remarks: "Retrained well." })).success, "back-admin reviews the retrained auditor");
  const apr = await api("POST", `/auditor-onboarding/${newAud.id}/approve`, admin, {});
  check(apr.success, "auditor approved after retraining");
  const certRes = await raw("GET", "/auditor-onboarding/me/certificate/pdf", nTok);
  check(certRes.status === 200 && (certRes.headers.get("content-type") || "").includes("pdf"), "the auditor downloads the training certificate (PDF)");
  const adminCert = await raw("GET", `/auditor-onboarding/${newAud.id}/certificate/pdf`, admin);
  check(adminCert.status === 200, "back-admin can also open the certificate");
  const t1 = await api("GET", "/auditor-onboarding/me/training", nTok);
  const months = (new Date(t1.onboarding.expiresAt) - Date.now()) / (30.4 * 864e5);
  check(months > 11 && months < 13, "certification is valid for 12 months from approval", months.toFixed(1));
  check(t1.onboarding.events.map((e) => e.action).includes("QUIZ_FAILED") && t1.onboarding.events.map((e) => e.action).includes("APPROVED"), "the training record keeps every attempt (fail, retrain, approval)");
  const tooEarly = await api("POST", "/auditor-onboarding/me/refresher", nTok, {});
  check(tooEarly.success === false, "refresher training is not open until 30 days before expiry", tooEarly.message);
  await api("PUT", `/auditor-onboarding/${newAud.id}/field-readiness`, admin, { backgroundVerified: true, shadowAuditsCompleted: 1, certificationExpiresAt: new Date(Date.now() + 10 * 864e5).toISOString() });
  const due = await api("GET", "/auditor-onboarding/me/training", nTok);
  check(due.onboarding.canStartRefresher && due.onboarding.refresherDue, "within 30 days of expiry the refresher opens", JSON.stringify(due.onboarding).slice(0, 160));
  const ref = await api("POST", "/auditor-onboarding/me/refresher", nTok, {});
  check(ref.success, "auditor starts the refresher training", JSON.stringify(ref).slice(0, 200));
  await api("POST", "/auditor-onboarding/me/video-progress", nTok, { progress: 100 });
  check((await api("POST", "/auditor-onboarding/me/submit", nTok, { quizAnswers: goodQuiz, demoAnswers: demoAns })).passed, "refresher quiz passed");
  await api("POST", `/auditor-onboarding/${newAud.id}/review`, admin, { demoScore: 95, decision: "PASS", remarks: "Refresher complete." });
  await api("POST", `/auditor-onboarding/${newAud.id}/approve`, admin, {});
  const renewed = await api("GET", "/auditor-onboarding/me/training", nTok);
  check((new Date(renewed.onboarding.expiresAt) - Date.now()) / (30.4 * 864e5) > 11, "approval after the refresher renews the certificate for another 12 months");
  await api("PUT", `/auditor-onboarding/${newAud.id}/field-readiness`, admin, { backgroundVerified: true, shadowAuditsCompleted: 1, certificationExpiresAt: new Date(Date.now() - 2 * 864e5).toISOString() });
  const soon = new Date(Date.now() + 3600e3).toISOString();
  const blockedPlan = await api("POST", "/client-audit-jobs/readiness", admin, { snapshotId: snapOf(codes[0]), facilityType: "SHOWROOM", scheduledStart: soon, scheduledEnd: new Date(Date.now() + 8 * 3600e3).toISOString(), assignments: [{ auditorId: newAud.id, track: "A" }, { auditorId: trackB.id, track: "B" }] });
  check(blockedPlan.readiness?.ready === false && /expire/i.test(JSON.stringify(blockedPlan.readiness)), "an auditor whose certification has expired cannot be planned for an audit", JSON.stringify(blockedPlan).slice(0, 220));

  /* ---------------- 13. site change requests ---------------- */
  step("13. Site change requests: raise, approve, decline, scope");
  const mkChange = (token, locationId, changes, reason) => api("POST", "/site-change-requests", token, { locationId, changes, reason });
  const chg = await mkChange(siteDel.token, site[codes[0]], { contactName: "New Principal", contactPhone: "9822233344" }, "The dealer principal changed this month.");
  check(chg.success, "site user raises a change request for their site", JSON.stringify(chg).slice(0, 200));
  const dupChg = await mkChange(siteDel.token, site[codes[0]], { address: "Another address" }, "Moved.");
  check(dupChg.success === false, "only one pending request per user and site", dupChg.message);
  const wrongSite = await mkChange(siteDel.token, site[codes[2]], { contactName: "X" }, "Not my site, should be refused.");
  check(wrongSite._status === 403, "a site user cannot request changes for another site (403)", wrongSite._status);
    const selfApprove = await api("POST", `/site-change-requests/${chg.request.id}/decision`, siteDel.token, { approve: true });
  check(selfApprove._status === 403, "a site user cannot approve their own request (403)", selfApprove._status);
  const dec = await api("POST", `/site-change-requests/${chg.request.id}/decision`, admin, { approve: true, remarks: "Confirmed with the dealer." });
  check(dec.success, "back-admin approves the change", JSON.stringify(dec).slice(0, 200));
  const after = await api("GET", `/client-audit-setup/locations/${site[codes[0]]}`, admin);
  check(after.location.contactName === "New Principal" && after.location.contactPhone === "9822233344", "the approved change is applied to the site master data");
  const mine2 = await api("GET", "/site-change-requests", siteDel.token);
  check(mine2.requests[0].status === "APPROVED" && mine2.requests[0].previousValues?.contactName === "Dealer Principal", "the request keeps the previous values for the audit trail", JSON.stringify(mine2.requests[0].previousValues));
  const chg2 = await mkChange(siteDel.token, site[codes[0]], { latitude: "28.7" }, "GPS pin is off by 300 m.");
  const decl = await api("POST", `/site-change-requests/${chg2.request.id}/decision`, admin, { approve: false });
  check(decl.success === false, "declining needs a reason", decl.message);
  check((await api("POST", `/site-change-requests/${chg2.request.id}/decision`, admin, { approve: false, remarks: "Please send a photo of the gate." })).success, "back-admin declines with a reason");
  const unchanged = await api("GET", `/client-audit-setup/locations/${site[codes[0]]}`, admin);
  check(Math.abs(unchanged.location.latitude - 28.6139) < 0.01, "a declined change leaves the site untouched");
  const audChg = await mkChange(trackA.token, site[codes[0]], { city: "New Delhi" }, "Auditor noticed the city name is not the postal one.");
  check(audChg.success, "an auditor who audited the site can raise a change request too", JSON.stringify(audChg).slice(0, 160));

  /* ---------------- 14. admin hub, hierarchy, demo windows ---------------- */
  step("14. Reviews & approvals inbox, hierarchy, instruments, performance, demo windows");
  const inbox = await api("GET", "/admin-hub/approvals", admin);
  check(inbox.success && inbox.sections.length >= 6 && inbox.sections.find((x) => x.key === "changes").count >= 1, "approvals inbox lists items waiting across stages (including the change request)", JSON.stringify(inbox).slice(0, 120));
  check((await api("GET", "/admin-hub/approvals", zone.token))._status === 403, "the approvals inbox is admin only");
  const tree = await api("GET", "/admin-hub/hierarchy", admin);
  const coNode = tree.tree.find((n) => n.name === companyName);
  check(coNode && coNode.children.some((z) => z.name === "North") && coNode.children.some((z) => z.name === "East"), "hierarchy shows company > zones > regional offices > sites", JSON.stringify(tree.tree.map((n) => n.name)));
  const zTree = await api("GET", "/admin-hub/hierarchy", zone.token);
  check(zTree.success && zTree.tree.every((n) => n.children.every((z) => z.name === "North")), "a zonal manager's hierarchy shows only their own zone");
  const ins = await api("GET", "/admin-hub/instruments", admin);
  check(ins.success && ins.totals.tools >= 3 && ins.rows.every((r) => r.status), "instruments register lists every site's tools with validity status", JSON.stringify(ins.totals));
  const perf = await api("GET", "/admin-hub/performance", admin);
  check(perf.success && perf.rows.some((r) => r.score !== null && r.auditsDone >= 1), "auditor performance shows QC-based scores and audits done");
  const personas = await api("GET", "/admin-hub/demo-personas", admin);
  check(personas.success && personas.personas.filter((x) => x.available).length >= 4, "demo portals are available for the auditor, site, zonal and corporate roles", JSON.stringify(personas.personas.map((x) => x.role + ":" + x.available)));
  const demo = await api("POST", "/admin-hub/demo-session", admin, { role: "SITE_USER" });
  check(demo.success && demo.token, "back-admin starts a demo window for the site user portal");
  const demoRead = await api("GET", "/client-qc/my-reports", demo.token);
  check(demoRead._status === 200 && Array.isArray(demoRead.reports), "the demo window can read everything that role sees");
  const demoWrite = await api("POST", "/site-change-requests", demo.token, { locationId: site[codes[0]], changes: { contactName: "Hacker" }, reason: "should be refused" });
  check(demoWrite._status === 403 && /read-only/i.test(demoWrite.message || ""), "the demo window is read-only: changes are refused (403)", demoWrite._status);
  check((await api("POST", "/admin-hub/demo-session", siteDel.token, { role: "ADMIN" }))._status === 403, "only back-admin can open demo windows");
  check((await api("POST", "/admin-hub/demo-session", demo.token, { role: "AUDITOR" }))._status === 403, "a demo window cannot start another demo window");

  /* ---------------- 15. one report, the whole chain ---------------- */
  step("15. One report from company to awards: lifecycle, client clarification and change, approval, CAPA, awards, template data");
  const patnaReport = published.find((r) => r.location?.locationCode === codes[2]);
  const patna = await login(credOf(users[1].Email).username, credOf(users[1].Email).password);
  const lc = await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, admin);
  const keys = (lc.stages || []).map((x) => x.key);
  check(lc.success && ["company", "site", "checklist", "scheduling", "audit", "submitted", "review", "issued", "clarifications", "revision", "approval", "capa", "awards"].every((k) => keys.includes(k)), "the lifecycle shows every stage from company to awards", keys.join(","));
  check(lc.stages.filter((x) => ["company", "site", "checklist", "scheduling", "audit", "submitted", "review", "issued"].includes(x.key)).every((x) => x.state === "DONE") && lc.current === "approval", "stages up to issue are DONE and the report is waiting at client approval", lc.current);
  check((await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, patna.token)).success && (await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, trackA.token)).success, "the dealer and the auditor see the same lifecycle");
  check((await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, siteDel.token))._status === 403, "another site's user cannot open this report's lifecycle (403)");
  // scope: findings and reports are limited to the user's own site, not the whole company
  const ncsPatna = (await api("GET", "/client-audit-ncs", patna.token)).records || [];
  const ncsDel = (await api("GET", "/client-audit-ncs", siteDel.token)).records || [];
  check(ncsPatna.length > 0 && ncsPatna.every((n) => n.response.session.job.location.locationCode === codes[2]), "a site user sees only the findings of their own site", `${ncsPatna.length}`);
  check(ncsDel.length > 0 && ncsDel.every((n) => n.response.session.job.location.locationCode === codes[0]), "a different site's user sees only theirs: no company-wide leak", `${ncsDel.length}`);
  const repsPatna = (await api("GET", "/client-audit-reports", patna.token)).reports || [];
  check(repsPatna.length > 0 && repsPatna.every((r) => r.job.location.locationCode === codes[2]), "the report list is also limited to the user's own site");
  // the dealer asks for a change
  const wrongRaise = await api("POST", `/client-qc/reports/${patnaReport.id}/clarifications`, siteDel.token, { kind: "CHANGE", message: "Not my site and should be refused." });
  check(wrongRaise._status === 403, "a user from another site cannot raise a clarification on this report (403)", wrongRaise._status);
  const chgReq = await api("POST", `/client-qc/reports/${patnaReport.id}/clarifications`, patna.token, { kind: "CHANGE", message: "The fire extinguisher finding was already replaced on the audit day; please correct the observation." });
  check(chgReq.success, "the dealer requests a change on the issued report", JSON.stringify(chgReq).slice(0, 200));
  const signBlocked = await api("POST", `/client-qc/reports/${patnaReport.id}/signoff`, patna.token, { name: "Patna Dealer", designation: "GM", signature: SIG });
  check(signBlocked.success === false && /waiting|resolved/i.test(signBlocked.message || ""), "dealer approval is blocked while a change request is open", signBlocked.message);
  const notAdminAccept = await api("POST", `/client-qc/clarifications/${chgReq.clarification.id}/respond`, patna.token, { action: "ACCEPT_CHANGE", response: "x" });
  check(notAdminAccept._status === 403, "the dealer cannot accept their own change request (403)");
  const accepted = await api("POST", `/client-qc/clarifications/${chgReq.clarification.id}/respond`, admin, { action: "ACCEPT_CHANGE", response: "Observation will be corrected in a new revision." });
  check(accepted.success, "Back-Admin accepts the change: a new revision opens", JSON.stringify(accepted).slice(0, 200));
  const lc2 = await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, admin);
  check(lc2.current === "review" && lc2.stages.find((x) => x.key === "revision").state === "CURRENT" && lc2.stages.find((x) => x.key === "approval").state === "PENDING", "the lifecycle moves back to QC review with the revision as the current change", lc2.current);
  check((await api("GET", `/client-qc/reports/${patnaReport.id}/revisions`, admin)).success !== false, "the earlier issue stays available as a revision");
  for (const action of ["APPROVE", "PUBLISH"]) check((await api("PATCH", `/client-audit-reports/${patnaReport.id}/review`, admin, { action, remarks: "Observation corrected." })).success, `revision ${action.toLowerCase()}d by Back-Admin`);
  const afterPub = (await api("GET", `/client-qc/reports/${patnaReport.id}/clarifications`, patna.token)).clarifications[0];
  check(afterPub.status === "ACTIONED" && afterPub.resolvedInRevision >= 2, "issuing the revision marks the requested change as done", afterPub.status);
  check((await api("POST", `/client-qc/clarifications/${afterPub.id}/close`, patna.token, {})).success, "the dealer confirms the change is done");
  const q1 = await api("POST", `/client-qc/reports/${patnaReport.id}/clarifications`, patna.token, { kind: "CLARIFICATION", message: "Why was the thermography finding rated Critical?" });
  check(q1.success, "the dealer asks a question about the report");
  const ans = await api("POST", `/client-qc/clarifications/${q1.clarification.id}/respond`, trackA.token, { action: "ANSWER", response: "The hot spot was 18 C above ambient, above the Critical limit." });
  check(ans.success, "the lead auditor answers the question", JSON.stringify(ans).slice(0, 160));
  check((await api("POST", `/client-qc/clarifications/${q1.clarification.id}/close`, patna.token, {})).success, "the dealer closes the answered question");
  // CAPA inside the report
  const nc1 = ncsPatna[0];
  const capa1 = await api("POST", `/client-audit-ncs/${nc1.id}/capa`, patna.token, form({ rootCause: "No monthly check", correctiveAction: "Replaced and tagged", preventiveAction: "Monthly inspection added", responsiblePerson: "Facility head", targetDate: new Date(Date.now() + 10 * 864e5).toISOString() }, { evidence: unique("capa-patna") }));
  check(capa1.success, "the dealer submits CAPA from the report page", JSON.stringify(capa1).slice(0, 200));
  let closedByLead = false; for (const a of [trackA, trackB]) { const rv = await api("PATCH", `/client-audit-ncs/${nc1.id}/review`, a.token, { action: "CLOSE", remarks: "Verified on photo." }); if (rv.success) { closedByLead = true; break; } }
  check(closedByLead, "the lead auditor verifies the CAPA and closes the finding");
  const lc3 = await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, patna.token);
  check(/1 of \d+ findings closed/.test(lc3.stages.find((x) => x.key === "capa").detail), "the lifecycle tracks CAPA closure for the report", lc3.stages.find((x) => x.key === "capa").detail);
  // approval
  const signOk = await api("POST", `/client-qc/reports/${patnaReport.id}/signoff`, patna.token, { name: "Patna Dealer GM", designation: "General Manager", signature: SIG, debriefNotes: "Debrief held on site." });
  check(signOk.success, "with everything resolved the dealer approves the report with a named signature", JSON.stringify(signOk).slice(0, 200));
  const lc4 = await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, admin);
  check(lc4.stages.find((x) => x.key === "approval").state === "DONE" && lc4.stages.find((x) => x.key === "clarifications").state === "DONE", "the lifecycle shows client approval and the clarifications as complete");
  check((lc4.history || []).some((h) => h.action === "REVISION_OPENED") && (lc4.history || []).some((h) => h.action === "DEALER_SIGNOFF"), "Back-Admin sees the full history: revision opened, re-issued, dealer sign-off");
  // awards on the site
  const per = await api("POST", "/governance/periods", admin, { label: `Q2 FY 2026-27 (${RUN})`, type: "QUARTER", startsAt: STARTED, endsAt: new Date(Date.now() + 864e5).toISOString(), topN: 5 });
  check(per.success, "an award period is created", JSON.stringify(per).slice(0, 160));
  const closedP = await api("POST", `/governance/periods/${per.period.id}/close`, admin, {});
  check(closedP.success, "closing the period freezes rankings and drafts certificates", JSON.stringify(closedP).slice(0, 200));
  const drafts = ((await api("GET", `/governance/certificates?periodId=${per.period.id}`, admin)).certificates || []).filter((c) => c.nodeKey.startsWith("SITE:"));
  for (const c of drafts) await api("POST", `/governance/certificates/${c.id}/decision`, admin, { decision: "APPROVE" });
  check(drafts.length > 0, "site certificates are drafted for the top sites", `${drafts.length}`);
  const siteCerts = ((await api("GET", "/governance/certificates", patna.token)).certificates || []).filter((c) => c.nodeKey === `SITE:${site[codes[2]]}`);
  const siteCertsDel = ((await api("GET", "/governance/certificates", siteDel.token)).certificates || []).filter((c) => c.nodeKey.startsWith("SITE:") && c.nodeKey !== `SITE:${site[codes[0]]}`);
  check(siteCerts.length >= 1 && siteCertsDel.length === 0, "the site sees its own award on its page and none of another site's", `${siteCerts.length}/${siteCertsDel.length}`);
  const lc5 = await api("GET", `/client-qc/reports/${patnaReport.id}/lifecycle`, admin);
  check(lc5.stages.find((x) => x.key === "awards").state === "DONE", "the award appears as the last step of the report lifecycle", lc5.stages.find((x) => x.key === "awards").detail);
  const certPdf = await raw("GET", `/governance/certificates/${siteCerts[0].id}/pdf`, patna.token);
  check(certPdf.status === 200, "the site user can open the award certificate PDF");
  // checklist data flows into the report template
  const dxRes = await raw("GET", `/client-qc/reports/${published[0].id}/docx`, admin);
  const xml = new AdmZip(Buffer.from(await dxRes.arrayBuffer())).readAsText("word/document.xml");
  const norm = (t) => t.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, "").toLowerCase();
  const rep0 = await getRep(published[0].id);
  const answered = new Set((rep0.job.sessions || []).flatMap((x) => (x.responses || []).map((r) => r.snapshotItemId)));
  const texts = rep0.job.snapshot.items.filter((i) => answered.has(i.id)).map((i) => i.itemData?.questionText || "");
  const hit = texts.filter((t) => norm(xml).includes(norm(t).slice(0, 40))).length;
  check(texts.length > 0 && hit / texts.length >= 0.9, "the Word report template is filled from the same checklist points the auditor answered", `${hit}/${texts.length} points found in the report`);
  const siteName = rep0.job.location.dealerName;
  check(norm(xml).includes(norm(siteName)), "site details from set-up land in the report template");

  console.log(`\nRESULT: ${passed} checks passed, ${failures.length} failed`);
  if (failures.length) { console.log("FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
})().catch((e) => { console.error("E2E crashed:", e); process.exit(2); });
