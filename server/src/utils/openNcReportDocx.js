const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "templates",
  "vistSheet-Report.docx",
);
const DOCUMENT_PATH = "word/document.xml";
const RELATIONSHIPS_PATH = "word/_rels/document.xml.rels";
const CONTENT_TYPES_PATH = "[Content_Types].xml";
const BLUE = "548DD4";

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const matches = (source, expression) =>
  [...source.matchAll(expression)].map((match) => match[0]);

const tableRows = (tableXml) =>
  matches(tableXml, /<w:tr(?:\s[^>]*)?>.*?<\/w:tr>/gs);

const rowCells = (rowXml) => matches(rowXml, /<w:tc>.*?<\/w:tc>/gs);

const replaceRows = (tableXml, rows) => {
  const current = tableRows(tableXml);
  if (!current.length) return tableXml;
  const start = tableXml.indexOf(current[0]);
  const last = current[current.length - 1];
  const end = tableXml.lastIndexOf(last) + last.length;
  return `${tableXml.slice(0, start)}${rows.join("")}${tableXml.slice(end)}`;
};

const blueRunProperties = (cellXml) => {
  const properties = matches(cellXml, /<w:rPr>.*?<\/w:rPr>/gs).find(
    (value) => value.includes(`w:val="${BLUE}"`),
  );
  return (
    properties ||
    `<w:rPr><w:color w:val="${BLUE}" w:themeColor="text2" w:themeTint="99"/><w:sz w:val="19"/></w:rPr>`
  );
};

const paragraphProperties = (cellXml) => {
  const paragraph = cellXml.match(/<w:p(?:\s[^>]*)?>.*?<\/w:p>/s)?.[0] || "";
  return paragraph.match(/<w:pPr>.*?<\/w:pPr>/s)?.[0] || "";
};

const paragraphOpeningTag = (cellXml) =>
  cellXml.match(/<w:p(?:\s[^>]*)?>/)?.[0] || "<w:p>";

const textRuns = (lines, runProperties) => {
  const normalized = Array.isArray(lines) ? lines : [lines];
  return normalized
    .flatMap((line, index) => [
      ...(index ? [`<w:r>${runProperties}<w:br/></w:r>`] : []),
      `<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    ])
    .join("");
};

const replaceCellText = (cellXml, value) => {
  const cellProperties = cellXml.match(/<w:tcPr>.*?<\/w:tcPr>/s)?.[0] || "";
  const opening = paragraphOpeningTag(cellXml);
  const pPr = paragraphProperties(cellXml);
  const rPr = blueRunProperties(cellXml);
  const lines = String(value ?? "N/A").split(/\r?\n/);
  return `<w:tc>${cellProperties}${opening}${pPr}${textRuns(lines, rPr)}</w:p></w:tc>`;
};

const replaceRowCells = (rowXml, replacements) => {
  let index = 0;
  return rowXml.replace(/<w:tc>.*?<\/w:tc>/gs, (cellXml) => {
    const replacement = replacements[index];
    index += 1;
    return replacement === undefined ? cellXml : replaceCellText(cellXml, replacement);
  });
};

const replaceTable = (documentXml, tableIndex, transform) => {
  let index = 0;
  return documentXml.replace(/<w:tbl>.*?<\/w:tbl>/gs, (tableXml) => {
    const current = index;
    index += 1;
    return current === tableIndex ? transform(tableXml) : tableXml;
  });
};

const formatFindings = (items) => {
  if (!items?.length) return "N/A";
  return items
    .flatMap((item, index) => {
      const details = (item.fields || [])
        .filter((field) => field.value && field.value !== item.summary)
        .map((field) => `${field.label}: ${field.value}`)
        .join("; ");
      const evidence = (item.evidence || [])
        .map((entry) => entry.name || entry.url)
        .filter(Boolean)
        .join(", ");
      return [
        `${index + 1}. ${item.summary}`,
        ...(details ? [details] : []),
        ...(evidence ? [`Evidence: ${evidence}`] : []),
      ];
    })
    .join("\n");
};

const populateSummaryTable = (tableXml, data) => {
  const rows = tableRows(tableXml);
  if (rows.length < 4) return tableXml;
  rows[0] = replaceRowCells(rows[0], [
    undefined,
    `Name: ${data.companyName}\nDate: ${data.auditDate}`,
  ]);
  rows[1] = replaceRowCells(rows[1], [undefined, data.constructionSite]);
  rows[2] = replaceRowCells(rows[2], [undefined, data.technicalDescription]);
  rows[3] = replaceRowCells(rows[3], [undefined, data.observations]);
  return replaceRows(tableXml, rows);
};

const populateControlMeasures = (tableXml, data) => {
  const sourceRows = tableRows(tableXml);
  if (sourceRows.length < 2) return tableXml;
  const templateRow = sourceRows[1];
  const categories = data.categories.length
    ? data.categories
    : [{ number: "", title: "Checklist", openItems: [] }];
  const rows = [
    sourceRows[0],
    ...categories.map((category) => {
      const cleanTemplateRow = templateRow
        .replace(/\s+w14:paraId="[^"]*"/g, "")
        .replace(/\s+w14:textId="[^"]*"/g, "");
      return replaceRowCells(cleanTemplateRow, [
          `${category.number ? `${category.number}. ` : ""}${category.title}`,
          formatFindings(category.openItems),
        ]);
    }),
  ];
  return replaceRows(tableXml, rows);
};

const populatePlanningMeasures = (tableXml, data) => {
  const sourceRows = tableRows(tableXml);
  if (sourceRows.length < 2) return tableXml;
  const templateRow = sourceRows[1];
  const planningItems = data.planningItems?.length
    ? data.planningItems
    : [{ category: "", action: "N/A" }];
  const rows = [
    sourceRows[0],
    ...planningItems.map((item, index) => {
      const cleanTemplateRow = templateRow
        .replace(/\s+w14:paraId="[^"]*"/g, "")
        .replace(/\s+w14:textId="[^"]*"/g, "");
      const measure = item.category
        ? `${item.category}: ${item.action}`
        : item.action;
      return replaceRowCells(cleanTemplateRow, [`${index + 1}. ${measure}`]);
    }),
  ];
  return replaceRows(tableXml, rows);
};

const populateModuleNonCompliances = (tableXml, data) => {
  const rows = tableRows(tableXml);
  if (rows.length < 4) return tableXml;
  rows[1] = replaceRowCells(rows[1], [undefined, formatFindings(data.workers)]);
  rows[2] = replaceRowCells(rows[2], [undefined, formatFindings(data.machinery)]);
  rows[3] = replaceRowCells(rows[3], [undefined, formatFindings(data.chemicals)]);
  return replaceRows(tableXml, rows);
};

const signatureType = (mimeType = "") =>
  /jpe?g/i.test(mimeType) ? { extension: "jpg", contentType: "image/jpeg" } : {
    extension: "png",
    contentType: "image/png",
  };

const loadSignature = async (url) => {
  if (!url) return null;
  const match = /^data:(image\/[^;]+);base64,(.+)$/i.exec(url);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), ...signatureType(match[1]) };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      ...signatureType(response.headers.get("content-type")),
    };
  } catch {
    return null;
  }
};

const addSignatureRelationship = (zip, signature) => {
  let relationships = zip.readAsText(RELATIONSHIPS_PATH);
  const ids = [...relationships.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const relationshipId = `rId${Math.max(0, ...ids) + 1}`;
  const mediaName = `auditor-signature.${signature.extension}`;
  relationships = relationships.replace(
    "</Relationships>",
    `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/></Relationships>`,
  );
  zip.updateFile(RELATIONSHIPS_PATH, Buffer.from(relationships));
  zip.addFile(`word/media/${mediaName}`, signature.buffer);

  let contentTypes = zip.readAsText(CONTENT_TYPES_PATH);
  if (!contentTypes.includes(`Extension="${signature.extension}"`)) {
    contentTypes = contentTypes.replace(
      "</Types>",
      `<Default Extension="${signature.extension}" ContentType="${signature.contentType}"/></Types>`,
    );
    zip.updateFile(CONTENT_TYPES_PATH, Buffer.from(contentTypes));
  }
  return relationshipId;
};

const signatureDrawing = (relationshipId) => `
<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
<wp:extent cx="1428750" cy="666750"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="999" name="Auditor signature" descr="Signature copied from Visit Sheet"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Auditor signature"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1428750" cy="666750"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const replaceCellWithSignature = (cellXml, relationshipId, fallbackName) => {
  if (!relationshipId) return replaceCellText(cellXml, fallbackName);
  const cellProperties = cellXml.match(/<w:tcPr>.*?<\/w:tcPr>/s)?.[0] || "";
  const opening = paragraphOpeningTag(cellXml);
  const existingPPr = paragraphProperties(cellXml);
  const centeredPPr = existingPPr.includes("<w:jc")
    ? existingPPr
    : `<w:pPr><w:jc w:val="center"/></w:pPr>`;
  return `<w:tc>${cellProperties}${opening}${centeredPPr}${signatureDrawing(
    relationshipId,
  )}</w:p></w:tc>`;
};

const populateAuditorTable = (tableXml, data, relationshipId) => {
  const rows = tableRows(tableXml);
  if (rows.length < 2) return tableXml;
  const cells = rowCells(rows[1]);
  if (cells.length < 2) return tableXml;
  const updated = [
    replaceCellText(cells[0], `First and family name\n${data.auditorName}`),
    replaceCellWithSignature(cells[1], relationshipId, data.auditorName),
  ];
  let cellIndex = 0;
  rows[1] = rows[1].replace(/<w:tc>.*?<\/w:tc>/gs, () => updated[cellIndex++]);
  return replaceRows(tableXml, rows);
};

const buildOpenNcReportDocx = async (data) => {
  const zip = new AdmZip(fs.readFileSync(TEMPLATE_PATH));
  const signature = await loadSignature(data.auditorSignatureUrl);
  const relationshipId = signature ? addSignatureRelationship(zip, signature) : null;
  let documentXml = zip.readAsText(DOCUMENT_PATH);

  documentXml = replaceTable(documentXml, 0, (tableXml) =>
    populateSummaryTable(tableXml, data),
  );
  documentXml = replaceTable(documentXml, 1, (tableXml) =>
    populateControlMeasures(tableXml, data),
  );
  documentXml = replaceTable(documentXml, 2, (tableXml) =>
    populatePlanningMeasures(tableXml, data),
  );
  documentXml = replaceTable(documentXml, 3, (tableXml) =>
    populateModuleNonCompliances(tableXml, data),
  );
  documentXml = replaceTable(documentXml, 5, (tableXml) =>
    populateAuditorTable(tableXml, data, relationshipId),
  );

  zip.updateFile(DOCUMENT_PATH, Buffer.from(documentXml));
  return zip.toBuffer();
};

module.exports = { buildOpenNcReportDocx };
