-- Every scheduled occurrence must own a distinct Audit record. Existing
-- reports/timers/responses remain attached to the earliest occurrence; later
-- occurrences receive clean audit instances and therefore remain pending.
DO $$
DECLARE
  audit_group RECORD;
  schedule_row RECORD;
  source_audit RECORD;
  template_section RECORD;
  template_question RECORD;
  new_audit_id TEXT;
  new_section_id TEXT;
  previous_audit_id TEXT;
  next_cycle INTEGER;
BEGIN
  FOR audit_group IN
    SELECT "auditId"
    FROM "AuditSchedule"
    GROUP BY "auditId"
    HAVING COUNT(*) > 1
  LOOP
    SELECT * INTO source_audit
    FROM "Audit"
    WHERE "id" = audit_group."auditId";

    previous_audit_id := source_audit."id";
    next_cycle := COALESCE(source_audit."cycleNumber", 1) + 1;

    FOR schedule_row IN
      SELECT scheduled."id"
      FROM "AuditSchedule" scheduled
      WHERE scheduled."auditId" = audit_group."auditId"
      ORDER BY scheduled."date" ASC, scheduled."createdAt" ASC, scheduled."id" ASC
      OFFSET 1
    LOOP
      new_audit_id := md5(random()::text || clock_timestamp()::text || schedule_row."id");

      INSERT INTO "Audit" (
        "id", "auditType", "cycleNumber", "previousAuditId",
        "checklistType", "frequency", "numberOfAudits", "projectId"
      ) VALUES (
        new_audit_id, source_audit."auditType", next_cycle,
        previous_audit_id, source_audit."checklistType",
        source_audit."frequency", source_audit."numberOfAudits",
        source_audit."projectId"
      );

      INSERT INTO "AuditAuditor" ("id", "auditId", "userId", "isNotified")
      SELECT
        md5(random()::text || clock_timestamp()::text || assigned."userId"),
        new_audit_id,
        assigned."userId",
        FALSE
      FROM "ScheduledAuditor" assigned
      WHERE assigned."scheduleId" = schedule_row."id";

      IF NOT EXISTS (
        SELECT 1 FROM "AuditAuditor" WHERE "auditId" = new_audit_id
      ) THEN
        INSERT INTO "AuditAuditor" ("id", "auditId", "userId", "isNotified")
        SELECT
          md5(random()::text || clock_timestamp()::text || source_assignment."userId"),
          new_audit_id,
          source_assignment."userId",
          FALSE
        FROM "AuditAuditor" source_assignment
        WHERE source_assignment."auditId" = source_audit."id";
      END IF;

      FOR template_section IN
        SELECT *
        FROM "Section"
        WHERE "templateId" = source_audit."checklistType"
      LOOP
        new_section_id := md5(random()::text || clock_timestamp()::text || template_section."id");

        INSERT INTO "ProjectChecklistSection" (
          "id", "title", "mainMenu", "mainMenuNumber", "sectionNumber",
          "sourceSectionId", "auditId", "isLocked"
        ) VALUES (
          new_section_id, template_section."title", template_section."mainMenu",
          template_section."mainMenuNumber", template_section."sectionNumber",
          template_section."id", new_audit_id, template_section."isLocked"
        );

        FOR template_question IN
          SELECT *
          FROM "Question"
          WHERE "sectionId" = template_section."id"
        LOOP
          INSERT INTO "ProjectChecklistQuestion" (
            "id", "text", "isLocked", "dueDateText", "questionNumber",
            "sourceQuestionId", "sectionId"
          ) VALUES (
            md5(random()::text || clock_timestamp()::text || template_question."id"),
            template_question."text", template_question."isLocked",
            template_question."dueDateText", template_question."questionNumber",
            template_question."id", new_section_id
          );
        END LOOP;
      END LOOP;

      UPDATE "AuditSchedule"
      SET "auditId" = new_audit_id
      WHERE "id" = schedule_row."id";

      previous_audit_id := new_audit_id;
      next_cycle := next_cycle + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "AuditSchedule_auditId_key" ON "AuditSchedule"("auditId");
