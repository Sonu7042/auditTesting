// Builds the audit report Word document (.docx) from structured report data. One layout serves every audit type:
// a single discipline (electrical, fire, infrastructure, thermography) or any combination. Every font is Arial.
// Anything in [square brackets] is a placeholder meant to be completed in Word.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, BorderStyle, Header, Footer,
  PageNumber, ImageRun, PageOrientation, SectionType, LevelFormat, VerticalAlign, TableLayoutType, Bookmark, PageReference, HeightRule, PageBreak,
} = require("docx");

const FONT = "Arial";
const PORTRAIT = { w: 11906, h: 16838, margin: 720 };
const CONTENT_P = PORTRAIT.w - PORTRAIT.margin * 2; // 10466
const CONTENT_L = PORTRAIT.h - PORTRAIT.margin * 2; // 15398
const AMBER = "FFC000"; const BAND = "B4D0FE"; const SOFT = "DEEAF6";
const LEVEL_FILL = { 0: "FF0000", 1: "F4B083", 2: "FFFF00", 3: "92D050", NA: "D9D9D9" };
const RISK_FILL = { "High Risk": "FF0000", "Medium Risk": "F4B083", "Low Risk": "92D050" };
const PRIORITY_FILL = { P1: "FF0000", P2: "F4B083", P3: "FFFF00" };
const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const BORDERS = { top: thin, bottom: thin, left: thin, right: thin };
const NO_BORDERS = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

const isPlaceholder = (t) => /^\[.*\]$/.test(String(t || "").trim());

// ---- primitives ---------------------------------------------------------------------------
const run = (text, o = {}) => new TextRun({ text: String(text ?? ""), font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics ?? (isPlaceholder(text) ? true : undefined), color: o.color || (isPlaceholder(text) ? "7F7F7F" : "000000"), underline: o.underline ? {} : undefined, break: o.break });
const para = (content, o = {}) => new Paragraph({
  alignment: o.align || AlignmentType.LEFT,
  spacing: { before: o.before ?? 0, after: o.after ?? 80, line: o.line || 264 },
  keepNext: o.keepNext, pageBreakBefore: o.pageBreakBefore, indent: o.indent, numbering: o.numbering, border: o.border,
  children: Array.isArray(content) ? content : [run(content, o)],
});
const bullet = (text, o = {}) => para([run(text, o)], { numbering: { reference: "bullets", level: 0 }, after: 60 });
const spacer = (after = 120) => para("", { after });

const cell = (content, o = {}) => new TableCell({
  width: { size: o.width, type: WidthType.DXA },
  columnSpan: o.span,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
  verticalAlign: o.v || VerticalAlign.CENTER,
  margins: { top: 50, bottom: 50, left: 90, right: 90 },
  borders: o.borders || BORDERS,
  children: (Array.isArray(content) ? content : [content]).map((c) => (typeof c === "string" ? para(c, { align: o.align, size: o.size || 18, bold: o.bold, after: 0 }) : c)),
});
const row = (cells, o = {}) => new TableRow({ children: cells, tableHeader: o.header, cantSplit: o.cantSplit ?? true, height: o.height ? { value: o.height, rule: HeightRule.ATLEAST } : undefined });
const table = (widths, rows, o = {}) => new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, alignment: o.align, rows });
const headerRow = (widths, labels, size = 17) => row(labels.map((l, i) => cell(l, { width: widths[i], fill: AMBER, bold: true, align: AlignmentType.CENTER, size })), { header: true });

// ---- images -------------------------------------------------------------------------------
const fitImage = (img, maxW, maxH) => {
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  return { width: Math.max(20, Math.round(img.width * ratio)), height: Math.max(20, Math.round(img.height * ratio)) };
};
const imageRun = (img, maxW, maxH) => new ImageRun({ type: img.type, data: img.data, transformation: fitImage(img, maxW, maxH), altText: { title: "Audit photograph", description: "Audit photograph", name: "photo" } });
const imageParas = (img, maxW, maxH, placeholder) => (img ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 40 }, children: [imageRun(img, maxW, maxH)] })] : [para(placeholder || "[Insert photograph]", { align: AlignmentType.CENTER, size: 16, after: 0 })]);

// ---- page furniture -----------------------------------------------------------------------
const pageHeader = (d) => new Header({
  children: [table([2300, CONTENT_P - 2300 - 3200, 3200], [row([
    cell(d.issuer.logo ? [new Paragraph({ children: [imageRun(d.issuer.logo, 100, 50)] })] : [para("[Company logo]", { size: 16, after: 0 })], { width: 2300, borders: NO_BORDERS }),
    cell(para(d.title, { align: AlignmentType.CENTER, bold: true, size: 22, after: 0 }), { width: CONTENT_P - 2300 - 3200, borders: NO_BORDERS }),
    cell([para("REPORT NO:", { align: AlignmentType.RIGHT, bold: true, size: 16, after: 0 }), para(d.reportNo, { align: AlignmentType.RIGHT, size: 16, after: 0 })], { width: 3200, borders: NO_BORDERS }),
  ])])],
});
const pageFooter = (d, width) => new Footer({
  children: [new Paragraph({
    spacing: { before: 60, after: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: AMBER, space: 4 } },
    children: [
      run(`Report No: ${d.reportNo}      © Copyright ${d.issuer.short} - ${d.year}      Page No: `, { size: 15 }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15 }), run(" of ", { size: 15 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 15 }),
      run(`      Annexure 1 / Version 1.0 / ${d.templateDate}`, { size: 15 }),
    ],
  })],
});
const emptyHeader = () => new Header({ children: [new Paragraph({ children: [] })] });
const emptyFooter = () => new Footer({ children: [new Paragraph({ children: [] })] });

const heading = (text, id, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 120, after: 140 }, keepNext: true, pageBreakBefore: o.pageBreakBefore, alignment: o.align || AlignmentType.LEFT,
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AMBER, space: 3 } },
  children: [id ? new Bookmark({ id, children: [run(text, { bold: true, size: 26 })] }) : run(text, { bold: true, size: 26 })],
});
const subHeading = (text, o = {}) => para([run(text, { bold: true, size: 22 })], { before: o.before ?? 120, after: 80, keepNext: true });

// ---- sections -----------------------------------------------------------------------------
const coverSection = (d) => {
  const siteRows = [["SAP Code", d.site.sapCode], ["Parent Code", d.site.parentCode], ["Location Code", d.site.locationCode], ["Dealership Name", d.site.dealerName], ["Address", d.site.address], ["Type", d.site.type], ["Zone", d.site.zone], ["Regional Office", d.site.regionalOffice], ["State", d.site.state], ["City/Town", d.site.city]];
  const cw = [2600, 4800];
  const children = [
    para([run("REPORT NO:", { bold: true, size: 16 })], { align: AlignmentType.RIGHT, after: 0 }),
    para([run(d.reportNo, { size: 16 })], { align: AlignmentType.RIGHT, after: 200 }),
    para([run(d.title, { bold: true, size: 44 })], { align: AlignmentType.CENTER, after: 80, line: 300 }),
    ...(d.subtitle ? [para([run(d.subtitle, { size: 20, color: "404040" })], { align: AlignmentType.CENTER, after: 80 })] : []),
    para([run(`Date of Visit: ${d.visitDate}`, { bold: true, size: 24 })], { align: AlignmentType.CENTER, before: 160, after: 360 }),
    para([run("PREPARED FOR", { bold: true, size: 24, underline: true })], { align: AlignmentType.CENTER, after: 160 }),
    table(cw, siteRows.map(([k, v]) => row([cell(k, { width: cw[0], bold: true, size: 20 }), cell(v, { width: cw[1], size: 20 })], { height: 400 })), { align: AlignmentType.CENTER }),
    para([run("CONDUCTED & PREPARED BY", { bold: true, size: 24, underline: true })], { align: AlignmentType.CENTER, before: 320, after: 120 }),
    d.issuer.logo
      ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [imageRun(d.issuer.logo, 200, 99)] })
      : para("[Company logo]", { align: AlignmentType.CENTER, size: 22, after: 100 }),
    para([run(d.issuer.name, { bold: true, size: 28 })], { align: AlignmentType.CENTER, after: 40 }),
    para([run(d.issuer.address, { size: 20 })], { align: AlignmentType.CENTER, after: 280 }),
    para([run("DOCUMENT CONTROL SHEET", { bold: true, size: 22 })], { after: 100, keepNext: true }),
  ];
  const dw = [1200, 1500, 2700, 1700, 1700, 1666];
  children.push(table(dw, [
    headerRow(dw, ["Revision No.", "Date", "Revision History", "Prepared By", "Reviewed By", "Authorised By"]),
    row([d.control.no, d.control.date, d.control.history, d.control.preparedBy, d.control.reviewedBy, d.control.authorisedBy].map((v, i) => cell(v, { width: dw[i], align: i < 2 ? AlignmentType.CENTER : undefined })), { height: 420 }),
  ]));
  children.push(
    para([run("Disclaimer:", { bold: true, size: 18 })], { before: 280, after: 40 }),
    para("This report is issued within the scope of contract, documents submitted and does not perpetuate into compliance to any statutory regulations and / or acts. The observations relate to the conditions seen and the records produced on the day of the visit.", { size: 18 }),
    para("Copying this report without the permission is not permitted.", { size: 18 }),
  );
  return { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PORTRAIT.w, height: PORTRAIT.h }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, headers: { default: emptyHeader() }, footers: { default: emptyFooter() }, children };
};

const indexTable = (entries) => {
  const w = [8000, CONTENT_P - 8000];
  return table(w, [
    headerRow(w, ["TOPIC", "PAGE NO"], 20),
    ...entries.map(([label, id]) => row([cell(label, { width: w[0], size: 19 }), cell(new Paragraph({ alignment: AlignmentType.CENTER, children: [new PageReference(id)] }), { width: w[1], align: AlignmentType.CENTER })])),
  ]);
};

const summarySection = (d, entries) => {
  const c = [];
  c.push(heading("INDEX", "idx_index"), indexTable(entries));

  c.push(heading("ACKNOWLEDGEMENT", "idx_ack", { pageBreakBefore: true }));
  c.push(para(`We are thankful to the management and employees of ${d.client.name} for their cooperation during the ${d.scopeLabel.toLowerCase()} and appreciate the courtesy extended to our audit team throughout the visit. [Add any further acknowledgement.]`, { size: 20, line: 300 }));
  c.push(para(`- ${d.issuer.name}`, { align: AlignmentType.RIGHT, bold: true, before: 200 }));

  c.push(heading(`ABOUT ${d.issuer.brand.toUpperCase()}`, "idx_about", { before: 360 }));
  (d.issuer.about.length ? d.issuer.about : [{ text: "[Company profile]", bullet: false }]).forEach((p) => c.push(p.bullet ? bullet(p.text, { size: 19 }) : para(p.text, { size: 19, line: 288, after: 100 })));

  // Audit visit details: when it was planned and done, who, and where (GPS), with the front facade photograph.
  c.push(heading("AUDIT VISIT DETAILS", "idx_visit", { pageBreakBefore: true }));
  const vw = [3300, CONTENT_P - 3300];
  c.push(table(vw, d.visit.rows.map(([k, v]) => row([cell(k, { width: vw[0], bold: true, fill: SOFT, size: 19 }), cell(v, { width: vw[1], size: 19 })], { height: 380 }))));
  if (d.visit.mapUrl) c.push(para([run("Map: ", { bold: true, size: 17 }), run(d.visit.mapUrl, { size: 17, color: "1155CC" })], { before: 80, after: 160 }));
  c.push(subHeading("Site front facade", { before: 160 }));
  c.push(para("First photograph taken by the auditor on arrival, at the check-in location above.", { size: 18, after: 100 }));
  c.push(table([CONTENT_P], [row([cell(imageParas(d.visit.facade, 480, 320, "[Insert site front facade photograph]"), { width: CONTENT_P })], { height: 3600 })]));

  // Executive summary
  c.push(heading("EXECUTIVE SUMMARY", "idx_exec", { pageBreakBefore: true }));
  c.push(subHeading("Key Audit Observations:", { before: 0 }));
  if (d.keyObservations.length) d.keyObservations.forEach((t, i) => c.push(para([run(`${i + 1}. `, { bold: true }), run(t)], { after: 60, indent: { left: 280, hanging: 280 } })));
  else c.push(para("[Key audit observations]", { after: 60 }));
  c.push(para([run("Conclusion: ", { bold: true }), run(d.conclusion)], { before: 160, after: 160, line: 300 }));

  if (d.disciplineScores.length > 1) {
    c.push(subHeading("Score by audit type"));
    const w = [4200, 2000, 2200, 2066];
    c.push(table(w, [
      headerRow(w, ["Audit type", "Score", "Risk level", "Non-compliances"], 18),
      ...d.disciplineScores.map((s) => row([cell(s.label, { width: w[0], size: 19 }), cell(s.percentText, { width: w[1], align: AlignmentType.CENTER, size: 19 }), cell(s.risk, { width: w[2], align: AlignmentType.CENTER, size: 19, fill: RISK_FILL[s.risk] }), cell(String(s.nc), { width: w[3], align: AlignmentType.CENTER, size: 19 })])),
    ]));
  }

  c.push(para([run("Final Score", { bold: true, size: 26 })], { before: 240, after: 40, keepNext: true }));
  c.push(para([run(d.overall.percentText, { bold: true, size: 30 })], { after: 120 }));
  c.push(para([run("Risk Level", { bold: true, size: 26 })], { after: 40, keepNext: true }));
  c.push(table([2600], [row([cell(d.overall.risk, { width: 2600, fill: RISK_FILL[d.overall.risk], bold: true, align: AlignmentType.CENTER, size: 22 })], { height: 420 })]));
  c.push(spacer(120));
  const rw = [4000, 3000];
  c.push(table(rw, [
    headerRow(rw, ["Score Reference", "Priority"], 18),
    row([cell("0 - 25%", { width: rw[0], align: AlignmentType.CENTER, size: 18 }), cell("High Risk", { width: rw[1], fill: RISK_FILL["High Risk"], align: AlignmentType.CENTER, size: 18 })]),
    row([cell("> 25 - 75%", { width: rw[0], align: AlignmentType.CENTER, size: 18 }), cell("Medium Risk", { width: rw[1], fill: RISK_FILL["Medium Risk"], align: AlignmentType.CENTER, size: 18 })]),
    row([cell("> 75%", { width: rw[0], align: AlignmentType.CENTER, size: 18 }), cell("Low Risk", { width: rw[1], fill: RISK_FILL["Low Risk"], align: AlignmentType.CENTER, size: 18 })]),
  ]));
  c.push(para([run("Action Priority Guidelines -", { bold: true })], { before: 200, after: 60, keepNext: true }));
  c.push(para([run("Priority 1 (P1) - ", { bold: true, size: 19 }), run("Critical observations leading to a fire scenario, absence of fire mitigation systems or inadequate capacity of the installation.", { size: 19 })], { after: 40 }));
  c.push(para([run("Priority 2 (P2) - ", { bold: true, size: 19 }), run("Legal compliance related gaps and any major risk observations.", { size: 19 })], { after: 40 }));
  c.push(para([run("Priority 3 (P3) - ", { bold: true, size: 19 }), run("Minor risk observations without the potential to cause a fire risk, and documentation gaps.", { size: 19 })], { after: 40 }));

  // Summary report
  c.push(heading("SUMMARY REPORT", "idx_summary", { pageBreakBefore: true }));
  c.push(subHeading("Key Audit Observations:", { before: 0 }));
  if (d.keyObservations.length) d.keyObservations.forEach((t) => c.push(bullet(t)));
  else c.push(bullet("[Key audit observation]"));
  c.push(subHeading("Conclusion"));
  c.push(bullet("Whether the Dealer has non-compliance (L0 / L1) in Critical questions"));
  c.push(para([run(d.criticalNc ? "Yes   ✓          No   ☐" : "Yes   ☐          No   ✓", { bold: true }), run("      (Tick the appropriate one)", { size: 18 })], { indent: { left: 360 }, after: 100 }));
  c.push(bullet("If yes, mention the areas of non-compliance (L0 / L1) in Critical questions:"));
  if (d.criticalAreas.length) d.criticalAreas.forEach((t) => c.push(para([run("– " + t)], { indent: { left: 720 }, after: 40 })));
  else c.push(para([run(d.criticalNc ? "[Areas of critical non-compliance]" : "Not applicable.")], { indent: { left: 720 }, after: 40 }));

  // Pictorial evidence
  c.push(heading("PICTORIAL EVIDENCE", "idx_pics", { pageBreakBefore: true }));
  const pw = [700, 4533, 700, 4533];
  const picRows = [headerRow(pw, ["Sl. No.", "Picture", "Sl. No.", "Picture"], 18)];
  for (let i = 0; i < d.pictures.length; i += 2) {
    const a = d.pictures[i]; const b = d.pictures[i + 1];
    picRows.push(row([
      cell(String(i + 1), { width: pw[0], align: AlignmentType.CENTER, bold: true }),
      cell(imageParas(a.image, 270, 200), { width: pw[1], v: VerticalAlign.CENTER }),
      cell(b ? String(i + 2) : "", { width: pw[2], align: AlignmentType.CENTER, bold: true }),
      cell(b ? imageParas(b.image, 270, 200) : [para("", { after: 0 })], { width: pw[3] }),
    ], { height: 2900 }));
    picRows.push(row([
      cell("", { width: pw[0] }), cell(a.caption, { width: pw[1], align: AlignmentType.CENTER, size: 17 }),
      cell("", { width: pw[2] }), cell(b ? b.caption : "", { width: pw[3], align: AlignmentType.CENTER, size: 17 }),
    ]));
  }
  c.push(table(pw, picRows));
  return { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PORTRAIT.w, height: PORTRAIT.h }, margin: { top: 1300, right: 720, bottom: 900, left: 720, header: 500, footer: 400 } } }, headers: { default: pageHeader(d) }, footers: { default: pageFooter(d) }, children: c };
};

const LEVELS = [
  ["0 – Non-Compliance:", "No evidence of adherence to required safety standards or procedures."],
  ["1 – Partial Compliance with Major Observations:", "Some elements of compliance are present, but significant safety gaps or violations exist that require immediate attention."],
  ["2 – Partial Compliance with Minor Observations:", "Mostly compliant, with minor issues that do not pose immediate safety risks but need correction."],
  ["3 – Compliance:", "Full adherence to all relevant safety standards, procedures and practices. No significant observations."],
  ["NA – Not Applicable:", "The requirement does not apply to the specific area, process or situation being assessed."],
];

const checkSheet = (d, sec, first) => {
  const c = [];
  c.push(heading(`${sec.label.toUpperCase()} CHECK SHEET`, `idx_check_${sec.key}`, { pageBreakBefore: !first, before: 0 }));
  c.push(subHeading("Assessed Levels of Compliance", { before: 0 }));
  LEVELS.forEach(([k, v]) => c.push(para([run(k + " ", { bold: true, size: 18 }), run(v, { size: 18 })], { after: 30 })));
  c.push(spacer(100));
  const w = [650, 1050, 4200, 2500, 1200, CONTENT_L - 650 - 1050 - 4200 - 2500 - 1200];
  const rows = [headerRow(w, ["S. No", "Question Type", "Question", "Document Required on Audit Day", "Assessed Level", "Auditor's Observations"])];
  if (!sec.categories.length) rows.push(row([cell("[No checklist items in this scope]", { width: CONTENT_L, span: 6, align: AlignmentType.CENTER })]));
  for (const cat of sec.categories) {
    rows.push(row([cell(cat.name, { width: CONTENT_L, span: 6, fill: BAND, bold: true, size: 18 })], { cantSplit: true }));
    for (const r of cat.rows) {
      rows.push(row([
        cell(String(r.sno), { width: w[0], align: AlignmentType.CENTER }),
        cell(r.type, { width: w[1], align: AlignmentType.CENTER }),
        cell([para(r.question, { size: 17, after: r.code ? 20 : 0 }), ...(r.code ? [para(r.code, { size: 14, color: "7F7F7F", after: 0 })] : [])], { width: w[2], v: VerticalAlign.TOP }),
        cell(r.document, { width: w[3], size: 16, v: VerticalAlign.TOP }),
        cell(String(r.level), { width: w[4], align: AlignmentType.CENTER, bold: true, fill: LEVEL_FILL[r.level] }),
        cell(r.observation, { width: w[5], size: 16, v: VerticalAlign.TOP }),
      ], { cantSplit: false }));
    }
  }
  c.push(table(w, rows));
  return c;
};

const actionList = (d) => {
  const c = [];
  c.push(heading(`${d.scopeLabel.toUpperCase()} ACTION PRIORITY LIST`, "idx_actions", { pageBreakBefore: true, before: 0 }));
  c.push(para([run("Priority 1 (P1) ", { bold: true, size: 18 }), run("– Critical observations leading to a fire scenario, absence of fire mitigation, inadequate capacity.", { size: 18 })], { after: 30 }));
  c.push(para([run("Priority 2 (P2) ", { bold: true, size: 18 }), run("– Legal compliance related gaps, any major risk observations.", { size: 18 })], { after: 30 }));
  c.push(para([run("Priority 3 (P3) ", { bold: true, size: 18 }), run("– Minor risk observations not having potential to cause fire risk, documentation gaps.", { size: 18 })], { after: 120 }));
  const w = [600, 1000, 2800, 3200, 1000, 1750, 1500, 1300, 1250, CONTENT_L - 600 - 1000 - 2800 - 3200 - 1000 - 1750 - 1500 - 1300 - 1250];
  const rows = [headerRow(w, ["Sr. No.", "Reference Question No.", "Observations", "Recommendations / Actionable Points", "Action Priority", "Photographs", "Action Plan", "Responsibility", "Target Date", "Status Open / Close"], 16)];
  if (!d.actions.length) rows.push(row([cell("[No open actions]", { width: CONTENT_L, span: 10, align: AlignmentType.CENTER })]));
  d.actions.forEach((a, i) => rows.push(row([
    cell(String(i + 1), { width: w[0], align: AlignmentType.CENTER }),
    cell(a.ref, { width: w[1], align: AlignmentType.CENTER }),
    cell(a.observation, { width: w[2], size: 16, v: VerticalAlign.TOP }),
    cell(a.recommendation, { width: w[3], size: 16, v: VerticalAlign.TOP }),
    cell(a.priorityLabel, { width: w[4], align: AlignmentType.CENTER, fill: PRIORITY_FILL[a.priority], size: 16, bold: true }),
    cell(imageParas(a.image, 120, 90, "NA"), { width: w[5] }),
    cell(a.actionPlan, { width: w[6], size: 16 }),
    cell(a.responsibility, { width: w[7], size: 16 }),
    cell(a.targetDate, { width: w[8], size: 16, align: AlignmentType.CENTER }),
    cell(a.status, { width: w[9], size: 16, align: AlignmentType.CENTER }),
  ], { cantSplit: false })));
  c.push(table(w, rows));
  return c;
};

const simpleTable = (title, id, widths, labels, rows, o = {}) => {
  const c = [heading(title, id, { pageBreakBefore: true, before: 0 })];
  if (o.note) c.push(para(o.note, { size: 18, after: 120 }));
  const total = widths.reduce((a, b) => a + b, 0);
  const trs = [headerRow(widths, labels, 17)];
  rows.forEach((r) => trs.push(row(r.map((v, i) => (v && v.image !== undefined ? cell(imageParas(v.image, 150, 110, "[Thermal image]"), { width: widths[i] }) : cell(v ?? "", { width: widths[i], size: 17, align: i === 0 ? AlignmentType.CENTER : undefined }))), { height: o.rowHeight })));
  c.push(table(widths, trs));
  void total;
  return c;
};

const annexures = (d) => {
  const c = [];
  const L = CONTENT_L;
  if (d.annex.earthLoop) c.push(...simpleTable("EARTH LOOP RESISTANCE REPORT", "idx_earth", [700, 3600, 3600, 2200, L - 700 - 3600 - 3600 - 2200], ["Sl No", "Location", "Equipment Id", "Resistance (Ω)", "Remark (OK / NOT OK)"], d.annex.earthLoop, { rowHeight: 380 }));
  if (d.annex.thermography) c.push(...simpleTable("THERMOGRAPHY REPORT", "idx_thermo", [700, 2300, 2700, 3000, 1800, L - 700 - 2300 - 2700 - 3000 - 1800], ["Sr no", "Area name", "Panel / asset name", "Image", "Recorded Temp. (ºC)", "Remarks"], d.annex.thermography, { rowHeight: 1500 }));
  if (d.annex.powerQuality) c.push(...simpleTable("POWER QUALITY REPORT SUMMARY", "idx_pq", [700, 3000, 3200, 2400, 2400, L - 700 - 3000 - 3200 - 2400 - 2400], ["Sr. No.", "Area", "Parameter", "Measured", "Limit", "Remark"], d.annex.powerQuality, { rowHeight: 380 }));
  if (d.annex.fireRegister) c.push(...simpleTable("FIRE PROTECTION EQUIPMENT REGISTER", "idx_fire_reg", [700, 3400, 3000, 2200, 2200, L - 700 - 3400 - 3000 - 2200 - 2200], ["Sr. No.", "Equipment / system", "Location", "Last tested", "Next due", "Status"], d.annex.fireRegister, { rowHeight: 380 }));
  return c;
};

const checksSection = (d) => {
  const c = [];
  d.sections.forEach((sec, i) => c.push(...checkSheet(d, sec, i === 0)));
  c.push(...actionList(d));
  c.push(...annexures(d));
  return { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PORTRAIT.w, height: PORTRAIT.h, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1300, right: 720, bottom: 900, left: 720, header: 500, footer: 400 } } }, headers: { default: pageHeader({ ...d }) }, footers: { default: pageFooter(d) }, children: c };
};

const referenceSection = (d) => {
  const c = [];
  c.push(heading("LIST OF ABBREVIATIONS USED IN REPORT", "idx_abbr", { before: 0 }));
  d.abbreviations.forEach(([a, b]) => c.push(para([run(`${a}: `, { bold: true, size: 19 }), run(b, { size: 19 })], { after: 30 })));
  c.push(heading("EQUIPMENTS USED", "idx_equip", { before: 280 }));
  d.equipment.forEach((t) => c.push(bullet(t, { size: 19 })));
  c.push(heading("STANDARDS REFERRED", "idx_std", { before: 280 }));
  d.standards.forEach((t) => c.push(bullet(t, { size: 19 })));
  c.push(para([run("*** END OF REPORT ***", { bold: true })], { align: AlignmentType.CENTER, before: 400 }));
  return { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PORTRAIT.w, height: PORTRAIT.h }, margin: { top: 1300, right: 720, bottom: 900, left: 720, header: 500, footer: 400 } } }, headers: { default: pageHeader(d) }, footers: { default: pageFooter(d) }, children: c };
};

// The index lists the headings that exist in this particular report.
const indexEntries = (d) => {
  const e = [["ACKNOWLEDGEMENT", "idx_ack"], [`ABOUT ${d.issuer.brand.toUpperCase()}`, "idx_about"], ["AUDIT VISIT DETAILS", "idx_visit"], ["EXECUTIVE SUMMARY", "idx_exec"], ["FINAL SCORE / RISK LEVEL", "idx_exec"], ["SUMMARY REPORT", "idx_summary"], ["PICTORIAL EVIDENCE", "idx_pics"]];
  d.sections.forEach((s) => e.push([`${s.label.toUpperCase()} CHECK SHEET`, `idx_check_${s.key}`]));
  e.push([`${d.scopeLabel.toUpperCase()} ACTION PRIORITY LIST`, "idx_actions"]);
  if (d.annex.earthLoop) e.push(["EARTH LOOP RESISTANCE REPORT", "idx_earth"]);
  if (d.annex.thermography) e.push(["THERMOGRAPHY REPORT", "idx_thermo"]);
  if (d.annex.powerQuality) e.push(["POWER QUALITY REPORT SUMMARY", "idx_pq"]);
  if (d.annex.fireRegister) e.push(["FIRE PROTECTION EQUIPMENT REGISTER", "idx_fire_reg"]);
  e.push(["LIST OF ABBREVIATIONS USED IN REPORT", "idx_abbr"], ["EQUIPMENTS USED", "idx_equip"], ["STANDARDS REFERRED", "idx_std"]);
  return e;
};

// `only` (section numbers, 0-3) is for previewing a single part of the document while developing.
const buildAuditReportDocx = async (d, { only } = {}) => {
  const doc = new Document({
    creator: d.issuer.name, title: d.title, description: d.scopeLabel,
    features: { updateFields: true },
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { font: FONT } } }] }] },
    sections: [coverSection(d), summarySection(d, indexEntries(d)), checksSection(d), referenceSection(d)].filter((_, i) => !only || only.includes(i)),
  });
  return Packer.toBuffer(doc);
};

module.exports = { buildAuditReportDocx, PageBreak };
