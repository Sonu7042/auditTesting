-- This migration can run before the snapshot-item table is created on a fresh
-- database. Rename the legacy index only when it already exists.
DO $$
BEGIN
  IF to_regclass('public."LocationChecklistSnapshotItem_snapshotId_moduleCode_sortOrder_i"') IS NOT NULL THEN
    ALTER INDEX "LocationChecklistSnapshotItem_snapshotId_moduleCode_sortOrder_i"
      RENAME TO "LocationChecklistSnapshotItem_snapshotId_moduleCode_sortOrd_idx";
  END IF;
END $$;
 
