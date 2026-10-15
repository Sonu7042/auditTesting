// Renders the same audit report as the Word template, as a PDF that can be viewed in the browser.
// It uses the identical report data (see auditReportData.js), so the Word and PDF versions match.
const fs = require("fs");
const PDFDocument = require("pdfkit");

const AMBER = "#FFC000"; const BAND = "#B4D0FE"; const SOFT = "#DEEAF6";
const LEVEL_FILL = { 0: "#FF0000", 1: "#F4B083", 2: "#FFFF00", 3: "#92D050", NA: "#D9D9D9" };
const RISK_FILL = { "High Risk": "#FF0000", "Medium Risk": "#F4B083", "Low Risk": "#92D050" };
const PRIORITY_FILL = { P1: "#FF0000", P2: "#F4B083", P3: "#FFFF00" };
const PORTRAIT = { w: 595.28, h: 841.89 };
const M = 36; // 0.5 inch, as in the Word template
const TOP = 70; const BOTTOM_RESERVE = 52;
const tw = (twips) => twips / 20;

// Fonts: the PDF uses Helvetica; the Word file uses Arial (same metrics, and present on every Windows and Mac).
// Helvetica is built into every PDF reader, so the PDF needs no embedded font.
const registerFonts = (doc) => {
  doc.registerFont("R", "Helvetica"); doc.registerFont("B", "Helvetica-Bold"); doc.registerFont("I", "Helvetica-Oblique");
  return false;
};

// Characters outside the PDF font's range are replaced with readable text.
const S = (v) => String(v ?? "").replace(/Ω/g, "ohm").replace(/Δ/g, "Delta ").replace(/[✓✔]/g, "Yes").replace(/☐/g, "").replace(/≤/g, "<=").replace(/≥/g, ">=");
const isPlaceholder = (t) => /^\[.*\]$/.test(String(t || "").trim());

const renderAuditReportPdf = (d, res) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: d.title, Author: d.issuer.name, Subject: d.scopeLabel } });
  registerFonts(doc);
  doc.pipe(res);
  res.on("finish", resolve); res.on("error", reject); doc.on("error", reject);

  const L = { y: 0, w: PORTRAIT.w, h: PORTRAIT.h, landscape: false };
  const anchors = {}; const indexSlots = [];
  const pageIndex = () => doc.bufferedPageRange().count - 1;
  const bottom = () => L.h - BOTTOM_RESERVE;
  const innerW = () => L.w - M * 2;

  const addPage = (landscape = false, chrome = true) => {
    doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 0 });
    doc.page.margins.bottom = -3000; // pagination is handled here, not by the PDF library
    L.landscape = landscape; L.w = landscape ? PORTRAIT.h : PORTRAIT.w; L.h = landscape ? PORTRAIT.w : PORTRAIT.h;
    L.y = chrome ? TOP : M;
    L.chrome = chrome;
  };
  const ensure = (h, repeat) => { if (L.y + h > bottom()) { addPage(L.landscape, L.chrome); repeat?.(); } };

  // ---- text helpers ---------------------------------------------------------------------
  const setFont = (bold, italic, size, color) => doc.font(bold ? "B" : italic ? "I" : "R").fontSize(size).fillColor(color || "#000000");
  const textH = (text, w, size, bold, align, lineGap = 1) => { setFont(bold, false, size); return doc.heightOfString(S(text), { width: w, align, lineGap }); };
  const para = (text, o = {}) => {
    const size = o.size || 10; const w = (o.width ?? innerW()) - (o.indent || 0); const x = M + (o.indent || 0);
    const ph = isPlaceholder(text);
    const h = textH(text, w, size, o.bold, o.align, o.lineGap ?? 1.5);
    ensure(h + (o.after ?? 4));
    setFont(o.bold, o.italic ?? ph, size, o.color || (ph ? "#7F7F7F" : "#000000"));
    doc.text(S(text), x, L.y, { width: w, align: o.align || "left", lineGap: o.lineGap ?? 1.5, underline: o.underline });
    L.y += h + (o.after ?? 4);
  };
  const labelPara = (label, text, o = {}) => {
    const size = o.size || 10; const w = innerW() - (o.indent || 0); const x = M + (o.indent || 0);
    const h = textH(`${label} ${text}`, w, size, false, "left", 1.5);
    ensure(h + (o.after ?? 4));
    setFont(true, false, size); doc.text(S(label) + " ", x, L.y, { width: w, continued: true, lineGap: 1.5 });
    setFont(false, false, size); doc.text(S(text), { width: w, lineGap: 1.5 });
    L.y += h + (o.after ?? 4);
  };
  const bullet = (text, o = {}) => {
    const size = o.size || 10; const w = innerW() - 16;
    const h = textH(text, w, size, false, "left", 1.5);
    ensure(h + 3);
    setFont(false, false, size); doc.text("•", M + 4, L.y, { width: 10 });
    doc.text(S(text), M + 16, L.y, { width: w, lineGap: 1.5 });
    L.y += h + 3;
  };
  const heading = (text, id, o = {}) => {
    if (o.newPage) addPage(o.landscape ?? L.landscape, true);
    ensure(46);
    if (id) anchors[id] = pageIndex();
    L.y += o.before ?? 4;
    setFont(true, false, 13); doc.text(S(text), M, L.y, { width: innerW() });
    L.y += 17;
    doc.moveTo(M, L.y).lineTo(L.w - M, L.y).lineWidth(1.2).strokeColor(AMBER).stroke();
    L.y += 9;
  };
  const subHeading = (text, before = 6) => { ensure(30); L.y += before; setFont(true, false, 11); doc.text(S(text), M, L.y, { width: innerW() }); L.y += 17; };
  const gap = (n = 8) => { L.y += n; };

  // ---- tables ---------------------------------------------------------------------------
  // cell: { t, img, fill, bold, align, size, span, valign, color }. A bare string is a plain cell.
  const norm = (c) => (typeof c === "string" || typeof c === "number" ? { t: String(c) } : c && c.image !== undefined ? { img: c.image, ph: "[Thermal image]" } : c || { t: "" });
  const drawTable = (widths, rows, o = {}) => {
    const pad = 4; const x0 = o.x ?? M; const total = widths.reduce((a, b) => a + b, 0);
    const headRows = rows.filter((r) => r.header);
    const spanW = (i, span) => widths.slice(i, i + (span || 1)).reduce((a, b) => a + b, 0);
    const heightOf = (r) => {
      let h = r.minH || 0; let i = 0;
      for (const raw of r.cells) {
        const c = norm(raw); const w = spanW(i, c.span); i += c.span || 1;
        const size = c.size || o.size || 8.5;
        let ch = 0;
        if (c.img !== undefined) ch = c.img ? Math.min(c.maxH || 120, (c.img.height / c.img.width) * Math.min(w - 2 * pad, c.maxW || 150)) + 2 * pad : textH(c.ph || "[Insert photograph]", w - 2 * pad, 7.5, false, "center") + 2 * pad + (c.minImgH || 0);
        else if (Array.isArray(c.lines)) ch = c.lines.reduce((a, ln) => a + textH(ln.t, w - 2 * pad, ln.size || size, ln.bold, c.align) + 2, 0) + 2 * pad;
        else ch = textH(c.t, w - 2 * pad, size, c.bold, c.align) + 2 * pad;
        h = Math.max(h, ch);
      }
      return Math.max(h, 18);
    };
    const drawRow = (r, h) => {
      let x = x0; let i = 0;
      for (const raw of r.cells) {
        const c = norm(raw); const w = spanW(i, c.span); i += c.span || 1;
        if (c.fill) doc.rect(x, L.y, w, h).fill(c.fill);
        doc.rect(x, L.y, w, h).lineWidth(0.5).strokeColor("#000000").stroke();
        const size = c.size || o.size || 8.5;
        if (c.img !== undefined) {
          if (c.img) {
            const maxW = Math.min(w - 2 * pad, c.maxW || 150); const ih = Math.min(c.maxH || 120, (c.img.height / c.img.width) * maxW);
            try { doc.image(c.img.data, x + (w - maxW) / 2, L.y + (h - ih) / 2, { fit: [maxW, ih], align: "center", valign: "center" }); } catch { /* skip an unreadable image */ }
          } else { setFont(false, true, 7.5, "#7F7F7F"); doc.text(S(c.ph || "[Insert photograph]"), x + pad, L.y + h / 2 - 5, { width: w - 2 * pad, align: "center" }); }
        } else if (Array.isArray(c.lines)) {
          let ty = L.y + pad;
          for (const ln of c.lines) { setFont(ln.bold, false, ln.size || size, ln.color); const lh = textH(ln.t, w - 2 * pad, ln.size || size, ln.bold, c.align); doc.text(S(ln.t), x + pad, ty, { width: w - 2 * pad, align: c.align || "left" }); ty += lh + 2; }
        } else {
          const ph = isPlaceholder(c.t);
          const th = textH(c.t, w - 2 * pad, size, c.bold, c.align);
          const ty = c.valign === "top" ? L.y + pad : L.y + Math.max(pad, (h - th) / 2);
          setFont(c.bold, ph, size, c.color || (ph ? "#7F7F7F" : "#000000"));
          doc.text(S(c.t), x + pad, ty, { width: w - 2 * pad, align: c.align || "left", lineGap: 1 });
        }
        x += w;
      }
    };
    const redrawHead = () => { for (const hr of headRows) { const hh = heightOf(hr); drawRow(hr, hh); L.y += hh; } };
    let first = true;
    for (const r of rows) {
      const h = heightOf(r);
      if (!first && !r.header && L.y + h > bottom()) { addPage(L.landscape, L.chrome); redrawHead(); }
      else if (first && L.y + h + (r.header ? 24 : 0) > bottom()) { addPage(L.landscape, L.chrome); }
      first = false;
      r.onDraw?.(L.y, h, x0);
      drawRow(r, h); L.y += h;
    }
    void total;
  };
  const head = (labels, size = 8) => ({ header: true, cells: labels.map((l) => ({ t: l, fill: AMBER, bold: true, align: "center", size })) });
  const centered = (widths) => (innerW() - widths.reduce((a, b) => a + b, 0)) / 2 + M;

  // ============================ COVER ============================
  addPage(false, false);
  setFont(true, false, 8); doc.text("REPORT NO:", M, M, { width: innerW(), align: "right" });
  setFont(false, false, 8); doc.text(S(d.reportNo), M, M + 11, { width: innerW(), align: "right" });
  L.y = M + 36;
  para(d.title, { size: 22, bold: true, align: "center", after: 6, lineGap: 3 });
  if (d.subtitle) para(d.subtitle, { size: 10, align: "center", color: "#404040", after: 6 });
  para(`Date of Visit: ${d.visitDate}`, { size: 12, bold: true, align: "center", after: 20 });
  para("PREPARED FOR", { size: 12, bold: true, align: "center", underline: true, after: 8 });
  const sw = [tw(2600), tw(4800)];
  drawTable(sw, [["SAP Code", d.site.sapCode], ["Parent Code", d.site.parentCode], ["Location Code", d.site.locationCode], ["Dealership Name", d.site.dealerName], ["Address", d.site.address], ["Type", d.site.type], ["Zone", d.site.zone], ["Regional Office", d.site.regionalOffice], ["State", d.site.state], ["City/Town", d.site.city]]
    .map(([k, v]) => ({ minH: 20, cells: [{ t: k, bold: true, size: 10 }, { t: v, size: 10 }] })), { x: centered(sw) });
  gap(18);
  para("CONDUCTED & PREPARED BY", { size: 12, bold: true, align: "center", underline: true, after: 8 });
  if (d.issuer.logo) { doc.image(d.issuer.logo.data, (L.w - 110) / 2, L.y, { width: 110 }); L.y += 56; } else para("[Company logo]", { size: 11, align: "center" });
  para(d.issuer.name, { size: 14, bold: true, align: "center", after: 2 });
  para(d.issuer.address, { size: 10, align: "center", after: 16 });
  para("DOCUMENT CONTROL SHEET", { size: 11, bold: true, after: 5 });
  const dw = [tw(1200), tw(1500), tw(2700), tw(1700), tw(1700), tw(1666)];
  drawTable(dw, [head(["Revision No.", "Date", "Revision History", "Prepared By", "Reviewed By", "Authorised By"], 8), { minH: 22, cells: [d.control.no, d.control.date, d.control.history, d.control.preparedBy, d.control.reviewedBy, d.control.authorisedBy].map((v, i) => ({ t: v, align: i < 2 ? "center" : "left" })) }]);
  gap(14);
  para("Disclaimer:", { size: 9, bold: true, after: 2 });
  para("This report is issued within the scope of contract, documents submitted and does not perpetuate into compliance to any statutory regulations and / or acts. The observations relate to the conditions seen and the records produced on the day of the visit.", { size: 9 });
  para("Copying this report without the permission is not permitted.", { size: 9 });

  // ============================ INDEX ============================
  const entries = [["ACKNOWLEDGEMENT", "idx_ack"], [`ABOUT ${d.issuer.brand.toUpperCase()}`, "idx_about"], ["AUDIT VISIT DETAILS", "idx_visit"], ["EXECUTIVE SUMMARY", "idx_exec"], ["FINAL SCORE / RISK LEVEL", "idx_exec"], ["SUMMARY REPORT", "idx_summary"], ["PICTORIAL EVIDENCE", "idx_pics"]];
  d.sections.forEach((s) => entries.push([`${s.label.toUpperCase()} CHECK SHEET`, `idx_check_${s.key}`]));
  entries.push([`${d.scopeLabel.toUpperCase()} ACTION PRIORITY LIST`, "idx_actions"]);
  if (d.annex.earthLoop) entries.push(["EARTH LOOP RESISTANCE REPORT", "idx_earth"]);
  if (d.annex.thermography) entries.push(["THERMOGRAPHY REPORT", "idx_thermo"]);
  if (d.annex.powerQuality) entries.push(["POWER QUALITY REPORT SUMMARY", "idx_pq"]);
  if (d.annex.fireRegister) entries.push(["FIRE PROTECTION EQUIPMENT REGISTER", "idx_fire_reg"]);
  entries.push(["LIST OF ABBREVIATIONS USED IN REPORT", "idx_abbr"], ["EQUIPMENTS USED", "idx_equip"], ["STANDARDS REFERRED", "idx_std"]);

  addPage(false, true);
  heading("INDEX", "idx_index", { before: 0 });
  const iw = [tw(8000), innerW() - tw(8000)];
  const idxRows = [head(["TOPIC", "PAGE NO"], 9)];
  entries.forEach(([label, id]) => idxRows.push({ minH: 19, cells: [{ t: label, size: 9.5 }, { t: "", align: "center" }], onDraw: (y, h, x0) => indexSlots.push({ id, page: pageIndex(), x: x0 + iw[0], y, w: iw[1], h }) }));
  drawTable(iw, idxRows, { size: 9.5 });

  // ============================ ACKNOWLEDGEMENT / ABOUT ============================
  heading("ACKNOWLEDGEMENT", "idx_ack", { newPage: true, before: 0 });
  para(`We are thankful to the management and employees of ${d.client.name} for their cooperation during the ${d.scopeLabel.toLowerCase()} and appreciate the courtesy extended to our audit team throughout the visit. [Add any further acknowledgement.]`, { size: 10, lineGap: 3, after: 10 });
  para(`- ${d.issuer.name}`, { bold: true, align: "right", after: 14 });
  heading(`ABOUT ${d.issuer.brand.toUpperCase()}`, "idx_about", { before: 8 });
  (d.issuer.about.length ? d.issuer.about : [{ text: "[Company profile]", bullet: false }]).forEach((p) => (p.bullet ? bullet(p.text, { size: 9.5 }) : para(p.text, { size: 9.5, after: 6, lineGap: 2 })));

  // ============================ VISIT DETAILS ============================
  heading("AUDIT VISIT DETAILS", "idx_visit", { newPage: true, before: 0 });
  const vw = [tw(3300), innerW() - tw(3300)];
  drawTable(vw, d.visit.rows.map(([k, v]) => ({ minH: 19, cells: [{ t: k, bold: true, fill: SOFT, size: 9.5 }, { t: v, size: 9.5 }] })), { size: 9.5 });
  if (d.visit.mapUrl) { gap(6); para(`Map: ${d.visit.mapUrl}`, { size: 8.5, color: "#1155CC", after: 8 }); }
  subHeading("Site front facade", 8);
  para("First photograph taken by the auditor on arrival, at the check-in location above.", { size: 9, after: 6 });
  drawTable([innerW()], [{ minH: 150, cells: [{ img: d.visit.facade, maxW: 320, maxH: 240, ph: "[Insert site front facade photograph]" }] }]);

  // ============================ EXECUTIVE SUMMARY ============================
  heading("EXECUTIVE SUMMARY", "idx_exec", { newPage: true, before: 0 });
  subHeading("Key Audit Observations:", 0);
  if (d.keyObservations.length) d.keyObservations.forEach((t, i) => labelPara(`${i + 1}.`, t, { indent: 8, after: 3 })); else para("[Key audit observations]");
  gap(4); labelPara("Conclusion:", d.conclusion, { after: 10 });
  if (d.disciplineScores.length > 1) {
    subHeading("Score by audit type", 2);
    const cw = [tw(4200), tw(2000), tw(2200), tw(2066)];
    drawTable(cw, [head(["Audit type", "Score", "Risk level", "Non-compliances"], 8.5), ...d.disciplineScores.map((s) => ({ cells: [{ t: s.label, size: 9 }, { t: s.percentText, align: "center", size: 9 }, { t: s.risk, align: "center", size: 9, fill: RISK_FILL[s.risk] }, { t: String(s.nc), align: "center", size: 9 }] }))], { size: 9 });
    gap(6);
  }
  para("Final Score", { size: 13, bold: true, after: 2 });
  para(d.overall.percentText, { size: 15, bold: true, after: 8 });
  para("Risk Level", { size: 13, bold: true, after: 3 });
  drawTable([tw(2600)], [{ minH: 24, cells: [{ t: d.overall.risk, fill: RISK_FILL[d.overall.risk], bold: true, align: "center", size: 11 }] }]);
  gap(10);
  const rw = [tw(4000), tw(3000)];
  drawTable(rw, [head(["Score Reference", "Priority"], 8.5), { cells: [{ t: "0 - 25%", align: "center" }, { t: "High Risk", align: "center", fill: RISK_FILL["High Risk"] }] }, { cells: [{ t: "> 25 - 75%", align: "center" }, { t: "Medium Risk", align: "center", fill: RISK_FILL["Medium Risk"] }] }, { cells: [{ t: "> 75%", align: "center" }, { t: "Low Risk", align: "center", fill: RISK_FILL["Low Risk"] }] }]);
  gap(12);
  para("Action Priority Guidelines -", { bold: true, after: 3 });
  labelPara("Priority 1 (P1) -", "Critical observations leading to a fire scenario, absence of fire mitigation systems or inadequate capacity of the installation.", { size: 9.5, after: 2 });
  labelPara("Priority 2 (P2) -", "Legal compliance related gaps and any major risk observations.", { size: 9.5, after: 2 });
  labelPara("Priority 3 (P3) -", "Minor risk observations without the potential to cause a fire risk, and documentation gaps.", { size: 9.5, after: 2 });

  // ============================ SUMMARY ============================
  heading("SUMMARY REPORT", "idx_summary", { newPage: true, before: 0 });
  subHeading("Key Audit Observations:", 0);
  if (d.keyObservations.length) d.keyObservations.forEach((t) => bullet(t)); else bullet("[Key audit observation]");
  subHeading("Conclusion");
  bullet("Whether the Dealer has non-compliance (L0 / L1) in Critical questions");
  ensure(24);
  {
    const yy = L.y; const box = (x, on) => { doc.rect(x, yy + 1, 10, 10).lineWidth(0.8).strokeColor("#000").stroke(); if (on) doc.moveTo(x + 2, yy + 6).lineTo(x + 4.5, yy + 9).lineTo(x + 8.5, yy + 2.5).lineWidth(1.4).stroke(); };
    setFont(true, false, 10); doc.text("Yes", M + 18, yy, { continued: false }); box(M + 40, d.criticalNc);
    doc.text("No", M + 66, yy); box(M + 84, !d.criticalNc);
    setFont(false, false, 8.5); doc.text("(Tick the appropriate one)", M + 104, yy + 1);
    L.y += 22;
  }
  bullet("If yes, mention the areas of non-compliance (L0 / L1) in Critical questions:");
  if (d.criticalAreas.length) d.criticalAreas.forEach((t) => para(`– ${t}`, { indent: 28, after: 2 })); else para(d.criticalNc ? "[Areas of critical non-compliance]" : "Not applicable.", { indent: 28 });

  // ============================ PICTORIAL EVIDENCE ============================
  heading("PICTORIAL EVIDENCE", "idx_pics", { newPage: true, before: 0 });
  {
    const pw = [tw(700), tw(4533), tw(700), tw(4533)];
    const rows = [head(["Sl. No.", "Picture", "Sl. No.", "Picture"], 8.5)];
    for (let i = 0; i < d.pictures.length; i += 2) {
      const a = d.pictures[i]; const b = d.pictures[i + 1];
      rows.push({ minH: 150, cells: [{ t: String(i + 1), align: "center", bold: true }, { img: a.image, maxW: 215, maxH: 150 }, { t: b ? String(i + 2) : "", align: "center", bold: true }, b ? { img: b.image, maxW: 215, maxH: 150 } : { t: "" }] });
      rows.push({ cells: [{ t: "" }, { t: a.caption, align: "center", size: 8 }, { t: "" }, { t: b ? b.caption : "", align: "center", size: 8 }] });
    }
    drawTable(pw, rows);
  }

  // ============================ CHECK SHEETS (landscape) ============================
  const LEVELS = [["0 – Non-Compliance:", "No evidence of adherence to required safety standards or procedures."], ["1 – Partial Compliance with Major Observations:", "Some elements of compliance are present, but significant safety gaps or violations exist that require immediate attention."], ["2 – Partial Compliance with Minor Observations:", "Mostly compliant, with minor issues that do not pose immediate safety risks but need correction."], ["3 – Compliance:", "Full adherence to all relevant safety standards, procedures and practices. No significant observations."], ["NA – Not Applicable:", "The requirement does not apply to the specific area, process or situation being assessed."]];
  const LW = tw(15398);
  d.sections.forEach((sec) => {
    heading(`${sec.label.toUpperCase()} CHECK SHEET`, `idx_check_${sec.key}`, { newPage: true, landscape: true, before: 0 });
    subHeading("Assessed Levels of Compliance", 0);
    LEVELS.forEach(([k, v]) => labelPara(k, v, { size: 8.5, after: 1.5 }));
    gap(6);
    const w = [tw(650), tw(1050), tw(4200), tw(2500), tw(1200), LW - tw(650 + 1050 + 4200 + 2500 + 1200)];
    const rows = [head(["S. No", "Question Type", "Question", "Document Required on Audit Day", "Assessed Level", "Auditor's Observations"], 8)];
    if (!sec.categories.length) rows.push({ cells: [{ t: "[No checklist items in this scope]", span: 6, align: "center" }] });
    for (const cat of sec.categories) {
      rows.push({ cells: [{ t: cat.name, span: 6, fill: BAND, bold: true, size: 9 }] });
      for (const r of cat.rows) rows.push({ cells: [{ t: String(r.sno), align: "center" }, { t: r.type, align: "center" }, { lines: [{ t: r.question, size: 8.5 }, ...(r.code ? [{ t: r.code, size: 6.5, color: "#7F7F7F" }] : [])], valign: "top" }, { t: r.document, size: 8, valign: "top" }, { t: String(r.level), align: "center", bold: true, fill: LEVEL_FILL[r.level] }, { t: r.observation, size: 8, valign: "top" }] });
    }
    drawTable(w, rows);
  });

  // ============================ ACTION LIST ============================
  heading(`${d.scopeLabel.toUpperCase()} ACTION PRIORITY LIST`, "idx_actions", { newPage: true, landscape: true, before: 0 });
  labelPara("Priority 1 (P1)", "– Critical observations leading to a fire scenario, absence of fire mitigation, inadequate capacity.", { size: 8.5, after: 1.5 });
  labelPara("Priority 2 (P2)", "– Legal compliance related gaps, any major risk observations.", { size: 8.5, after: 1.5 });
  labelPara("Priority 3 (P3)", "– Minor risk observations not having potential to cause fire risk, documentation gaps.", { size: 8.5, after: 6 });
  {
    const aw = [600, 1000, 2800, 3200, 1000, 1750, 1500, 1300, 1250, 15398 - 600 - 1000 - 2800 - 3200 - 1000 - 1750 - 1500 - 1300 - 1250].map(tw);
    const rows = [head(["Sr. No.", "Reference Question No.", "Observations", "Recommendations / Actionable Points", "Action Priority", "Photographs", "Action Plan", "Responsibility", "Target Date", "Status Open / Close"], 7.5)];
    if (!d.actions.length) rows.push({ cells: [{ t: "[No open actions]", span: 10, align: "center" }] });
    d.actions.forEach((a, i) => rows.push({ cells: [{ t: String(i + 1), align: "center" }, { t: a.ref, align: "center" }, { t: a.observation, size: 8, valign: "top" }, { t: a.recommendation, size: 8, valign: "top" }, { t: a.priorityLabel, align: "center", bold: true, size: 8, fill: PRIORITY_FILL[a.priority] }, a.image ? { img: a.image, maxW: 80, maxH: 60 } : { t: "NA", align: "center", size: 8 }, { t: a.actionPlan, size: 8 }, { t: a.responsibility, size: 8 }, { t: a.targetDate, size: 8, align: "center" }, { t: a.status, size: 8, align: "center" }] }));
    drawTable(aw, rows);
  }

  // ============================ ANNEXURES ============================
  const annex = (title, id, widths, labels, rows, minH) => {
    heading(title, id, { newPage: true, landscape: true, before: 0 });
    drawTable(widths.map(tw), [head(labels, 8), ...rows.map((r) => ({ minH, cells: r.map((v, i) => (v && typeof v === "object" && v.image !== undefined ? { img: v.image, maxW: 130, maxH: 85, ph: "[Thermal image]" } : { t: v ?? "", size: 8.5, align: i === 0 ? "center" : "left" })) }))]);
  };
  if (d.annex.earthLoop) annex("EARTH LOOP RESISTANCE REPORT", "idx_earth", [700, 3600, 3600, 2200, 15398 - 700 - 3600 - 3600 - 2200], ["Sl No", "Location", "Equipment Id", "Resistance (Ohm)", "Remark (OK / NOT OK)"], d.annex.earthLoop, 22);
  if (d.annex.thermography) annex("THERMOGRAPHY REPORT", "idx_thermo", [700, 2300, 2700, 3000, 1800, 15398 - 700 - 2300 - 2700 - 3000 - 1800], ["Sr no", "Area name", "Panel / asset name", "Image", "Recorded Temp. (ºC)", "Remarks"], d.annex.thermography, 80);
  if (d.annex.powerQuality) annex("POWER QUALITY REPORT SUMMARY", "idx_pq", [700, 3000, 3200, 2400, 2400, 15398 - 700 - 3000 - 3200 - 2400 - 2400], ["Sr. No.", "Area", "Parameter", "Measured", "Limit", "Remark"], d.annex.powerQuality, 22);
  if (d.annex.fireRegister) annex("FIRE PROTECTION EQUIPMENT REGISTER", "idx_fire_reg", [700, 3400, 3000, 2200, 2200, 15398 - 700 - 3400 - 3000 - 2200 - 2200], ["Sr. No.", "Equipment / system", "Location", "Last tested", "Next due", "Status"], d.annex.fireRegister, 22);

  // ============================ REFERENCES ============================
  heading("LIST OF ABBREVIATIONS USED IN REPORT", "idx_abbr", { newPage: true, landscape: false, before: 0 });
  d.abbreviations.forEach(([a, b]) => labelPara(`${a}:`, b, { size: 9.5, after: 2 }));
  heading("EQUIPMENTS USED", "idx_equip", { before: 12 });
  d.equipment.forEach((t) => bullet(t, { size: 9.5 }));
  heading("STANDARDS REFERRED", "idx_std", { before: 12 });
  d.standards.forEach((t) => bullet(t, { size: 9.5 }));
  gap(18); para("*** END OF REPORT ***", { bold: true, align: "center" });

  // ============================ PAGE FURNITURE ============================
  // Index page numbers are known only now; headers and footers need the final page count.
  for (const slot of indexSlots) {
    if (anchors[slot.id] === undefined) continue;
    doc.switchToPage(slot.page); setFont(false, false, 9.5);
    doc.text(String(anchors[slot.id] + 1), slot.x, slot.y + (slot.h - 11) / 2, { width: slot.w, align: "center" });
  }
  const total = doc.bufferedPageRange().count;
  for (let i = 1; i < total; i += 1) {
    doc.switchToPage(i);
    const w = doc.page.width; const h = doc.page.height;
    const cw = w - M * 2; const logoW = 76; const rightW = 160;
    doc.rect(M, 18, cw, 38).lineWidth(0.6).strokeColor("#000").stroke();
    doc.moveTo(M + logoW + 8, 18).lineTo(M + logoW + 8, 56).stroke(); doc.moveTo(w - M - rightW, 18).lineTo(w - M - rightW, 56).stroke();
    if (d.issuer.logo) doc.image(d.issuer.logo.data, M + 4, 22, { fit: [logoW, 30], align: "center", valign: "center" }); else { setFont(false, true, 7.5, "#7F7F7F"); doc.text("[Company logo]", M + 4, 33, { width: logoW, align: "center" }); }
    setFont(true, false, 11); doc.text(S(d.title), M + logoW + 12, 31, { width: cw - logoW - rightW - 20, align: "center" });
    setFont(true, false, 7.5); doc.text("REPORT NO:", w - M - rightW + 6, 24, { width: rightW - 12, align: "right" });
    setFont(false, false, 7.5); doc.text(S(d.reportNo), w - M - rightW + 6, 36, { width: rightW - 12, align: "right" });
    doc.moveTo(M, h - 40).lineTo(w - M, h - 40).lineWidth(1.2).strokeColor(AMBER).stroke();
    setFont(false, false, 7.5);
    doc.text(S(`Report No: ${d.reportNo}      © Copyright ${d.issuer.short} - ${d.year}      Page No: ${i + 1} of ${total}      Annexure 1 / Version 1.0 / ${d.templateDate}`), M, h - 34, { width: cw, align: "left" });
  }
  doc.end();
});

module.exports = { renderAuditReportPdf };
