const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const NAVY = "#1F3A5F"; const GREEN = "#287a37";
const verifyUrl = (code) => `${process.env.CLIENT_URL || "http://localhost:5173"}/verify-auditor/${code}`;
const qrPng = (text) => QRCode.toBuffer(text, { margin: 1, width: 240 });
const qrDataUrl = (text) => QRCode.toDataURL(text, { margin: 1, width: 240 });
const photoBuffer = (dataUrl) => { const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || ""); return m ? Buffer.from(m[2], "base64") : null; };
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const COMPANY = "Bexex Global Pvt. Ltd.";
const SKILL = { INFRASTRUCTURE: "Infrastructure", ELECTRICAL: "Electrical", FIRE_SAFETY: "Fire & Life Safety", THERMOGRAPHY: "Thermography" };

// Landscape badge: wave banner, rounded photo, name and role, details grid, QR and signature lines. Page 1 is the front (identity), page 2 the back (verification and authority).
const W = 428; const H = 270;
const idCardPdf = async (res, c) => {
  // Standard ID-1 card, 85.6 x 54 mm. Drawn on a 428 x 270 canvas and scaled to the real size.
  const PW = 242.65; const PH = 153.07; const K = PW / W;
  const doc = new PDFDocument({ size: [PW, PH], margin: 0, autoFirstPage: true });
  doc.page.margins.bottom = -2000; // no automatic page breaks on the scaled canvas
  doc.scale(K);
  doc.pipe(res);
  doc.rect(0, 0, W, H).fill("#ffffff");

  // Wave banner
  doc.save().moveTo(0, 0).lineTo(W, 0).lineTo(W, 52).bezierCurveTo(W * 0.78, 78, W * 0.55, 30, W * 0.3, 56).bezierCurveTo(W * 0.15, 70, 0, 62, 0, 62).closePath().fill(NAVY).restore();
  doc.save().moveTo(0, 62).bezierCurveTo(0, 62, W * 0.15, 70, W * 0.3, 56).bezierCurveTo(W * 0.55, 30, W * 0.78, 78, W, 52).lineTo(W, 60).bezierCurveTo(W * 0.78, 86, W * 0.55, 38, W * 0.3, 64).bezierCurveTo(W * 0.15, 78, 0, 70, 0, 70).closePath().fill(GREEN).restore();
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(13).text(COMPANY.toUpperCase(), 22, 15, { characterSpacing: 1.2 });
  doc.font("Helvetica").fontSize(7.5).text("BEXEX AUDIT PORTAL", 22, 33, { characterSpacing: 2.5 });
  doc.font("Helvetica-Bold").fontSize(7).text("AUTHORISED FIELD AUDITOR", 0, 20, { width: W - 22, align: "right", characterSpacing: 1 });

  // Photo
  const px = 22; const py = 80; const pw = 86; const ph = 104;
  doc.save().roundedRect(px, py, pw, ph, 12).clip();
  const photo = photoBuffer(c.photoUrl);
  if (photo) doc.image(photo, px, py, { cover: [pw, ph], align: "center", valign: "center" });
  else { doc.rect(px, py, pw, ph).fill("#e6e8eb"); doc.fillColor("#888").font("Helvetica").fontSize(8).text("No photo", px, py + ph / 2 - 4, { width: pw, align: "center" }); }
  doc.restore();
  doc.roundedRect(px, py, pw, ph, 12).lineWidth(1.5).stroke(NAVY);

  // Name and role
  const tx = 124;
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(19).text(c.fullName, tx, 78, { width: W - tx - 22, height: 46, lineGap: 0 });
  const roleY = doc.y + 2;
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(10).text("Field Auditor", tx, Math.min(roleY, 112));

  // Details grid
  const fields = [["ID No", c.auditorCode || "—", 0, 0], ["D.O.B", fmt(c.dateOfBirth), 1, 0], ["Phone", c.phone || "—", 0, 1], ["Emergency contact", c.emergencyContact || "—", 1, 1], ["Base location", c.baseLocation || "—", 0, 2], ["Email", c.email || "—", 1, 2]];
  fields.forEach(([label, value, col, row]) => {
    const x = tx + col * 112; const y = 122 + row * 28;
    doc.fillColor("#6b7280").font("Helvetica").fontSize(6.5).text(label.toUpperCase(), x, y, { width: 150, lineBreak: false, characterSpacing: 0.6 });
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(8.5).text(value, x, y + 9, { width: col === 0 ? 104 : W - tx - 112 - 22, height: 11, ellipsis: true });
  });

  // Signatures (the verification QR is on the back)
  const qr = await qrPng(verifyUrl(c.auditorCode));
  const sy = H - 26;
  doc.moveTo(22, sy).lineTo(172, sy).lineWidth(0.6).stroke("#9ca3af").moveTo(256, sy).lineTo(406, sy).stroke("#9ca3af");
  doc.fillColor("#6b7280").font("Helvetica").fontSize(6.5).text("Auditor signature", 22, sy + 3).text("Authorised signatory", 256, sy + 3);
  doc.rect(0, H - 6, W, 6).fill(GREEN);

  // Back: verification, authority and scope
  doc.addPage({ size: [PW, PH], margin: 0 });
  doc.page.margins.bottom = -2000;
  doc.scale(K);
  doc.rect(0, 0, W, 34).fill(NAVY);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(10).text("BEXEX AUDIT PORTAL", 22, 12, { characterSpacing: 2 });
  doc.font("Helvetica").fontSize(7).text("VERIFICATION & AUTHORITY", 0, 14, { width: W - 22, align: "right", characterSpacing: 1 });
  doc.image(qr, 22, 48, { width: 104 });
  doc.fillColor("#6b7280").font("Helvetica").fontSize(7).text("SCAN TO VERIFY", 22, 154, { width: 104, align: "center" });
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text("Verify this ID", 146, 48);
  doc.font("Helvetica").fontSize(8.5).fillColor("#444").text("Scan the code, or enter the ID number on the Bexex Audit Portal verification page, before allowing access to your premises.", 146, 64, { width: W - 146 - 22, lineGap: 1 });
  const rows = [["Authority letter", c.authorityLetterNumber || "Pending", 0, 0, 124], ["Regions", (c.regions || []).join(", ") || "As assigned", 1, 0, 124], ["Skills", (c.skills || []).map((x) => SKILL[x] || x).join(", ") || "—", 0, 1, 260]];
  rows.forEach(([label, value, col, row, w]) => {
    const x = 146 + col * 130; const y = 108 + row * 32;
    doc.fillColor("#6b7280").font("Helvetica").fontSize(7).text(label.toUpperCase(), x, y, { characterSpacing: 0.5 });
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(9.5).text(value, x, y + 10, { width: w, height: 24, lineGap: 0 });
  });
  doc.roundedRect(22, 168, W - 44, 36, 8).fill("#f3f5f7");
  [["AUDITOR ID", c.auditorCode || "—"], ["ISSUED", fmt(c.idIssuedAt || c.approvedAt)], ["VALID TILL", fmt(c.certificationExpiresAt)]].forEach(([label, value], i) => {
    const x = 34 + i * 128;
    doc.fillColor("#6b7280").font("Helvetica").fontSize(7).text(label, x, 175, { characterSpacing: 0.5 });
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(10).text(value, x, 185, { width: 120, height: 12, ellipsis: true });
  });
  doc.fillColor("#6b7280").font("Helvetica").fontSize(7).text(`DECLARATION  This card is issued by ${COMPANY} for the Bexex Audit Portal. It is valid only with the authority letter and until the date shown. The holder is authorised to carry out audits at the sites assigned to them and must show this card on every visit. If found, please return it to ${COMPANY}.`, 22, 220, { width: W - 44, lineGap: 1.5 });
  doc.rect(0, H - 6, W, 6).fill(GREEN);
  doc.end();
};

const authorityLetterPdf = async (res, c) => {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  doc.pipe(res);
  doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text(COMPANY.toUpperCase(), 56, 36, { characterSpacing: 1.5 });
  doc.fillColor("#555").font("Helvetica").fontSize(10).text("BEXEX AUDIT PORTAL  ·  Authority letter for field audits", 56, 62);
  doc.fillColor("#111").fontSize(10).text(`Reference: ${c.authorityLetterNumber || "Not yet issued"}`, 56, 96).text(`Date of issue: ${fmt(c.idIssuedAt || c.approvedAt)}`, 56, 111).text(`Valid till: ${fmt(c.certificationExpiresAt)}`, 56, 126);
  const photo = photoBuffer(c.photoUrl);
  if (photo) doc.image(photo, doc.page.width - 56 - 84, 92, { fit: [84, 105] });
  doc.moveDown(6);
  doc.font("Helvetica-Bold").fontSize(12).text("To whom it may concern", 56, 190);
  doc.font("Helvetica").fontSize(11).fillColor("#222").text(`This is to certify that ${c.fullName}, holding Auditor ID ${c.auditorCode}, is an authorised field auditor, approved after background verification, training, a calibration test and a supervised shadow audit.`, 56, 212, { width: 480, lineGap: 3 });
  doc.moveDown().text(`The auditor is authorised to visit dealer premises to carry out ${(c.skills || []).map((s) => SKILL[s] || s).join(", ") || "audit"} audits within ${(c.regions || []).join(", ") || "the assigned regions"}, to take photographs and measurements as evidence, to inspect records and to speak with staff for the purposes of the audit.`, { width: 480, lineGap: 3 });
  doc.moveDown().text("Please extend access and cooperation. The auditor must carry this letter with the photo ID card on every visit and will check in at the site through the audit application. All evidence collected is the property of the client.", { width: 480, lineGap: 3 });
  doc.moveDown().text("To confirm this letter, scan the code below or enter the Auditor ID on the verification page.", { width: 480 });
  const qr = await qrPng(verifyUrl(c.auditorCode)); doc.image(qr, 56, doc.y + 12, { width: 96 });
  doc.fillColor("#888").fontSize(9).text(verifyUrl(c.auditorCode), 160, doc.y - 56, { width: 380 });
  doc.fillColor("#111").fontSize(10).text("Authorised signatory", 56, 700).moveTo(56, 696).lineTo(220, 696).stroke("#999");
  doc.end();
};

// Training and certification certificate: issued when Back-Admin approves the onboarding, renewed after each refresher.
const certificatePdf = async (res, c) => {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
  doc.pipe(res);
  const W = doc.page.width; const H = doc.page.height;
  doc.rect(20, 20, W - 40, H - 40).lineWidth(3).stroke(NAVY);
  doc.rect(30, 30, W - 60, H - 60).lineWidth(0.8).stroke(GREEN);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(15).text(COMPANY.toUpperCase(), 0, 62, { align: "center", characterSpacing: 2 });
  doc.fillColor("#555").font("Helvetica").fontSize(10).text("BEXEX AUDIT PORTAL", 0, 84, { align: "center", characterSpacing: 3 });
  doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(30).text("Certificate of Training & Certification", 0, 118, { align: "center" });
  doc.fillColor("#333").font("Helvetica").fontSize(12).text("This is to certify that", 0, 176, { align: "center" });
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(26).text(c.fullName, 0, 198, { align: "center" });
  doc.fillColor("#333").font("Helvetica").fontSize(12).text(`Auditor ID ${c.auditorCode}`, 0, 236, { align: "center" });
  doc.fontSize(12).text(`has completed the mandatory training video, passed the assessment (quiz ${c.quizScore ?? "—"}%, demo checklist ${c.demoScore ?? "—"}%, overall ${c.reviewScore ?? "—"}%) and is certified for`, 120, 268, { width: W - 240, align: "center" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text((c.skills || []).map((x) => SKILL[x] || x).join("  ·  ") || "field audits", 120, 312, { width: W - 240, align: "center" });
  doc.fillColor("#333").font("Helvetica").fontSize(11).text(`Date of certification: ${fmt(c.approvedAt)}      Valid till: ${fmt(c.certificationExpiresAt)}      Refresher training is required before expiry.`, 60, 352, { width: W - 120, align: "center" });
  const qr = await qrPng(verifyUrl(c.auditorCode)); doc.image(qr, 70, H - 160, { width: 80 });
  doc.fillColor("#888").fontSize(8).text("Scan to verify this certificate", 62, H - 74, { width: 100, align: "center" });
  doc.fillColor("#111").fontSize(10).text("Authorised signatory", W - 250, H - 96).moveTo(W - 250, H - 102).lineTo(W - 80, H - 102).stroke("#999");
  doc.end();
};

module.exports = { verifyUrl, qrDataUrl, photoBuffer, idCardPdf, authorityLetterPdf, certificatePdf };
