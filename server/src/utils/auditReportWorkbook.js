const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const XLSX = require("xlsx");

const templatePath = path.join(
  __dirname,
  "..",
  "templates",
  "Bexex_Audit_Report_Template.xlsx",
);

const SHEET_PATHS = {
  "0.0_Cover Page": "xl/worksheets/sheet1.xml",
  "0.3_Executive Summary": "xl/worksheets/sheet4.xml",
  "0.4_INTRODUCTION": "xl/worksheets/sheet5.xml",
  "0.5_APPROACH & METHODOLOGY": "xl/worksheets/sheet6.xml",
  "0.6_Category": "xl/worksheets/sheet7.xml",
  "0.7_RESULTS SUMMARY": "xl/worksheets/sheet8.xml",
};

const BLUE_RUN_PATTERN =
  /<color[^>]+(?:theme="3"|theme="4"|rgb="FF(?:0070C0|4472C4|5B9BD5)")/i;

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  const day = date.getDate();
  const remainder = day % 100;
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
    date,
  );

  return `${String(day).padStart(2, "0")}${suffix} ${month} ${date.getFullYear()}`;
};

const replaceCellWithInlineString = (sheetXml, address, richTextXml) => {
  const cellPattern = new RegExp(
    `<c\\b([^>]*\\br="${address}"[^>]*)>[\\s\\S]*?<\\/c>`,
  );

  if (cellPattern.test(sheetXml)) {
    return sheetXml.replace(cellPattern, (_cell, attributes) => {
      const preservedAttributes = attributes.replace(/\s+t="[^"]*"/g, "");
      return `<c${preservedAttributes} t="inlineStr"><is>${richTextXml}</is></c>`;
    });
  }

  const rowNumber = address.match(/\d+$/)?.[0];
  const rowPattern = new RegExp(
    `<row\\b([^>]*\\br="${rowNumber}"[^>]*)>([\\s\\S]*?)<\\/row>`,
  );

  return sheetXml.replace(rowPattern, (_row, attributes, cells) => {
    const updatedAttributes = attributes.replace(
      /\s+spans="(\d+):(\d+)"/,
      (_spans, start) => ` spans="${start}:3"`,
    );
    const cell = `<c r="${address}" t="inlineStr"><is>${richTextXml}</is></c>`;
    return `<row${updatedAttributes}>${cells}${cell}</row>`;
  });
};

const plainTextXml = (value) =>
  `<t xml:space="preserve">${escapeXml(value)}</t>`;

const blueTextXml = (value) =>
  `<r><rPr><b/><sz val="11"/><color theme="4" tint="0.39997558519241921"/><rFont val="Trebuchet MS"/><family val="2"/></rPr><t xml:space="preserve">${escapeXml(value)}</t></r>`;

const replaceBlueRuns = (richText, values) => {
  let valueIndex = 0;

  return richText.replace(/<r>([\s\S]*?)<\/r>/g, (fullRun, runBody) => {
    if (!BLUE_RUN_PATTERN.test(runBody)) return fullRun;

    const nextValue = values[valueIndex] ?? "";
    valueIndex += 1;
    const replacedBody = runBody.replace(
      /<t([^>]*)>[\s\S]*?<\/t>/,
      `<t$1>${escapeXml(nextValue)}</t>`,
    );
    return `<r>${replacedBody}</r>`;
  });
};

const getCategoryNames = (report, responses) => {
  const checklistCategories = [
    ...(report.audit.projectChecklistSections || []),
  ]
    .sort((first, second) => {
      const firstNumber = Number.parseFloat(
        first.mainMenuNumber || first.sectionNumber,
      );
      const secondNumber = Number.parseFloat(
        second.mainMenuNumber || second.sectionNumber,
      );

      if (Number.isNaN(firstNumber)) return 1;
      if (Number.isNaN(secondNumber)) return -1;
      return firstNumber - secondNumber;
    })
    .map((section) => section.mainMenu || section.title);
  const responseCategories = responses.map(
    (response) =>
      response.question?.section?.mainMenu || response.question?.section?.title,
  );
  const visitedCategories = Array.isArray(report.visitedSections)
    ? report.visitedSections
    : [];
  const fallbackCategories = [
    ...responseCategories,
    ...visitedCategories,
  ].filter((category) => typeof category === "string" && /[A-Za-z]/.test(category));

  return [
    ...new Set(
      (checklistCategories.length ? checklistCategories : fallbackCategories).filter(
        Boolean,
      ),
    ),
  ];
};

const shiftRows = (sheetXml, firstRow, offset) =>
  sheetXml.replace(/<row\b[\s\S]*?<\/row>/g, (rowXml) => {
    const rowNumber = Number(rowXml.match(/<row\b[^>]*\br="(\d+)"/)?.[1]);
    if (!rowNumber || rowNumber < firstRow || offset === 0) return rowXml;

    return rowXml
      .replace(/(<row\b[^>]*\br=")\d+("[^>]*>)/, `$1${rowNumber + offset}$2`)
      .replace(/(<c\b[^>]*\br="[A-Z]+)\d+("[^>]*>)/g, `$1${rowNumber + offset}$2`);
  });

const updateTableRange = (zip, tablePath, startRow, endRow, endColumn) => {
  const tableEntry = zip.getEntry(tablePath);
  if (!tableEntry) throw new Error(`Report template table is missing: ${tablePath}`);

  const range = `B${startRow}:${endColumn}${endRow}`;
  const tableXml = tableEntry
    .getData()
    .toString("utf8")
    .replace(/(<table\b[^>]*\bref=")[^"]+("[^>]*>)/, `$1${range}$2`)
    .replace(/(<autoFilter\b[^>]*\bref=")[^"]+("[^>]*>)/, `$1${range}$2`);
  zip.updateFile(tablePath, Buffer.from(tableXml, "utf8"));
};

const updateCategorySheet = (zip, categoryNames) => {
  const entryPath = SHEET_PATHS["0.6_Category"];
  const entry = zip.getEntry(entryPath);
  if (!entry) throw new Error("Report template sheet is missing: 0.6_Category");

  const categories = categoryNames.length ? categoryNames : ["Not available"];
  const originalCategoryCount = 6;
  const rowOffset = categories.length - originalCategoryCount;
  const titleColumnWidth = Math.min(
    120,
    Math.max(
      30,
      ...categories.map((name) => Math.ceil(String(name).length * 1.25) + 3),
    ),
  );
  const categoryRows = categories
    .map((name, index) => {
      const rowNumber = 8 + index;

      return `<row r="${rowNumber}" spans="2:3" ht="24" customHeight="1"><c r="B${rowNumber}" s="12" t="inlineStr"><is>${plainTextXml(`Category ${index + 1}`)}</is></c><c r="C${rowNumber}" s="24" t="inlineStr"><is>${plainTextXml(name)}</is></c></row>`;
    })
    .join("");

  let sheetXml = entry.getData().toString("utf8");
  sheetXml = sheetXml.replace(
    /(<row\b[^>]*\br="7"[^>]*>[\s\S]*?<\/row>)(?:<row\b[^>]*\br="(?:8|9|10|11|12|13)"[^>]*>[\s\S]*?<\/row>)+/,
    (_rows, headerRow) => `${headerRow}__CATEGORY_ROWS__`,
  );
  sheetXml = shiftRows(sheetXml, 14, rowOffset);
  sheetXml = sheetXml.replace("__CATEGORY_ROWS__", categoryRows);
  sheetXml = sheetXml.replace(
    /<dimension ref="B3:E\d+"\/>/,
    `<dimension ref="B3:E${25 + rowOffset}"/>`,
  );
  sheetXml = sheetXml.replace(
    /<col min="3" max="3"[^>]*\/>/,
    `<col min="3" max="3" width="${titleColumnWidth}" bestFit="1" customWidth="1"/>`,
  );
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));

  const stylesPath = "xl/styles.xml";
  const stylesEntry = zip.getEntry(stylesPath);
  if (!stylesEntry) throw new Error("Report template styles are missing.");
  const stylesXml = stylesEntry
    .getData()
    .toString("utf8")
    .replace(
      /<xf numFmtId="0" fontId="31" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"\/><\/xf>/,
      '<xf numFmtId="0" fontId="31" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    );
  zip.updateFile(stylesPath, Buffer.from(stylesXml, "utf8"));

  updateTableRange(zip, "xl/tables/table2.xml", 7, 7 + categories.length, "C");
  updateTableRange(
    zip,
    "xl/tables/table3.xml",
    22 + rowOffset,
    25 + rowOffset,
    "E",
  );
};

const getCategorySummary = (report, responses, categoryNames) => {
  const summaries = new Map(
    categoryNames.map((name) => [
      name,
      {
        name,
        questionIds: new Set(),
        applicable: 0,
        score: 0,
      },
    ]),
  );

  for (const section of report.audit.projectChecklistSections || []) {
    const categoryName = section.mainMenu || section.title;
    const summary = summaries.get(categoryName);
    if (!summary) continue;

    for (const question of section.questions || []) {
      summary.questionIds.add(question.id);
    }
  }

  for (const response of responses) {
    const categoryName =
      response.question?.section?.mainMenu || response.question?.section?.title;
    const summary = summaries.get(categoryName);
    if (!summary) continue;

    if (["COMPLIANCE", "NON_COMPLIANCE"].includes(response.responseType)) {
      summary.applicable += 1;
    }
    if (response.responseType === "COMPLIANCE") summary.score += 1;
  }

  return [...summaries.values()].map((summary) => ({
    name: summary.name,
    total: summary.questionIds.size || summary.applicable,
    applicable: summary.applicable,
    score: summary.score,
  }));
};

const updateResultsSummarySheet = (zip, summaries) => {
  const entryPath = SHEET_PATHS["0.7_RESULTS SUMMARY"];
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    throw new Error("Report template sheet is missing: 0.7_RESULTS SUMMARY");
  }

  const rows = summaries.length
    ? summaries
    : [{ name: "Not available", total: 0, applicable: 0, score: 0 }];
  const categoryColumnWidth = Math.min(
    80,
    Math.max(25, ...rows.map(({ name }) => Math.ceil(name.length * 1.2) + 3)),
  );
  const dataRows = rows
    .map((summary, index) => {
      const rowNumber = 23 + index;
      const wrappedLines = Math.max(
        1,
        Math.ceil(summary.name.length / Math.max(1, categoryColumnWidth - 2)),
      );
      const rowHeight = Math.max(24, wrappedLines * 15.75);

      return `<row r="${rowNumber}" spans="2:6" ht="${rowHeight}" customHeight="1"><c r="B${rowNumber}" s="35"><v>${index + 1}</v></c><c r="C${rowNumber}" s="36" t="inlineStr"><is>${plainTextXml(summary.name)}</is></c><c r="D${rowNumber}" s="38"><v>${summary.total}</v></c><c r="E${rowNumber}" s="38"><v>${summary.applicable}</v></c><c r="F${rowNumber}" s="38"><v>${summary.score}</v></c></row>`;
    })
    .join("");
  const totals = rows.reduce(
    (result, summary) => ({
      total: result.total + summary.total,
      applicable: result.applicable + summary.applicable,
      score: result.score + summary.score,
    }),
    { total: 0, applicable: 0, score: 0 },
  );
  const totalRowNumber = 23 + rows.length;
  const totalRow = `<row r="${totalRowNumber}" spans="2:6" ht="24" customHeight="1"><c r="B${totalRowNumber}" s="35" t="inlineStr"><is>${plainTextXml("Cumulative")}</is></c><c r="C${totalRowNumber}" s="39" t="inlineStr"><is>${plainTextXml("Total")}</is></c><c r="D${totalRowNumber}" s="40"><v>${totals.total}</v></c><c r="E${totalRowNumber}" s="40"><v>${totals.applicable}</v></c><c r="F${totalRowNumber}" s="40"><v>${totals.score}</v></c></row>`;

  let sheetXml = entry.getData().toString("utf8");
  sheetXml = replaceCellWithInlineString(sheetXml, "B22", plainTextXml("S.No."));
  sheetXml = replaceCellWithInlineString(sheetXml, "C22", plainTextXml("Category"));
  sheetXml = sheetXml.replace(
    /(?:<row\b[^>]*\br="(?:23|24|25|26|27|28|29)"[^>]*>[\s\S]*?<\/row>)+/,
    `${dataRows}${totalRow}`,
  );
  sheetXml = sheetXml.replace(
    /<dimension ref="B4:F\d+"\/>/,
    `<dimension ref="B4:F${totalRowNumber}"/>`,
  );
  const widths = {
    2: 10,
    3: categoryColumnWidth,
    4: 27,
    5: 32,
    6: 18,
  };
  for (const [column, width] of Object.entries(widths)) {
    sheetXml = sheetXml.replace(
      new RegExp(`<col min="${column}" max="${column}"[^>]*\\/>`),
      `<col min="${column}" max="${column}" width="${width}" bestFit="1" customWidth="1"/>`,
    );
  }
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));

  updateTableRange(zip, "xl/tables/table5.xml", 22, totalRowNumber, "F");
  const tablePath = "xl/tables/table5.xml";
  const tableEntry = zip.getEntry(tablePath);
  const tableXml = tableEntry
    .getData()
    .toString("utf8")
    .replace(/name="Category "/, 'name="S.No."')
    .replace(/name="Description "/, 'name="Category"');
  zip.updateFile(tablePath, Buffer.from(tableXml, "utf8"));
};

const imageCellXml = (address, evidence, label, styleId) => {
  if (!evidence?.imageUrl) {
    return `<c r="${address}" s="${styleId}" t="inlineStr"><is>${plainTextXml("N/A")}</is></c>`;
  }

  const imageUrl = String(evidence.imageUrl).replace(/"/g, '""');
  const formula = `_xlfn.IMAGE("${imageUrl}","${label}",0)`;
  return `<c r="${address}" s="${styleId}" t="str"><f>${escapeXml(formula)}</f><v>${escapeXml(label)}</v></c>`;
};

const addNonConformanceStyles = (zip) => {
  const stylesPath = "xl/styles.xml";
  const stylesEntry = zip.getEntry(stylesPath);
  if (!stylesEntry) throw new Error("Report template styles are missing.");

  let stylesXml = stylesEntry.getData().toString("utf8");
  const styleCount = Number(stylesXml.match(/<cellXfs count="(\d+)">/)?.[1]);
  if (!styleCount) throw new Error("Report template cell styles are invalid.");

  const textStyle = styleCount;
  const centerStyle = styleCount + 1;
  const addedStyles = '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>';
  stylesXml = stylesXml
    .replace(
      `<cellXfs count="${styleCount}">`,
      `<cellXfs count="${styleCount + 2}">`,
    )
    .replace("</cellXfs>", `${addedStyles}</cellXfs>`);
  zip.updateFile(stylesPath, Buffer.from(stylesXml, "utf8"));

  return { textStyle, centerStyle };
};

const updateNonConformanceSheet = (zip, responses, categoryNames) => {
  const entryPath = "xl/worksheets/sheet9.xml";
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    throw new Error(
      "Report template sheet is missing: 0.8_SUMMARY OF NON-CONFORMANCE",
    );
  }
  const { textStyle, centerStyle } = addNonConformanceStyles(zip);

  const findings = responses
    .filter((response) => response.responseType === "NON_COMPLIANCE")
    .map((response) => {
      const evidence = response.evidence || [];
      return {
        category:
          response.question?.section?.mainMenu ||
          response.question?.section?.title ||
          "Not available",
        subcategory: response.question?.section?.title || "Not available",
        question: response.question?.text || "Not available",
        criticality:
          response.severity || response.riskAssessment || "Not specified",
        openImage: evidence.find((item) => item.evidenceType === "evidence"),
        closeImage: evidence.find((item) => item.evidenceType === "action"),
      };
    });
  const categories = [
    ...new Set([...categoryNames, ...findings.map(({ category }) => category)]),
  ];
  if (categories.length === 0) categories.push("Not available");

  const rows = [];
  const mergeRanges = [];
  categories.forEach((category, categoryIndex) => {
    const categoryFindings = findings.filter(
      (finding) => finding.category === category,
    );
    const details = categoryFindings.length
      ? categoryFindings
      : [
          {
            category,
            subcategory: "No non-conformance recorded",
            question: "N/A",
            criticality: "N/A",
            openImage: null,
            closeImage: null,
          },
        ];
    const categoryFirstRow = 16 + rows.length;
    const subcategories = new Map();
    for (const finding of details) {
      const groupedFindings = subcategories.get(finding.subcategory) || [];
      groupedFindings.push(finding);
      subcategories.set(finding.subcategory, groupedFindings);
    }

    for (const groupedFindings of subcategories.values()) {
      const subcategoryFirstRow = 16 + rows.length;
      groupedFindings.forEach((finding, index) => {
        rows.push({
          ...finding,
          categoryNumber: categoryIndex + 1,
          showCategory: rows.length === categoryFirstRow - 16,
          showSubcategory: index === 0,
        });
      });
      const subcategoryLastRow = 15 + rows.length;
      if (subcategoryLastRow > subcategoryFirstRow) {
        mergeRanges.push(`D${subcategoryFirstRow}:D${subcategoryLastRow}`);
      }
    }

    const categoryLastRow = 15 + rows.length;
    if (categoryLastRow > categoryFirstRow) {
      mergeRanges.push(`B${categoryFirstRow}:B${categoryLastRow}`);
      mergeRanges.push(`C${categoryFirstRow}:C${categoryLastRow}`);
    }
  });
  const categoryWidth = Math.min(
    60,
    Math.max(24, ...rows.map(({ category }) => Math.ceil(category.length * 1.1) + 2)),
  );
  const subcategoryWidth = Math.min(
    70,
    Math.max(
      28,
      ...rows.map(({ subcategory }) => Math.ceil(subcategory.length * 1.1) + 2),
    ),
  );
  const questionWidth = Math.min(
    80,
    Math.max(
      35,
      ...rows.map(({ question }) => Math.ceil(question.length * 0.7) + 2),
    ),
  );
  const headerRow = `<row r="15" spans="2:9" ht="32" customHeight="1"><c r="B15" s="57" t="inlineStr"><is>${plainTextXml("S.No.")}</is></c><c r="C15" s="57" t="inlineStr"><is>${plainTextXml("Category")}</is></c><c r="D15" s="57" t="inlineStr"><is>${plainTextXml("Subcategory")}</is></c><c r="E15" s="57" t="inlineStr"><is>${plainTextXml("Question")}</is></c><c r="F15" s="57" t="inlineStr"><is>${plainTextXml("Criticality")}</is></c><c r="G15" s="57" t="inlineStr"><is>${plainTextXml("Open")}</is></c><c r="H15" s="57" t="inlineStr"><is>${plainTextXml("Close")}</is></c><c r="I15" s="57" t="inlineStr"><is>${plainTextXml("N/A")}</is></c></row>`;
  const findingRows = rows
    .map((finding, index) => {
      const rowNumber = 16 + index;
      const textLines = Math.max(
        Math.ceil(finding.category.length / Math.max(1, categoryWidth - 2)),
        Math.ceil(finding.subcategory.length / Math.max(1, subcategoryWidth - 2)),
        Math.ceil(finding.question.length / Math.max(1, questionWidth - 2)),
      );
      const hasImage = finding.openImage || finding.closeImage;
      const rowHeight = Math.max(hasImage ? 90 : 30, textLines * 18 + 8);
      const notApplicable = finding.closeImage ? "" : "N/A";
      const serialCell = finding.showCategory
        ? `<c r="B${rowNumber}" s="${centerStyle}"><v>${finding.categoryNumber}</v></c>`
        : `<c r="B${rowNumber}" s="${centerStyle}"/>`;

      return `<row r="${rowNumber}" spans="2:9" ht="${rowHeight}" customHeight="1">${serialCell}<c r="C${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(finding.showCategory ? finding.category : "")}</is></c><c r="D${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(finding.showSubcategory ? finding.subcategory : "")}</is></c><c r="E${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(finding.question)}</is></c><c r="F${rowNumber}" s="${centerStyle}" t="inlineStr"><is>${plainTextXml(finding.criticality)}</is></c>${imageCellXml(`G${rowNumber}`, finding.openImage, "Open evidence", centerStyle)}${imageCellXml(`H${rowNumber}`, finding.closeImage, "Closure evidence", centerStyle)}<c r="I${rowNumber}" s="${centerStyle}" t="inlineStr"><is>${plainTextXml(notApplicable)}</is></c></row>`;
    })
    .join("");
  const totalRowNumber = 16 + rows.length;
  const notApplicableCount = findings.filter(
    (finding) => !finding.closeImage,
  ).length;
  const totalRow = `<row r="${totalRowNumber}" spans="2:9" ht="24" customHeight="1"><c r="B${totalRowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml("Total")}</is></c><c r="C${totalRowNumber}" s="${textStyle}"/><c r="D${totalRowNumber}" s="${textStyle}"/><c r="E${totalRowNumber}" s="${textStyle}"/><c r="F${totalRowNumber}" s="${textStyle}"/><c r="G${totalRowNumber}" s="${textStyle}"/><c r="H${totalRowNumber}" s="${textStyle}"/><c r="I${totalRowNumber}" s="${centerStyle}"><v>${notApplicableCount}</v></c></row>`;

  let sheetXml = entry.getData().toString("utf8");
  sheetXml = sheetXml.replace(
    /<row\b[^>]*\br="15"[^>]*>[\s\S]*?<\/row>/,
    headerRow,
  );
  sheetXml = sheetXml.replace(
    /(?:<row\b[^>]*\br="(?:16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36)"[^>]*>[\s\S]*?<\/row>)+/,
    `${findingRows}${totalRow}`,
  );
  sheetXml = sheetXml.replace(
    /<dimension ref="B4:G\d+"\/>/,
    `<dimension ref="B4:I${totalRowNumber}"/>`,
  );
  sheetXml = sheetXml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, "");
  if (mergeRanges.length > 0) {
    const mergeCells = `<mergeCells count="${mergeRanges.length}">${mergeRanges.map((range) => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`;
    sheetXml = sheetXml.replace("</sheetData>", `</sheetData>${mergeCells}`);
  }
  sheetXml = sheetXml.replace(/<tableParts\b[\s\S]*?<\/tableParts>/, "");
  const widths = {
    2: 10,
    3: categoryWidth,
    4: subcategoryWidth,
    5: questionWidth,
    6: 16,
    7: 22,
    8: 22,
    9: 10,
  };
  for (const [column, width] of Object.entries(widths)) {
    const columnPattern = new RegExp(
      `<col min="${column}" max="${column}"[^>]*\\/>`,
    );
    const columnXml = `<col min="${column}" max="${column}" width="${width}" bestFit="1" customWidth="1"/>`;
    sheetXml = columnPattern.test(sheetXml)
      ? sheetXml.replace(columnPattern, columnXml)
      : sheetXml.replace("</cols>", `${columnXml}</cols>`);
  }
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));

  const relationshipsPath = "xl/worksheets/_rels/sheet9.xml.rels";
  const relationshipsEntry = zip.getEntry(relationshipsPath);
  if (relationshipsEntry) {
    const relationshipsXml = relationshipsEntry
      .getData()
      .toString("utf8")
      .replace(
        /<Relationship\b[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/table"[^>]*\/>/,
        "",
      );
    zip.updateFile(
      relationshipsPath,
      Buffer.from(relationshipsXml, "utf8"),
    );
  }
};

const updateRecommendationsSheet = (
  zip,
  responses,
  {
    workforceNonCompliances = [],
    machineryNonCompliances = [],
    chemicalNonCompliances = [],
  } = {},
) => {
  const entryPath = "xl/worksheets/sheet10.xml";
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    throw new Error(
      "Report template sheet is missing: 0.9_SUMMARY OF RECOMMENDATION",
    );
  }

  const checklistRecommendations = responses
    .filter((response) => response.responseType === "NON_COMPLIANCE")
    .map((response) => {
      const section = response.question?.section;
      const isPreventivePlan = Boolean(
        response.question?.dueDateText || response.question?.documentDueDate,
      );
      const questionText = response.question?.text || "Checklist question";
      const findingText = response.description1?.trim();

      return {
        module: isPreventivePlan
          ? "Preventive Plan"
          : "Preventive Management",
        item: [section?.mainMenu, section?.title].filter(Boolean).join(" / "),
        nonConformance: findingText
          ? `${questionText} - ${findingText}`
          : questionText,
        recommendation:
          response.description2?.trim() || "Recommendation not provided",
      };
    });
  const moduleRecommendations = [
    ...chemicalNonCompliances.map((record) => ({
      module: "Chemical",
      item: record.chemicalName || "Not available",
      nonConformance: record.description1 || "Not provided",
      recommendation: record.description2 || "Recommendation not provided",
    })),
    ...machineryNonCompliances.map((record) => ({
      module: "Machinery",
      item: record.machineryName || "Not available",
      nonConformance: record.description1 || "Not provided",
      recommendation: record.description2 || "Recommendation not provided",
    })),
    ...workforceNonCompliances.map((record) => ({
      module: "Workforce",
      item: [record.workforce, record.subcontractedCompany]
        .filter(Boolean)
        .join(" / "),
      nonConformance: record.description1 || "Not provided",
      recommendation: record.description2 || "Recommendation not provided",
    })),
  ];
  const recommendationRecords = [
    ...moduleRecommendations,
    ...checklistRecommendations.filter(
      (record) => record.module === "Preventive Management",
    ),
    ...checklistRecommendations.filter(
      (record) => record.module === "Preventive Plan",
    ),
  ];
  const rows = recommendationRecords.length
    ? recommendationRecords
    : [
        {
          module: "N/A",
          item: "No non-conformances recorded",
          nonConformance: "N/A",
          recommendation: "No recommendations are required.",
        },
      ];
  const { textStyle, centerStyle } = addNonConformanceStyles(zip);
  const originalItemCount = 4;
  const generatedRowCount = rows.length + 1;
  const rowOffset = generatedRowCount - originalItemCount;
  const moduleWidth = Math.min(
    30,
    Math.max(20, ...rows.map(({ module }) => module.length + 3)),
  );
  const itemWidth = Math.min(
    55,
    Math.max(25, ...rows.map(({ item }) => Math.ceil(item.length * 0.8) + 3)),
  );
  const nonConformanceWidth = Math.min(
    70,
    Math.max(
      35,
      ...rows.map(({ nonConformance }) =>
        Math.ceil(nonConformance.length * 0.65) + 3,
      ),
    ),
  );
  const recommendationWidth = Math.min(
    70,
    Math.max(
      35,
      ...rows.map(({ recommendation }) =>
        Math.ceil(recommendation.length * 0.75) + 3,
      ),
    ),
  );
  const headerRow = `<row r="7" spans="2:6" ht="32" customHeight="1"><c r="B7" s="57" t="inlineStr"><is>${plainTextXml("S.No.")}</is></c><c r="C7" s="57" t="inlineStr"><is>${plainTextXml("Module")}</is></c><c r="D7" s="57" t="inlineStr"><is>${plainTextXml("Item / Area")}</is></c><c r="E7" s="57" t="inlineStr"><is>${plainTextXml("Non-conformance")}</is></c><c r="F7" s="57" t="inlineStr"><is>${plainTextXml("Recommendation")}</is></c></row>`;
  const recommendationRows = rows
    .map((record, index) => {
      const rowNumber = 8 + index;
      const lineCount = Math.max(
        Math.ceil(record.module.length / Math.max(1, moduleWidth - 2)),
        Math.ceil(record.item.length / Math.max(1, itemWidth - 2)),
        Math.ceil(
          record.nonConformance.length /
            Math.max(1, nonConformanceWidth - 2),
        ),
        Math.ceil(
          record.recommendation.length /
            Math.max(1, recommendationWidth - 2),
        ),
      );
      const rowHeight = Math.max(30, lineCount * 18 + 8);

      return `<row r="${rowNumber}" spans="2:6" ht="${rowHeight}" customHeight="1"><c r="B${rowNumber}" s="${centerStyle}"><v>${index + 1}</v></c><c r="C${rowNumber}" s="${centerStyle}" t="inlineStr"><is>${plainTextXml(record.module)}</is></c><c r="D${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(record.item)}</is></c><c r="E${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(record.nonConformance)}</is></c><c r="F${rowNumber}" s="${textStyle}" t="inlineStr"><is>${plainTextXml(record.recommendation)}</is></c></row>`;
    })
    .join("");
  const generatedRows = `${headerRow}${recommendationRows}`;

  let sheetXml = entry.getData().toString("utf8");
  sheetXml = sheetXml.replace(
    /(?:<row\b[^>]*\br="(?:7|8|9|10)"[^>]*>[\s\S]*?<\/row>)+/,
    "__RECOMMENDATION_ROWS__",
  );
  sheetXml = shiftRows(sheetXml, 11, rowOffset);
  sheetXml = sheetXml.replace(
    "__RECOMMENDATION_ROWS__",
    generatedRows,
  );
  sheetXml = sheetXml.replace(
    /<dimension ref="B3:B\d+"\/>/,
    `<dimension ref="B3:F${13 + rowOffset}"/>`,
  );
  const widths = {
    2: 10,
    3: moduleWidth,
    4: itemWidth,
    5: nonConformanceWidth,
    6: recommendationWidth,
  };
  for (const [column, width] of Object.entries(widths)) {
    const columnPattern = new RegExp(
      `<col min="${column}" max="${column}"[^>]*\\/>`,
    );
    const columnXml = `<col min="${column}" max="${column}" width="${width}" bestFit="1" customWidth="1"/>`;
    sheetXml = columnPattern.test(sheetXml)
      ? sheetXml.replace(columnPattern, columnXml)
      : sheetXml.replace("</cols>", `${columnXml}</cols>`);
  }
  const closingRow = 12 + rowOffset;
  sheetXml = sheetXml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, "");
  const mergeCells = `<mergeCells count="3"><mergeCell ref="B3:F3"/><mergeCell ref="B5:F5"/><mergeCell ref="B${closingRow}:F${closingRow}"/></mergeCells>`;
  sheetXml = sheetXml.replace("</sheetData>", `</sheetData>${mergeCells}`);
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));
};

const splitAddress = (address, targetLength = 80) => {
  const normalized = String(address || "").trim();
  if (normalized.length <= targetLength) return [normalized, ""];

  const breakAt = normalized.lastIndexOf(" ", targetLength);
  const splitAt = breakAt > targetLength / 2 ? breakAt : targetLength;
  return [
    normalized.slice(0, splitAt).trim(),
    normalized.slice(splitAt).trim(),
  ];
};

const updateSheet = (zip, sheetName, replacements) => {
  const entryPath = SHEET_PATHS[sheetName];
  const entry = zip.getEntry(entryPath);
  if (!entry) throw new Error(`Report template sheet is missing: ${sheetName}`);

  let sheetXml = entry.getData().toString("utf8");
  for (const [address, richTextXml] of replacements) {
    sheetXml = replaceCellWithInlineString(sheetXml, address, richTextXml);
  }
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));
};

const removeMethodologyFirstColumn = (zip) => {
  const entryPath = SHEET_PATHS["0.5_APPROACH & METHODOLOGY"];
  const entry = zip.getEntry(entryPath);
  if (!entry) {
    throw new Error(
      "Report template sheet is missing: 0.5_APPROACH & METHODOLOGY",
    );
  }

  let sheetXml = entry.getData().toString("utf8");
  sheetXml = sheetXml
    .replace(/<dimension ref="B4:B19"\/>/, '<dimension ref="A4:A19"/>')
    .replace(/<selection activeCell="B19" sqref="B19"\/>/, '<selection activeCell="A19" sqref="A19"/>')
    .replace(
      /<cols><col min="1" max="1"[^>]*\/><col min="2" max="2"([^>]*)\/><\/cols>/,
      '<cols><col min="1" max="1"$1/></cols>',
    )
    .replace(/spans="2:2"/g, 'spans="1:1"')
    .replace(/(<c\b[^>]*\br=")B(\d+")/g, "$1A$2");
  zip.updateFile(entryPath, Buffer.from(sheetXml, "utf8"));

  const drawingPath = "xl/drawings/drawing6.xml";
  const drawingEntry = zip.getEntry(drawingPath);
  if (drawingEntry) {
    const drawingXml = drawingEntry
      .getData()
      .toString("utf8")
      .replace(/(<xdr:col>)4(<\/xdr:col>)/, "$1" + "3" + "$2")
      .replace(/(<xdr:col>)5(<\/xdr:col>)/, "$1" + "4" + "$2");
    zip.updateFile(drawingPath, Buffer.from(drawingXml, "utf8"));
  }
};

// Sheets whose row count is generated dynamically from audit data and can span
// several printed pages. Everything else is a fixed-length narrative page that
// the template already lays out to fit on a single sheet of paper.
const DYNAMIC_TABLE_SHEETS = {
  "xl/worksheets/sheet7.xml": { headerRow: 7 }, // 0.6_Category
  "xl/worksheets/sheet8.xml": { headerRow: 22 }, // 0.7_RESULTS SUMMARY
  "xl/worksheets/sheet9.xml": { headerRow: 15 }, // 0.8_SUMMARY OF NON-CONFORMANCE
  "xl/worksheets/sheet10.xml": { headerRow: 7 }, // 0.9_SUMMARY OF RECOMMENDATION
};

const applyPrintTitles = (zip) => {
  const workbookPath = "xl/workbook.xml";
  const entry = zip.getEntry(workbookPath);
  if (!entry) throw new Error("Report template workbook is missing.");

  const sheetNameByPath = Object.fromEntries(
    Object.entries(SHEET_PATHS).map(([name, path]) => [path, name]),
  );
  sheetNameByPath["xl/worksheets/sheet9.xml"] =
    "0.8_SUMMARY OF NON-CONFORMANCE";
  sheetNameByPath["xl/worksheets/sheet10.xml"] =
    "0.9_SUMMARY OF RECOMMENDATION";

  let workbookXml = entry.getData().toString("utf8");
  const sheetOrder = [
    ...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\/>/g),
  ].map(([, name]) => name);

  const printTitles = Object.entries(DYNAMIC_TABLE_SHEETS)
    .map(([sheetPath, { headerRow }]) => {
      const sheetName = sheetNameByPath[sheetPath];
      const localSheetId = sheetOrder.indexOf(sheetName);
      if (localSheetId === -1) return "";
      return `<definedName name="_xlnm.Print_Titles" localSheetId="${localSheetId}">'${sheetName.replace(/&/g, "&amp;")}'!$${headerRow}:$${headerRow}</definedName>`;
    })
    .join("");

  workbookXml = workbookXml.replace(
    "</definedNames>",
    `${printTitles}</definedNames>`,
  );
  zip.updateFile(workbookPath, Buffer.from(workbookXml, "utf8"));
};

// These sheets print with their real content occupying only part of the page
// width. "Fit to page" scaling can only ever shrink content, never enlarge it,
// so when a sheet's columns are already narrower than the printable area at
// 100%, fitToWidth leaves the leftover space sitting empty on the right. For
// these sheets we instead compute an explicit print `scale` from their actual
// (already-finalized) column widths so the content is stretched or shrunk to
// exactly fill the printable width.
const FILL_WIDTH_SHEETS = new Set([
  "xl/worksheets/sheet5.xml", // 0.4_INTRODUCTION
  "xl/worksheets/sheet6.xml", // 0.5_APPROACH & METHODOLOGY
  "xl/worksheets/sheet7.xml", // 0.6_Category
]);

const PIXELS_PER_INCH = 96;
const DEFAULT_COLUMN_WIDTH = 8.43;

const columnLetterToIndex = (letters) =>
  [...letters].reduce(
    (total, char) => total * 26 + (char.charCodeAt(0) - 64),
    0,
  );

const getColumnWidthLookup = (sheetXml) => {
  const colsXml = sheetXml.match(/<cols>([\s\S]*?)<\/cols>/)?.[1] || "";
  const ranges = [...colsXml.matchAll(/<col\b([^>]*)\/>/g)].map(
    ([, attrs]) => ({
      min: Number(attrs.match(/\bmin="(\d+)"/)?.[1]),
      max: Number(attrs.match(/\bmax="(\d+)"/)?.[1]),
      width: Number(attrs.match(/\bwidth="([\d.]+)"/)?.[1]) || null,
      hidden: /\bhidden="1"/.test(attrs),
    }),
  );

  return (columnIndex) => {
    const range = ranges.find(
      ({ min, max }) => columnIndex >= min && columnIndex <= max,
    );
    return {
      width: range?.width ?? DEFAULT_COLUMN_WIDTH,
      hidden: Boolean(range?.hidden),
    };
  };
};

const computeFillWidthScale = (sheetXml, printableWidthInches) => {
  const dimensionMatch = sheetXml.match(
    /<dimension ref="([A-Z]+)\d+:([A-Z]+)\d+"\/>/,
  );
  if (!dimensionMatch) return null;

  const getColumn = getColumnWidthLookup(sheetXml);
  const firstColumn = columnLetterToIndex(dimensionMatch[1]);
  const lastColumn = columnLetterToIndex(dimensionMatch[2]);

  let contentPixels = 0;
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const { width, hidden } = getColumn(column);
    if (!hidden) contentPixels += width * 7 + 5;
  }
  if (!contentPixels) return null;

  const scale = Math.round(
    (printableWidthInches / (contentPixels / PIXELS_PER_INCH)) * 100,
  );
  return Math.min(400, Math.max(70, scale));
};



const applyPrintSettings = (zip) => {
  const worksheetEntries = zip
    .getEntries()
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName));

  for (const entry of worksheetEntries) {
    let sheetXml = entry.getData().toString("utf8");
    const isDynamicTable = Boolean(DYNAMIC_TABLE_SHEETS[entry.entryName]);   
    const isFillWidthSheet = FILL_WIDTH_SHEETS.has(entry.entryName);    
    const isIntroduction =
      entry.entryName === SHEET_PATHS["0.4_INTRODUCTION"];
    // Dynamic tables flow across as many pages as needed (landscape gives their
    // wide, data-driven columns more room); fixed-length narrative pages are
    // compressed to fit exactly one sheet of paper, as the template intends.
    const orientation = isDynamicTable ? "landscape" : "portrait";

    const pageSetUpPrAttrs = isFillWidthSheet
      ? 'fitToPage="0" autoPageBreaks="1"'
      : 'fitToPage="1" autoPageBreaks="0"';
    if (/<sheetPr\b[^>]*>[\s\S]*?<\/sheetPr>/.test(sheetXml)) {
      sheetXml = sheetXml.replace(
        /<sheetPr\b([^>]*)>([\s\S]*?)<\/sheetPr>/,
        (_sheetPr, attributes, contents) => {
          const printSetup = `<pageSetUpPr ${pageSetUpPrAttrs}/>`;
          const updatedContents = /<pageSetUpPr\b[^>]*\/>/.test(contents)
            ? contents.replace(/<pageSetUpPr\b[^>]*\/>/, printSetup)
            : `${contents}${printSetup}`;
          return `<sheetPr${attributes}>${updatedContents}</sheetPr>`;
        },
      );
    } else {
      sheetXml = sheetXml.replace(
        /(<worksheet\b[^>]*>)/,
        `$1<sheetPr><pageSetUpPr ${pageSetUpPrAttrs}/></sheetPr>`,
      );
    }

    const printOptions = '<printOptions horizontalCentered="1"/>';
    sheetXml = /<printOptions\b[^>]*\/>/.test(sheetXml)
      ? sheetXml.replace(/<printOptions\b[^>]*\/>/, printOptions)
      : sheetXml.replace(/<pageMargins\b/, `${printOptions}<pageMargins`);

    const margins =
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>';
    sheetXml = /<pageMargins\b[^>]*\/>/.test(sheetXml)
      ? sheetXml.replace(/<pageMargins\b[^>]*\/>/, margins)
      : sheetXml.replace(/<pageSetup\b/, `${margins}<pageSetup`);

    const paperWidthInches = orientation === "landscape" ? 11.69 : 8.27;
    const printableWidthInches = paperWidthInches - 0.5;
    const fillScale = isFillWidthSheet
      ? computeFillWidthScale(sheetXml, printableWidthInches)
      : null;

    const pageSetup = isFillWidthSheet
      ? `<pageSetup paperSize="9" orientation="${orientation}" scale="${fillScale ?? 100}" horizontalDpi="0" verticalDpi="0"/>`
      : `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="${isDynamicTable ? 0 : 1}" horizontalDpi="0" verticalDpi="0"/>`;
    sheetXml = /<pageSetup\b[^>]*\/>/.test(sheetXml)
      ? sheetXml.replace(/<pageSetup\b[^>]*\/>/, pageSetup)
      : sheetXml.replace(/<pageMargins\b[^>]*\/>/, `$&${pageSetup}`);

    if (isIntroduction) {
      const introductionPageBreak =
        '<rowBreaks count="1" manualBreakCount="1"><brk id="26" min="0" max="16383" man="1"/></rowBreaks>';
      sheetXml = /<rowBreaks\b[\s\S]*?<\/rowBreaks>/.test(sheetXml)
        ? sheetXml.replace(
            /<rowBreaks\b[\s\S]*?<\/rowBreaks>/,
            introductionPageBreak,
          )
        : sheetXml.replace(
            /(<pageSetup\b[^>]*\/>)/,
            `$1${introductionPageBreak}`,
          );
    }

    zip.updateFile(entry.entryName, Buffer.from(sheetXml, "utf8"));
  }

  applyPrintTitles(zip);
};

const buildAuditReportWorkbook = ({
  report,
  responses,
  workforceNonCompliances = [],
  machineryNonCompliances = [],
  chemicalNonCompliances = [],
}) => {
  if (!fs.existsSync(templatePath)) {
    throw new Error("Audit report template is not available.");
  }

  const templateWorkbook = XLSX.readFile(templatePath, { cellStyles: true });
  const zip = new AdmZip(templatePath);
  const project = report.project;
  const company = project.company;
  const auditType = report.audit.auditType;
  const visitDate = formatDate(
    report.audit.schedules?.[0]?.date || report.createdAt,
  );
  const categoryNames = getCategoryNames(report, responses);
  const categorySummary = getCategorySummary(report, responses, categoryNames);
  const [addressLine1, addressLine2] = splitAddress(project.siteAddress);
  const companySiteIncharge = company.users?.[0];
  const siteInchargeName =
    project.siteIncharge?.fullName ||
    project.siteIncharge?.username ||
    companySiteIncharge?.fullName ||
    companySiteIncharge?.username ||
    "Not available";
  const responsiblePersonName =
    project.regionalManager?.fullName ||
    project.corporateManager?.fullName ||
    project.siteUser?.fullName ||
    "Not available";

  updateSheet(zip, "0.0_Cover Page", [
    ["C14", plainTextXml(auditType)],
    ["E22", plainTextXml(company.companyName)],
    ["E23", plainTextXml(project.siteAddress)],
    ["E27", plainTextXml(report.auditor.fullName)],
    ["E29", plainTextXml(visitDate)],
  ]);

  const executiveSummary = templateWorkbook.Sheets["0.3_Executive Summary"];
  updateSheet(zip, "0.3_Executive Summary", [
    [
      "B7",
      replaceBlueRuns(executiveSummary.B7.r, [
        company.companyName,
        auditType,
        project.siteAddress,
      ]),
    ],
    ["B8", replaceBlueRuns(executiveSummary.B8.r, [visitDate])],
  ]);

  const introduction = templateWorkbook.Sheets["0.4_INTRODUCTION"];
  updateSheet(zip, "0.4_INTRODUCTION", [
    [
      "B9",
      replaceBlueRuns(introduction.B9.r, [company.companyName]),
    ],
    ["B10", replaceBlueRuns(introduction.B10.r, [auditType])],
    ["B11", blueTextXml(addressLine1)],
    ["B12", replaceBlueRuns(introduction.B12.r, [addressLine2, ","])],
    ["C28", blueTextXml(project.projectName)],
    ["C29", blueTextXml(project.siteAddress)],
    ["C30", blueTextXml(siteInchargeName)],
    ["C31", blueTextXml(responsiblePersonName)],
    ["C32", blueTextXml(visitDate)],
    ["C33", blueTextXml(report.auditor.fullName)],
  ]);

  const methodology =
    templateWorkbook.Sheets["0.5_APPROACH & METHODOLOGY"];
  updateSheet(zip, "0.5_APPROACH & METHODOLOGY", [
    ["B17", replaceBlueRuns(methodology.B17.r, [` ${auditType}.`])],
  ]);
  removeMethodologyFirstColumn(zip);

  updateCategorySheet(zip, categoryNames);
  updateResultsSummarySheet(zip, categorySummary);
  updateNonConformanceSheet(zip, responses, categoryNames);
  updateRecommendationsSheet(zip, responses, {
    workforceNonCompliances,
    machineryNonCompliances,
    chemicalNonCompliances,
  });
  applyPrintSettings(zip);

  return zip.toBuffer();
};

module.exports = { buildAuditReportWorkbook };
