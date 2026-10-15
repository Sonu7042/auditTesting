# Pending migrations (not yet applied)

Migrations in this folder are intentionally kept **outside** `prisma/migrations`
so that `prisma migrate deploy` does not apply them automatically. Prisma applies
every pending migration it finds in one run with no pause in between, so a
migration that depends on a manual data-fixup step running first cannot safely
live in the normal migrations folder until that step has actually happened.

## `20260709030000_project_scope_checklist_contract`

This is the "contract" step of the three-phase migration that made
`ProjectChecklistSection` project-scoped instead of audit-scoped (see the plan
this shipped under: fixing duplicate checklist/document data across audit
cycles). It drops the old `ProjectChecklistSection.auditId` column and makes
the new `projectId`/`checklistType`/`AuditQuestionResponse.auditId` columns
mandatory.

**Do not move this into `prisma/migrations` and deploy until, for this
environment's database:**

1. `20260709010000_project_scope_checklist_expand` has been applied
   (`prisma migrate deploy`), and
2. `node scripts/consolidate-project-checklists.js --dry-run` has been run and
   its report reviewed, and
3. `node scripts/consolidate-project-checklists.js --execute` has been run for
   real against that database.

Only then: move this folder back into `prisma/migrations/` and run
`prisma migrate deploy` again to apply it.
