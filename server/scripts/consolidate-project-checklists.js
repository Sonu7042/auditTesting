/**
 * One-off data migration: consolidate duplicate ProjectChecklistSection /
 * ProjectChecklistQuestion rows created by the old per-audit-cycle checklist
 * cloning bug into a single canonical tree per (projectId, checklistType).
 *
 * Prerequisite: Migration A
 * (20260709010000_project_scope_checklist_expand) must already be applied,
 * so ProjectChecklistSection has projectId/checklistType (backfilled) while
 * its OLD auditId column is still present. This script reads that old column
 * via raw SQL (it's no longer part of the Prisma schema/client) to figure out
 * which cycle each duplicate section originally belonged to.
 *
 * Usage:
 *   node scripts/consolidate-project-checklists.js --dry-run   (default, safe)
 *   node scripts/consolidate-project-checklists.js --execute   (applies changes)
 *
 * Run --dry-run first, review the JSON report in scripts/output/, then run
 * --execute. Only after this has been run for real should Migration C
 * (20260709030000_project_scope_checklist_contract) be applied.
 */

const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/prisma");

const DRY_RUN = !process.argv.includes("--execute");

const DOCUMENT_FIELDS = [
  "documentDueDate",
  "documentImageUrl",
  "documentImagePublicId",
  "documentImageName",
  "documentImageType",
  "documentComment",
  "documentRejectionRemark",
  "documentCorrectionComment",
  "documentCorrectionRequestedAt",
  "documentSentToAdmin",
  "documentSubmittedAt",
  "documentStatus",
];

const STATUS_RANK = {
  Approved: 3,
  Rejected: 2,
  "Not Approved": 2,
  Pending: 1,
};

const statusRank = (status) => STATUS_RANK[status] ?? 1;

const sectionMatchKey = (section) =>
  section.sourceSectionId
    ? `src:${section.sourceSectionId}`
    : `pos:${section.mainMenuNumber || ""}|${section.sectionNumber || ""}`;

const questionMatchKey = (question) =>
  question.sourceQuestionId
    ? `src:${question.sourceQuestionId}`
    : `num:${question.questionNumber || ""}`;

// Picks the better of two document-approval states using
// Approved > Rejected/Not Approved > Pending, then latest documentSubmittedAt.
const pickBetterDocumentState = (current, candidate) => {
  const currentRank = statusRank(current.documentStatus);
  const candidateRank = statusRank(candidate.documentStatus);

  if (candidateRank > currentRank) return candidate;
  if (candidateRank < currentRank) return current;

  const currentAt = current.documentSubmittedAt
    ? new Date(current.documentSubmittedAt).getTime()
    : 0;
  const candidateAt = candidate.documentSubmittedAt
    ? new Date(candidate.documentSubmittedAt).getTime()
    : 0;

  return candidateAt > currentAt ? candidate : current;   

};

const pickCanonicalAudit = (audits) => {
  const roots = audits.filter((a) => !a.previousAuditId);
  const pool = roots.length > 0 ? roots : audits;   
  return [...pool].sort((a, b) => { 
    if ((a.cycleNumber || 1) !== (b.cycleNumber || 1)) {
      return (a.cycleNumber || 1) - (b.cycleNumber || 1);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;            
  })[0];
};





const oldAuditIdColumnExists = async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ProjectChecklistSection' AND column_name = 'auditId'
  `);
  return rows.length > 0;
};

const loadSectionsWithOldAuditId = async () => {
  // Raw query: "auditId" is no longer declared on the Prisma model (the
  // schema has already moved to projectId/checklistType) but the column is
  // still physically present on the table until Migration C runs.
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      pcs.id,
      pcs."projectId",
      pcs."checklistType",
      pcs."auditId" AS "oldAuditId",
      pcs."sourceSectionId",
      pcs."mainMenuNumber",
      pcs."sectionNumber"
    FROM "ProjectChecklistSection" pcs
  `);
  return rows;
};

const run = async () => {
  const report = {
    dryRun: DRY_RUN,
    startedAt: new Date().toISOString(),
    groups: [],
    warnings: [],
  };

  if (!(await oldAuditIdColumnExists())) {
    console.log(
      "ProjectChecklistSection.auditId no longer exists on this database " +
        "(the contract migration has already been applied, or this is a " +
        "fresh install) - nothing to consolidate.",
    );
    return;
  }

  const sections = await loadSectionsWithOldAuditId();

  const groupsByTrack = new Map();
  for (const section of sections) {
    const key = `${section.projectId}::${section.checklistType}`;  
    if (!groupsByTrack.has(key)) groupsByTrack.set(key, []);
    groupsByTrack.get(key).push(section);
  }

  for (const [trackKey, trackSections] of groupsByTrack.entries()) {
    const distinctAuditIds = [
      ...new Set(trackSections.map((s) => s.oldAuditId).filter(Boolean)),     
    ];  


    if (distinctAuditIds.length <= 1) continue;

    const [projectId, checklistType] = trackKey.split("::");
    const groupReport = {
      projectId,
      checklistType,
      auditIds: distinctAuditIds,                              
      canonicalAuditId: null,                    
      sectionsMerged: 0,     
      sectionsKeptUnmatched: 0,        
      questionsMerged: 0,    
      questionsReparented: 0,
      responsesRepointed: 0,
    };

    const audits = await prisma.audit.findMany({
      where: { id: { in: distinctAuditIds } },
      select: { id: true, previousAuditId: true, cycleNumber: true },
    });

    if (audits.length !== distinctAuditIds.length) {
      report.warnings.push(
        `Track ${trackKey}: some auditIds referenced by ProjectChecklistSection no longer exist as Audit rows; skipping this group.`,
      );
      continue;
    }

    const canonicalAudit = pickCanonicalAudit(audits);
    groupReport.canonicalAuditId = canonicalAudit.id;

    if (audits.filter((a) => !a.previousAuditId).length > 1) {
      report.warnings.push(
        `Track ${trackKey}: multiple root (previousAuditId=null) audits found; picked ${canonicalAudit.id} by lowest cycleNumber/id. Review manually.`,
      );
    }

    const canonicalSectionIds = trackSections
      .filter((s) => s.oldAuditId === canonicalAudit.id)
      .map((s) => s.id);

    const canonicalSections = await prisma.projectChecklistSection.findMany({
      where: { id: { in: canonicalSectionIds } },
      include: { questions: true },
    });

    const canonicalSectionByKey = new Map(
      canonicalSections.map((s) => [sectionMatchKey(s), s]),
    );

    const duplicateSectionRows = trackSections.filter(
      (s) => s.oldAuditId !== canonicalAudit.id,
    );

    for (const dupRow of duplicateSectionRows) {
      const canonicalSection = canonicalSectionByKey.get(
        sectionMatchKey(dupRow),
      );

      if (!canonicalSection) {
        groupReport.sectionsKeptUnmatched += 1;
        continue;
      }

      const dupSection = await prisma.projectChecklistSection.findUnique({
        where: { id: dupRow.id },
        include: { questions: true },
      });

      if (!dupSection) continue;

      const canonicalQuestionByKey = new Map(
        canonicalSection.questions.map((q) => [questionMatchKey(q), q]),
      );

      for (const dupQuestion of dupSection.questions) {
        const canonicalQuestion = canonicalQuestionByKey.get(
          questionMatchKey(dupQuestion),
        );

        if (!canonicalQuestion) {
          // Custom question unique to this cycle: move it under the
          // canonical section instead of deleting it.
          groupReport.questionsReparented += 1;
          if (!DRY_RUN) {
            await prisma.projectChecklistQuestion.update({
              where: { id: dupQuestion.id },
              data: { sectionId: canonicalSection.id },
            });
          }
          continue;
        }

        const currentDocState = Object.fromEntries(
          DOCUMENT_FIELDS.map((f) => [f, canonicalQuestion[f]]),
        );
        const candidateDocState = Object.fromEntries(
          DOCUMENT_FIELDS.map((f) => [f, dupQuestion[f]]),
        );
        const best = pickBetterDocumentState(
          currentDocState,
          candidateDocState,
        );

        const docStateChanged = DOCUMENT_FIELDS.some(
          (f) => best[f] !== currentDocState[f],
        );

        if (!DRY_RUN && docStateChanged) {
          await prisma.projectChecklistQuestion.update({
            where: { id: canonicalQuestion.id },
            data: best,
          });
        }

        const responsesToRepoint = await prisma.auditQuestionResponse.findMany(
          {
            where: { questionId: dupQuestion.id },
            select: { id: true },
          },
        );

        groupReport.responsesRepointed += responsesToRepoint.length;

        if (!DRY_RUN && responsesToRepoint.length > 0) {
          await prisma.auditQuestionResponse.updateMany({
            where: { questionId: dupQuestion.id },
            data: { questionId: canonicalQuestion.id },
          });
        }

        groupReport.questionsMerged += 1;
      }

      groupReport.sectionsMerged += 1;

      if (!DRY_RUN) {
        // Cascade-deletes any remaining (already response-detached, unmerged
        // duplicate) question rows under this section.
        await prisma.projectChecklistSection.delete({
          where: { id: dupSection.id },
        });
      }
    }

    report.groups.push(groupReport);
  }

  report.finishedAt = new Date().toISOString();

  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `consolidate-project-checklists-${DRY_RUN ? "dry-run" : "executed"}-${Date.now()}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Consolidation report written to ${outFile}`);
  console.log(
    `Groups with duplicates: ${report.groups.length}, warnings: ${report.warnings.length}`,
  );
  for (const group of report.groups) {
    console.log(
      `  project=${group.projectId} checklistType=${group.checklistType} canonicalAudit=${group.canonicalAuditId} ` +
        `sectionsMerged=${group.sectionsMerged} sectionsKeptUnmatched=${group.sectionsKeptUnmatched} ` +
        `questionsMerged=${group.questionsMerged} questionsReparented=${group.questionsReparented} ` +
        `responsesRepointed=${group.responsesRepointed}`,
    );
  }
  for (const warning of report.warnings) {
    console.warn(`  WARNING: ${warning}`);
  }
};

run()
  .catch((error) => {
    console.error("Consolidation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
