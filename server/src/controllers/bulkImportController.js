const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const { helpers: auditorHelpers } = require("./auditorOnboardingController");
const { helpers: governanceHelpers } = require("./governanceController");

// Repeatable, additive Excel imports for the people-and-organisation data: companies, auditors and users.
// Every import has a dry run (check the file, change nothing) and an import step. Rows that already exist are
// skipped, or, for companies, updated when mode=UPDATE. Sites, manpower, tools and checklists have their own imports.
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const sheetRows = (file, name) => {
  const wb = XLSX.read(file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[name] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw badRequest("The workbook has no sheets.");
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};

const KINDS = {
  companies: {
    sheet: "Companies", file: "companies-template.xlsx",
    columns: ["Company Name", "Email", "Address", "Contact Name", "Contact Phone", "PO No"],
    example: { "Company Name": "M&M - NORTH", Email: "north@example.com", Address: "Delhi NCR", "Contact Name": "A Kumar", "Contact Phone": "9876543210", "PO No": "PO-2026-001" },
    notes: ["One row per company. The company name is the key: an existing name is skipped (or updated when you choose 'Update existing').", "Companies created here appear on Site Onboarding. Add their sites from the company page."],
  },
  auditors: {
    sheet: "Auditors", file: "auditors-template.xlsx",
    columns: ["Full Name", "Email", "Phone", "Base Location", "Date of Birth (YYYY-MM-DD)", "Emergency Contact", "Skills", "Supported Regions"],
    example: { "Full Name": "Rohit Verma", Email: "rohit.verma@example.com", Phone: "9000000001", "Base Location": "Patna", "Date of Birth (YYYY-MM-DD)": "1991-04-12", "Emergency Contact": "9000000002", Skills: "INFRASTRUCTURE,FIRE_SAFETY", "Supported Regions": "EAST,PATNA" },
    notes: ["Skills: comma separated from INFRASTRUCTURE, ELECTRICAL, FIRE_SAFETY, THERMOGRAPHY. Track A is usually infrastructure and fire; Track B electrical and thermography.", "Supported Regions: zones, regional offices or states, or ALL_INDIA. Leave blank to allow any region.", "Each auditor is created ready for training. Send the login from the auditor's page once they are ready to start."],
  },
  users: {
    sheet: "Users", file: "users-template.xlsx",
    columns: ["Role", "Full Name", "Email", "Company", "Zone", "Regional Office", "Location Code"],
    example: { Role: "SITE_USER", "Full Name": "Sanjay Kumar", Email: "sanjay@example.com", Company: "M&M - NORTH", Zone: "East", "Regional Office": "Patna", "Location Code": "NORTH-GAYA" },
    notes: ["Role: CORPORATE_MANAGER (needs Company), ZONAL_MANAGER (needs Company and Zone), REGIONAL_MANAGER (needs Company, Zone and Regional Office), SITE_INCHARGE or SITE_USER (need Company and Location Code).", "Company is matched by name and Location Code by the site's code. An email that already exists is skipped."],
  },
};

exports.template = (req, res, next) => {
  try {
    const kind = KINDS[req.params.kind];
    if (!kind) throw badRequest("Unknown import type.");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([kind.example], { header: kind.columns }), kind.sheet);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["How to use"], ...kind.notes.map((n) => [n]), ["Delete the example row before you upload."]]), "Read Me");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${kind.file}"`);
    res.send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  } catch (e) { next(e); }
};

const summarise = (results, extra = {}) => {
  const count = (s) => results.filter((r) => r.status === s).length;
  return { rows: results.length, created: count("CREATED"), updated: count("UPDATED"), skipped: count("SKIPPED"), errors: count("ERROR"), ...extra };
};

const importCompanies = async (rows, { dryRun, update }) => {
  const results = []; const seen = new Set();
  const existing = await prisma.company.findMany({ select: { id: true, companyName: true } });
  const byName = new Map(existing.map((c) => [c.companyName.trim().toLowerCase(), c]));
  for (const [i, row] of rows.entries()) {
    const line = i + 2; const name = str(row["Company Name"]); const key = name.toLowerCase();
    if (!name) { results.push({ line, status: "ERROR", message: "Company Name is missing." }); continue; }
    if (seen.has(key)) { results.push({ line, key: name, status: "SKIPPED", message: "Duplicate of an earlier row in this file." }); continue; }
    seen.add(key);
    const data = { email: str(row.Email) || null, address: str(row.Address) || null, contactName: str(row["Contact Name"]) || null, contactPhone: str(row["Contact Phone"]) || null, po_no: str(row["PO No"]) || null };
    const found = byName.get(key);
    if (found && !update) { results.push({ line, key: name, status: "SKIPPED", message: "A company with this name already exists." }); continue; }
    if (found) {
      const changes = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
      if (!dryRun && Object.keys(changes).length) await prisma.company.update({ where: { id: found.id }, data: changes });
      results.push({ line, key: name, status: "UPDATED", message: Object.keys(changes).length ? "Details updated." : "Nothing to change." });
      continue;
    }
    if (!dryRun) await prisma.company.create({ data: { companyName: name, ...data } });
    results.push({ line, key: name, status: "CREATED", message: "Company added." });
  }
  return { results };
};

const importAuditors = async (rows, { dryRun, userId }) => {
  const results = []; const seen = new Set();
  for (const [i, row] of rows.entries()) {
    const line = i + 2; const email = str(row.Email).toLowerCase(); const name = str(row["Full Name"]);
    if (!name && !email) continue;
    if (seen.has(email)) { results.push({ line, key: email, status: "SKIPPED", message: "Duplicate email in this file." }); continue; }
    seen.add(email);
    const body = { fullName: name, email, phone: row.Phone, baseLocation: row["Base Location"], dateOfBirth: str(row["Date of Birth (YYYY-MM-DD)"]), emergencyContact: row["Emergency Contact"], skills: str(row.Skills), supportedRegions: str(row["Supported Regions"]) };
    try {
      if (dryRun) {
        if (!name) throw badRequest("Full name is required.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("A valid email is required.");
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) { results.push({ line, key: email, status: "SKIPPED", message: "A user with this email already exists." }); continue; }
        const bad = str(row.Skills).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).filter((s) => !["INFRASTRUCTURE", "ELECTRICAL", "FIRE_SAFETY", "THERMOGRAPHY"].includes(s));
        if (bad.length) throw badRequest(`Unknown skill: ${bad.join(", ")}.`);
        results.push({ line, key: email, status: "CREATED", message: `${name} will be added.` });
      } else {
        const { username } = await auditorHelpers.createAuditor(body, userId);
        results.push({ line, key: email, status: "CREATED", message: `${name} added (username ${username}).`, username });
      }
    } catch (error) {
      if (/already exists/.test(error.message)) results.push({ line, key: email, status: "SKIPPED", message: error.message });
      else results.push({ line, key: email, status: "ERROR", message: error.message });
    }
  }
  return { results };
};

const importUsers = async (rows, { dryRun }) => {
  const results = []; const seen = new Set();
  const companies = await prisma.company.findMany({ select: { id: true, companyName: true } });
  const companyByName = new Map(companies.map((c) => [c.companyName.trim().toLowerCase(), c]));
  const credentials = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2; const email = str(row.Email).toLowerCase(); const role = str(row.Role).toUpperCase();
    if (!email && !str(row["Full Name"])) continue;
    if (seen.has(email)) { results.push({ line, key: email, status: "SKIPPED", message: "Duplicate email in this file." }); continue; }
    seen.add(email);
    try {
      const company = companyByName.get(str(row.Company).toLowerCase());
      if (!company) throw badRequest(`Company "${str(row.Company)}" was not found. Add it first.`);
      const scope = { companyId: company.id, zone: str(row.Zone), regionalOffice: str(row["Regional Office"]) };
      if (str(row["Location Code"])) {
        const site = await prisma.dealerLocation.findFirst({ where: { locationCode: str(row["Location Code"]).toUpperCase(), programme: { companyId: company.id } }, select: { id: true, zone: true, regionalOffice: true } });
        if (!site) throw badRequest(`Site ${str(row["Location Code"])} was not found in ${company.companyName}.`);
        scope.locationId = site.id; scope.zone = scope.zone || site.zone; scope.regionalOffice = scope.regionalOffice || site.regionalOffice;
      }
      if (dryRun) {
        if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) { results.push({ line, key: email, status: "SKIPPED", message: "A user with this email already exists." }); continue; }
        const need = { CORPORATE_MANAGER: "companyId", ZONAL_MANAGER: "zone", REGIONAL_MANAGER: "regionalOffice", SITE_INCHARGE: "locationId", SITE_USER: "locationId" }[role];
        if (!need) throw badRequest("Choose a valid role.");
        if (!scope[need]) throw badRequest(`${role} needs ${need === "locationId" ? "a Location Code" : need === "regionalOffice" ? "a Regional Office" : need === "companyId" ? "a Company" : "a Zone"}.`);
        results.push({ line, key: email, status: "CREATED", message: `${str(row["Full Name"])} will be added as ${role}.` });
      } else {
        const created = await governanceHelpers.createScopedUser({ fullName: row["Full Name"], email, role, scope });
        credentials.push({ email, username: created.username, password: created.password, role });
        results.push({ line, key: email, status: "CREATED", message: `${str(row["Full Name"])} added as ${role}.` });
      }
    } catch (error) {
      if (/already exists/.test(error.message)) results.push({ line, key: email, status: "SKIPPED", message: error.message });
      else results.push({ line, key: email, status: "ERROR", message: error.message });
    }
  }
  return { results, credentials };
};

exports.importFile = async (req, res, next) => {
  try {
    const kind = KINDS[req.params.kind];
    if (!kind) throw badRequest("Unknown import type.");
    if (!req.file) throw badRequest("Upload an Excel file.");
    const rows = sheetRows(req.file, kind.sheet);
    if (!rows.length) throw badRequest(`The '${kind.sheet}' sheet is empty.`);
    const options = { dryRun: String(req.body.dryRun) === "true", update: String(req.body.mode || "").toUpperCase() === "UPDATE", userId: req.user?.id };
    const run = { companies: importCompanies, auditors: importAuditors, users: importUsers }[req.params.kind];
    const { results, credentials } = await run(rows, options);
    res.json({ success: true, dryRun: options.dryRun, totals: summarise(results), results, ...(credentials?.length ? { credentials } : {}) });
  } catch (e) { next(e); }
};
