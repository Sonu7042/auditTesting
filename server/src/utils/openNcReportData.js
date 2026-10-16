const prisma = require("../config/prisma");

const OPEN_NC_FILTER = { evidence: { none: { evidenceType: "action" } } };

const text = (value, fallback = "N/A") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString("en-GB");
};

const evidence = (items = []) =>
  items
    .filter((item) => item.evidenceType !== "action")
    .map((item, index) => ({
      name: text(item.imageName, `Evidence ${index + 1}`),
      url: item.imageUrl || null,
    }));

const fields = (items) =>
  items.filter((item) => item.value && String(item.value).trim());

const checklistFinding = (response) => ({
  summary: text(response.description1, response.question?.text || "Open NC"),
  fields: fields([
    { label: "Question", value: response.question?.text },
    { label: "Risk", value: response.riskAssessment || response.severity },
    { label: "Corrective action", value: response.description2 },
    { label: "Preventive action", value: response.preventivePlan },
  ]),
  evidence: evidence(response.evidence),
});

const documentFinding = (question) => ({
  summary: text(
    question.documentRejectionRemark,
    `${question.text || "Document"} was not approved`,
  ),
  fields: fields([
    { label: "Document", value: question.text },
    { label: "Observation", value: question.documentComment },
    { label: "Corrective action", value: question.documentCorrectionComment },
    { label: "Responsible", value: question.documentSubmitter?.fullName },
    {
      label: "Target date",
      value: question.documentDueDate ? formatDate(question.documentDueDate) : null,
    },
  ]),
  evidence: question.documentImageUrl
    ? [{ name: text(question.documentImageName, "Document evidence"), url: question.documentImageUrl }]
    : [],
});

const moduleFinding = (record, identityFields) => ({
  summary: text(record.description1, "Open NC"),
  fields: fields([
    ...identityFields,
    { label: "Corrective / preventive action", value: record.description2 },
  ]),
  evidence: evidence(record.evidence),
});

const moduleWhere = (report) => ({
  projectId: report.projectId,
  auditorId: report.auditorId,
  ...(report.audit?.cycleNumber <= 1
    ? { OR: [{ auditId: report.auditId }, { auditId: null }] }
    : { auditId: report.auditId }),
  ...OPEN_NC_FILTER,
});

const buildCategories = (sections, responses, documents) => {
  const categories = new Map();
  const ensure = (section) => {
    const key = `${section?.mainMenuNumber || ""}-${section?.mainMenu || "Checklist"}`;
    if (!categories.has(key)) {
      categories.set(key, {
        number: section?.mainMenuNumber || "",
        title: section?.mainMenu || section?.title || "Checklist",
        openItems: [],
        planningActions: [],
      });
    }
    return categories.get(key);
  };

  sections.forEach(ensure);
  responses.forEach((response) => {
    const category = ensure(response.question?.section);
    category.openItems.push(checklistFinding(response));
    const action = text(response.description2 || response.preventivePlan, "");
    if (action && !category.planningActions.includes(action)) {
      category.planningActions.push(action);
    }
  });
  documents.forEach((question) => {
    const category = ensure(question.section);
    category.openItems.push(documentFinding(question));
    const action = text(
      question.documentCorrectionComment || question.documentRejectionRemark,
      "",
    );
    if (action && !category.planningActions.includes(action)) {
      category.planningActions.push(action);
    }
  });

  return [...categories.values()].sort((first, second) => {
    const a = Number.parseFloat(first.number);
    const b = Number.parseFloat(second.number);
    if (Number.isNaN(a)) return 1;
    if (Number.isNaN(b)) return -1;
    return a - b;
  });
};

const getOpenNcReportData = async (report) => {
  const where = moduleWhere(report);
  const [responses, documents, workers, machinery, chemicals, sections] =
    await Promise.all([
      prisma.auditQuestionResponse.findMany({
        where: {
          auditId: report.auditId,
          auditorId: report.auditorId,
          responseType: "NON_COMPLIANCE",
          ...OPEN_NC_FILTER,
        },
        include: { evidence: true, question: { include: { section: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.projectChecklistQuestion.findMany({
        where: {
          approvalStatus: "Approved",
          documentStatus: "Not Approved",
          section: {
            projectId: report.projectId,
            checklistType: report.audit.checklistType,
            approvalStatus: "Approved",
          },
        },
        include: {
          section: true,
          documentSubmitter: { select: { fullName: true } },
        },
        orderBy: { questionNumber: "asc" },
      }),
      prisma.workforceNonCompliance.findMany({
        where,
        include: { evidence: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.machineryNonCompliance.findMany({
        where,
        include: { evidence: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.chemicalNonCompliance.findMany({
        where,
        include: { evidence: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.projectChecklistSection.findMany({
        where: {
          projectId: report.projectId,
          checklistType: report.audit.checklistType,
          approvalStatus: "Approved",
        },
        select: { title: true, mainMenu: true, mainMenuNumber: true },
      }),
    ]);

  const categories = buildCategories(sections, responses, documents);
  const workerFindings = workers.map((record) =>
    moduleFinding(record, [
      { label: "Worker", value: record.workforce },
      { label: "Role", value: record.workforceRole },
      { label: "Subcontractor", value: record.subcontractedCompany },
      { label: "Responsible / phone", value: record.phoneNumber },
    ]),
  );
  const machineryFindings = machinery.map((record) =>
    moduleFinding(record, [{ label: "Machinery", value: record.machineryName }]),
  );
  const chemicalFindings = chemicals.map((record) =>
    moduleFinding(record, [{ label: "Chemical", value: record.chemicalName }]),
  );
  const planningItems = [
    ...categories.flatMap((category) =>
      category.planningActions.map((action) => ({
        category: category.title,
        action,
      })),
    ),
    ...workers.map((record) => ({
      category: "Workforce",
      action: text(record.description2, ""),
    })),
    ...machinery.map((record) => ({
      category: "Machinery",
      action: text(record.description2, ""),
    })),
    ...chemicals.map((record) => ({
      category: "Chemical",
      action: text(record.description2, ""),
    })),
  ].filter((item) => item.action);

  return {
    companyName: text(report.project?.company?.companyName),
    constructionSite: text(report.project?.projectName),
    auditDate: formatDate(
      report.audit?.schedules?.[0]?.date || report.completedAt || report.createdAt,
    ),
    technicalDescription: text(report.technicalDescription),
    observations: text(report.observations),
    subcontractors: text(report.subcontractors, "-"),
    categories,
    planningItems,
    workers: workerFindings,
    machinery: machineryFindings,
    auxiliaryTools: [],
    chemicals: chemicalFindings,
    auditorName: text(report.auditor?.fullName),
    auditorSignatureUrl: report.auditorSignatureUrl || null,
    totalOpenNcCount:
      responses.length +
      documents.length +
      workerFindings.length +
      machineryFindings.length +
      chemicalFindings.length,
  };
};

module.exports = { getOpenNcReportData, OPEN_NC_FILTER };
