// Builds a demo network (companies, sites, audits, reports, users) through the public API so the
// dashboards, rankings and awards have realistic data. Run with the server up:
//   node scripts/seed-demo-network.js            (API base defaults to http://localhost:5001/api)
// Demo audits are flagged isDemo; this script marks the generated ones as counted so they show in rankings.
const { execSync } = require("child_process");
const B = process.env.API || "http://localhost:5001/api";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t }; } };
const api = (m, p, t, body) => fetch(B + p, { method: m, headers: { ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${t}` }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }).then(j);
const login = async (u, p) => (await j(await fetch(B + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) }))).token;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const SITES = [
  ["M&M - NORTH", "North", "Delhi", "Delhi", "Delhi", ["SHOWROOM", "WORKSHOP"], 0.93],
  ["M&M - NORTH", "North", "Delhi", "Delhi", "Gurugram", ["WORKSHOP"], 0.88],
  ["M&M - NORTH", "North", "Delhi", "Delhi", "Noida", ["SHOWROOM"], 0.8],
  ["M&M - NORTH", "North", "Jaipur", "Rajasthan", "Jaipur", ["SHOWROOM", "WORKSHOP"], 0.85],
  ["M&M - NORTH", "North", "Jaipur", "Rajasthan", "Jodhpur", ["WORKSHOP"], 0.7],
  ["M&M - NORTH", "East", "Patna", "Bihar", "Gaya", ["WORKSHOP"], 0.74],
  ["M&M - NORTH", "East", "Kolkata", "West Bengal", "Kolkata", ["SHOWROOM", "WORKSHOP"], 0.9],
  ["M&M - NORTH", "East", "Kolkata", "West Bengal", "Siliguri", ["SHOWROOM"], 0.82],
  ["M&M - WEST", "West", "Mumbai", "Maharashtra", "Thane", ["SHOWROOM", "WORKSHOP"], 0.95],
  ["M&M - WEST", "West", "Mumbai", "Maharashtra", "Andheri", ["WORKSHOP"], 0.89],
  ["M&M - WEST", "West", "Mumbai", "Maharashtra", "Navi Mumbai", ["SHOWROOM"], 0.78],
  ["M&M - WEST", "West", "Pune", "Maharashtra", "Pune", ["SHOWROOM", "WORKSHOP"], 0.91],
  ["M&M - WEST", "West", "Pune", "Maharashtra", "Nashik", ["WORKSHOP"], 0.83],
  ["M&M - WEST", "South", "Bengaluru", "Karnataka", "Bengaluru", ["SHOWROOM", "WORKSHOP"], 0.92],
  ["M&M - WEST", "South", "Bengaluru", "Karnataka", "Mysuru", ["SHOWROOM"], 0.76],
];

(async () => {
  const admin = await login("admin", "admin123");
  const companies = (await api("GET", "/client-audit-setup/companies/overview", admin)).companies;
  const companyId = {};
  for (const name of [...new Set(SITES.map((s) => s[0]))]) {
    let c = companies.find((x) => x.companyName === name);
    if (!c) c = (await api("POST", "/company/create-company", admin, { companyName: name, email: `${name.replace(/\W+/g, "").toLowerCase()}@example.com`, address: "India" })).company;
    companyId[name] = c.id;
  }
  // checklist per company programme
  const programmeOf = {}; const versionOf = {};
  for (const [name, id] of Object.entries(companyId)) {
    // create a first site to trigger programme creation below
    programmeOf[name] = null;
  }
  const created = [];
  for (const [company, zone, ro, state, city, facilities, quality] of SITES) {
    const code = `${company.slice(-5).replace(/\W/g, "")}-${city.slice(0, 4).toUpperCase()}`;
    const exists = await api("GET", `/client-audit-setup/companies/${companyId[company]}/sites`, admin);
    if (exists.sites.some((s) => s.locationCode === code)) { created.push({ company, code, facilities, quality, id: exists.sites.find((s) => s.locationCode === code).id }); continue; }
    const items = facilities.map((f) => ({ facilityType: f, tier: f === "SHOWROOM" ? "MADB" : "Main Dealer Workshop", ciLevel: "CI 2024-25", workshopType: f === "WORKSHOP" ? "Mechanical + Bodyshop" : "", sellsPv: true, sellsBev: false, sellsCv: false, isActive: true }));
    const scope = Object.fromEntries(facilities.map((f) => [f, { INFRA: true, FIRE: true, ELECTRICAL: true, THERMOGRAPHY: true }]));
    const data = {
      identity: { dealerName: `${city} Motors Pvt Ltd`, dealerCode: code.slice(0, 8), sapCode: `SL${Math.floor(rnd() * 900000 + 100000)}`, locationName: city, locationCode: code, zone, regionalOffice: ro, state, city },
      location: { address: `Main Road, ${city}`, latitude: 20 + rnd() * 8, longitude: 73 + rnd() * 10, geofenceRadiusM: 200, contactName: "Dealer Principal", contactPhone: "9876543210", contactEmail: `${code.toLowerCase()}@example.com` },
      facilities: { items, electricalSupplyType: "LT supply", sharedMappings: [] }, scope, volumes: { mechanicalRos: 600 + Math.floor(rnd() * 600) },
      manpower: facilities.map((f) => ({ facilityType: f, role: f === "WORKSHOP" ? "Technician" : "Sales Consultant", required: 10, onRoll: 7 + Math.floor(rnd() * 4) })),
      tools: facilities.includes("WORKSHOP") ? [{ name: "Torque wrench set", category: "Must Have", required: 4, available: 4, validTill: "2027-03-31" }, { name: "Earth resistance tester", category: "Critical", required: 1, available: 1, validTill: "2026-08-01" }] : [],
    };
    const req = (await api("POST", "/client-audit-setup/site-requests", admin, { companyId: companyId[company], data })).request;
    await api("POST", `/client-audit-setup/site-requests/${req.id}/submit`, admin, {});
    const ap = await api("POST", `/client-audit-setup/site-requests/${req.id}/approve`, admin, {});
    if (!ap.success) { console.log("approve failed", code, ap.message); continue; }
    created.push({ company, code, facilities, quality, id: ap.locationId });
  }
  console.log("sites ready:", created.length);

  // publish a checklist for each programme and snapshot every site
  const programmes = (await api("GET", "/client-audit-setup/programmes", admin)).programmes;
  for (const p of programmes) {
    const versions = (await api("GET", `/client-audit-setup/checklists/versions?programmeId=${p.id}`, admin)).versions;
    if (!versions.some((v) => v.status === "PUBLISHED")) {
      const v = (await api("POST", "/client-audit-setup/checklists/versions", admin, { programmeId: p.id, name: "Integrated Facility, Electrical & Fire Safety Audit", version: "1.0" })).version;
      await api("POST", `/client-audit-setup/checklists/versions/${v.id}/demo-pack`, admin, {});
      await api("POST", `/client-audit-setup/checklists/versions/${v.id}/publish`, admin, {});
    }
  }
  const auditors = (await api("GET", "/auditor-onboarding", admin)).auditors;
  const a1 = auditors.find((a) => a.fullName === "Rohit Verma"), a2 = auditors.find((a) => a.fullName === "Anita Sharma");
  const t1 = await login("rohit.verma975", "test1234"), t2 = await login("anita.sharma379", "YKCJBPk4");
  const answerAll = async (token, jobId, quality, uid) => {
    const ci = new FormData(); ci.append("checkInPhoto", new Blob([PNG], { type: "image/png" }), "c.png"); ci.append("source", "LIVE_CAMERA"); ci.append("deviceId", "seed");
    const r = await api("POST", `/client-audit-jobs/${jobId}/check-in`, token, ci); if (!r.session) { console.log("  check-in failed", r.message); return false; }
    let n = 0;
    for (const m of r.session.modules) for (const sec of m.sections) for (const q of sec.questions) {
      n += 1; const f = new FormData(); f.append("responseStatus", "SUBMITTED");
      const bad = rnd() > quality;
      if (q.responseType === "MEASUREMENT") f.append("measurementValue", String(bad ? (q.maximumValue ?? 10) + 4 : (q.maximumValue ? q.maximumValue - 1 : (q.minimumValue || 0) + 60)));
      else if (bad) { f.append("answer", "NON_COMPLIANT"); f.append("observation", `Issue found on ${q.questionCode}`); if (rnd() > 0.7) { f.append("closedOnSpot", "true"); f.append("correctionComment", "Corrected during audit"); f.append("correctionEvidence", new Blob([Buffer.concat([PNG, Buffer.from("c" + q.id + uid)])], { type: "image/png" }), "x.png"); } else f.append("recommendation", "Rectify within the closure window"); }
      else f.append("answer", "COMPLIANT");
      if (q.responseType === "MEASUREMENT" && bad) { f.append("observation", "Reading outside the limit"); f.append("recommendation", "Rectify and re-test"); }
      for (let i = 0; i < Math.max(1, Number(q.minimumEvidence || 0)); i++) f.append("evidence", new Blob([Buffer.concat([PNG, Buffer.from(`${uid}-${q.id}-${i}-${n}`)])], { type: "image/png" }), "e.png");
      const res = await api("PUT", `/client-audit-jobs/${jobId}/session/responses/${q.snapshotItemId}`, token, f);
      if (!res.success) { console.log("  response failed", q.questionCode, res.message); return false; }
    }
    const done = await api("POST", `/client-audit-jobs/${jobId}/complete`, token, { finalRemarks: "Audit completed", declarationAccepted: true, signature: "data:image/png;base64," + PNG.toString("base64") });
    return Boolean(done.success);
  };

  const existingReports = (await api("GET", "/client-qc/queue", admin)).reports.map((r) => r.location.locationCode);
  for (const site of created) {
    const snap = (await api("GET", `/client-audit-jobs/options`, admin)).snapshots.find((s) => s.locationId === site.id);
    let snapshot = snap;
    if (!snapshot) {
      const loc = (await api("GET", `/client-audit-setup/locations/${site.id}`, admin)).location;
      const vers = (await api("GET", `/client-audit-setup/checklists/versions?programmeId=${loc.programmeId}`, admin)).versions.filter((v) => v.status === "PUBLISHED").sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      snapshot = (await api("POST", `/client-audit-setup/locations/${site.id}/checklist-snapshots`, admin, { versionId: vers[0].id })).snapshot;
    }
    if (existingReports.includes(site.code) && site.code !== "") { if (existingReports.filter((c) => c === site.code).length >= site.facilities.length) continue; }
    for (let i = 0; i < site.facilities.length; i++) {
      const job = (await api("POST", "/client-audit-jobs", admin, { snapshotId: snapshot.id, facilityType: site.facilities[i], includesShared: i === 0, isDemo: true, visitGroup: `SEED-${site.code}`, scheduledStart: new Date(Date.now() + 3600e3).toISOString(), scheduledEnd: new Date(Date.now() + 9 * 3600e3).toISOString(), assignments: [{ auditorId: a1.id, track: "A" }, { auditorId: a2.id, track: "B" }] })).job;
      if (!job) continue;
      const ok1 = await answerAll(t1, job.id, site.quality, "a"); const ok2 = await answerAll(t2, job.id, site.quality, "b");
      console.log(site.code, site.facilities[i], ok1 && ok2 ? "completed" : "FAILED");
    }
  }

  // Count the seeded audits: publish their reports and flag them as real audits for the rankings.
  const reports = (await api("GET", "/client-qc/queue", admin)).reports;
  for (const r of reports.filter((x) => x.status === "DRAFT")) {
    for (const a of ["SUBMIT", "APPROVE", "PUBLISH"]) await api("PATCH", `/client-audit-reports/${r.id}/review`, admin, { action: a });
  }
  const real = reports.filter((r) => r.visitGroup && r.visitGroup.startsWith("SEED-")).map((r) => `'${r.id}'`);
  if (real.length) {
    const sql = `UPDATE "ClientAuditJob" SET "isDemo"=false WHERE id IN (SELECT "jobId" FROM "ClientAuditReport" WHERE id IN (${real.join(",")}));`;
    execSync(`/opt/homebrew/opt/postgresql@16/bin/psql AuditWebPortal -c "${sql.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
    // age some findings so overdue tracking has something to show
    execSync(`/opt/homebrew/opt/postgresql@16/bin/psql AuditWebPortal -c "UPDATE \\"ClientAuditNonCompliance\\" SET \\"createdAt\\" = now() - interval '60 days' WHERE random() < 0.25 AND status='OPEN';"`, { stdio: "ignore" });
  }
  console.log("seed complete");
})();
