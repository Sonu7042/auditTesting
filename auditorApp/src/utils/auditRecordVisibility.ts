export const isCurrentAuditRecord = (
  recordDate?: string | null,
  auditStartedAt?: string | null,
): boolean => {
  if (!auditStartedAt) return true;

  const recordTime = new Date(recordDate || '').getTime();
  const auditStartTime = new Date(auditStartedAt).getTime();

  if (!Number.isFinite(recordTime) || !Number.isFinite(auditStartTime)) {
    return true;
  }

  return recordTime < auditStartTime;
};

export const filterCurrentAuditRecords = <T extends {createdAt?: string | null}>(
  items: T[] = [],
  auditStartedAt?: string | null,
): T[] => items.filter(item => isCurrentAuditRecord(item.createdAt, auditStartedAt));
