import {Tone} from '../ui/theme';
import {Job, Question, Report, SnapshotItem} from '../types/field';

/* ---------- dates ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fmtDay = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
};
export const fmtLongDay = (d: string | Date) => {
  const x = new Date(d);
  return `${DAYS[x.getDay()]}, ${x.getDate()} ${MONTHS[x.getMonth()]}`;
};
export const fmtDate = (d?: string | Date | null) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};
export const monthName = (m: number) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];
export const dayKey = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const sameDay = (a: string | Date, b: string | Date) => dayKey(a) === dayKey(b);
export const durationText = (from: string | Date, to: string | Date = new Date()) => {
  const mins = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  return `${Math.floor(mins / 60)} h ${pad(mins % 60)} min`;
};
export const daysUntil = (d: string | Date) => Math.ceil((new Date(d).getTime() - Date.now()) / 864e5);

/* ---------- labels ---------- */
export const FACILITY: Record<string, string> = {SHOWROOM: 'Showroom', WORKSHOP: 'Workshop', STOCKYARD: 'Stockyard'};
export const DISCIPLINE: Record<string, string> = {INFRASTRUCTURE: 'Infrastructure', FIRE: 'Fire and life safety', ELECTRICAL: 'Electrical', THERMOGRAPHY: 'Thermography'};
export const DISCIPLINE_SHORT: Record<string, string> = {INFRASTRUCTURE: 'Infrastructure', FIRE: 'Fire and life', ELECTRICAL: 'Electrical', THERMOGRAPHY: 'Thermography', SHARED: 'Shared'};
export const TRACK_DISCIPLINES: Record<string, string[]> = {A: ['INFRASTRUCTURE', 'FIRE'], B: ['ELECTRICAL', 'THERMOGRAPHY'], ALL: ['INFRASTRUCTURE', 'FIRE', 'ELECTRICAL', 'THERMOGRAPHY']};
export const SEVERITY: Record<string, {label: string; tone: Tone}> = {
  CRITICAL: {label: 'Critical', tone: 'red'},
  HIGH: {label: 'High', tone: 'red'},
  MEDIUM: {label: 'Medium', tone: 'amber'},
  LOW: {label: 'Low', tone: 'gray'},
};
export const PRIORITY: Record<string, string> = {IMPORTANT_URGENT: 'Important & urgent', URGENT: 'Urgent', IMPORTANT: 'Important', REST: 'Rest'};
export const CORRECTION_CATEGORY: Record<string, string> = {
  INCORRECT_RESPONSE: 'Answer looks wrong',
  INSUFFICIENT_EVIDENCE: 'Not enough evidence',
  EVIDENCE_QUALITY: 'Evidence unclear',
  SCORING_MISMATCH: 'Score does not match',
  MISSING_OBSERVATION: 'Observation missing',
  RISK_CLASSIFICATION: 'Risk level',
  MEASUREMENT_VERIFICATION: 'Check the measurement',
  REPORT_DETAIL: 'Report detail',
};
export const ANSWER_LABEL: Record<string, string> = {COMPLIANT: 'OK', NON_COMPLIANT: 'Not OK', NA: 'N/A'};

export const facilityName = (job: Pick<Job, 'facilityType' | 'location'>) => (job.facilityType ? FACILITY[job.facilityType] || job.facilityType : job.location.locationName);
export const jobTitle = (job: Pick<Job, 'facilityType' | 'location'>) => `${job.location.dealerName}, ${facilityName(job)}`;
export const facilityTier = (job: Job) => job.location.facilities?.find(f => f.facilityType === job.facilityType)?.tier || null;

/* ---------- job state for one auditor ---------- */
export const CHECKIN_EARLY_MIN = 60;
export const CHECKIN_LATE_MIN = 120;
export const myAssignment = (job: Pick<Job, 'assignments'>, uid?: string) => job.assignments.find(a => a.auditorId === uid);
export const partnerOf = (job: Pick<Job, 'assignments'>, uid?: string) => job.assignments.find(a => a.auditorId !== uid);
export const mySession = (job: Job, uid?: string) => (job.sessions || []).find(x => x.auditorId === uid);
export const isLead = (job: Pick<Job, 'assignments'>, uid?: string) => job.assignments.some(a => a.auditorId === uid && a.assignmentRole === 'LEAD');
export const trackOf = (job: Job, uid?: string) => myAssignment(job, uid)?.track || 'ALL';
export const trackLabel = (track: string) => (track === 'ALL' ? 'Full scope' : `Track ${track}`);
export const checkInOpensAt = (job: Job) => new Date(new Date(job.scheduledStart).getTime() - CHECKIN_EARLY_MIN * 60000);
export const checkInClosesAt = (job: Job) => new Date(new Date(job.scheduledEnd).getTime() + CHECKIN_LATE_MIN * 60000);
export const inCheckInWindow = (job: Job, now = new Date()) => job.isDemo || (now >= checkInOpensAt(job) && now <= checkInClosesAt(job));

export type JobPhase = 'IN_PROGRESS' | 'DONE' | 'TODAY' | 'UPCOMING' | 'MISSED' | 'CANCELLED';
export const jobPhase = (job: Job, uid?: string, now = new Date()): JobPhase => {
  const session = mySession(job, uid);
  if (job.status === 'CANCELLED') return 'CANCELLED';
  if (session?.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (session?.status === 'COMPLETED' || job.status === 'COMPLETED') return 'DONE';
  if (sameDay(job.scheduledStart, now)) return now > checkInClosesAt(job) ? 'MISSED' : 'TODAY';
  if (new Date(job.scheduledStart) > now) return 'UPCOMING';
  return now > checkInClosesAt(job) ? 'MISSED' : 'TODAY';
};

/* ---------- checklist scope (mirrors server/src/utils/auditScope.js) ---------- */
const FACILITY_MODULES: Record<string, string[]> = {
  SHOWROOM: ['SR_SHOWROOM', 'MANPOWER_SALES'],
  WORKSHOP: ['WS_WORKSHOP', 'TOOLS_REGISTER', 'MANPOWER_SERVICE'],
  STOCKYARD: ['SY_STOCKYARD', 'MANPOWER_YARD'],
};
const SITE_MODULES = ['SITE_SHARED', 'EFS_SAFETY', 'THERMOGRAPHY'];
const defaultDiscipline = (moduleCode: string) => (moduleCode === 'THERMOGRAPHY' ? 'THERMOGRAPHY' : moduleCode === 'EFS_SAFETY' ? 'ELECTRICAL' : 'INFRASTRUCTURE');
export const itemDiscipline = (item: SnapshotItem) => item.itemData?.discipline || defaultDiscipline(item.moduleCode);
export const itemsInJobScope = (items: SnapshotItem[], job: Pick<Job, 'facilityType' | 'includesShared'>) => {
  if (!job.facilityType) return items;
  const modules = new Set([...(FACILITY_MODULES[job.facilityType] || []), ...(job.includesShared ? SITE_MODULES : [])]);
  return items.filter(i => modules.has(i.moduleCode));
};

/* Tabs on the audit overview: shared premises items get their own tab, the rest group by discipline. */
export const groupKeyOf = (q: Question, moduleCode: string) => (moduleCode === 'SITE_SHARED' ? 'SHARED' : q.discipline || defaultDiscipline(moduleCode));
export const GROUP_ORDER = ['INFRASTRUCTURE', 'FIRE', 'ELECTRICAL', 'THERMOGRAPHY', 'SHARED'];

/* ---------- report score (mirrors server/src/utils/auditScoring.js) ---------- */
const RATINGS: Array<[string, number]> = [['A+', 90], ['A', 80], ['B', 70], ['C', 60], ['D', 0]];
const RATING_ORDER = ['D', 'C', 'B', 'A', 'A+'];
const cap = (r: string, max: string) => (RATING_ORDER.indexOf(r) > RATING_ORDER.indexOf(max) ? max : r);

export const scoreReport = (report: Report) => {
  const items = itemsInJobScope(report.job.snapshot.items || [], report.job);
  const byItem = new Map<string, any>();
  for (const session of report.job.sessions || []) for (const r of session.responses || []) if (r.responseStatus === 'SUBMITTED') byItem.set(r.snapshotItemId, r);
  let earned = 0;
  let possible = 0;
  let findings = 0;
  let critical = 0;
  let high = 0;
  for (const item of items) {
    const r = byItem.get(item.id);
    if (!r || r.result === 'NA') continue;
    const w = Number(item.itemData?.weight || 1);
    possible += w;
    if (r.result === 'COMPLIANT') earned += w;
    else if (r.result === 'NON_COMPLIANT') {
      findings += 1;
      const sev = item.itemData?.severityOnFail || 'MEDIUM';
      if (sev === 'CRITICAL') critical += 1;
      if (sev === 'HIGH') high += 1;
      if (r.closedOnSpot) earned += w * 0.5;
    }
  }
  const percent = possible ? Math.round((earned / possible) * 100) : null;
  let rating = percent === null ? null : RATINGS.find(([, min]) => percent >= min)![0];
  if (rating && critical) rating = cap(rating, 'C');
  else if (rating && high) rating = cap(rating, 'B');
  return {percent, rating, findings};
};
export const ratingTone = (r?: string | null): Tone => (!r ? 'gray' : r.startsWith('A') ? 'green' : r === 'D' ? 'red' : 'amber');

/* ---------- report state ---------- */
export const REPORT_STATUS: Record<string, {label: string; tone: Tone}> = {
  DRAFT: {label: 'Draft', tone: 'amber'},
  UNDER_REVIEW: {label: 'In QC review', tone: 'blue'},
  CORRECTION_REQUIRED: {label: 'Returned by QC', tone: 'red'},
  RETURNED: {label: 'Returned by QC', tone: 'red'},
  CORRECTION_SUBMITTED: {label: 'In QC review', tone: 'blue'},
  APPROVED: {label: 'Approved', tone: 'blue'},
  PUBLISHED: {label: 'Issued', tone: 'green'},
  SIGNED_OFF: {label: 'Signed off', tone: 'green'},
};
export const openCorrections = (r: Report) => r.corrections.filter(x => ['OPEN', 'REOPENED'].includes(x.status));
export const isReturned = (r: Report) => ['CORRECTION_REQUIRED', 'RETURNED'].includes(r.status);
export const reportBucket = (r: Report): 'WITH_QC' | 'ISSUED' | 'OTHER' =>
  ['UNDER_REVIEW', 'CORRECTION_SUBMITTED', 'APPROVED'].includes(r.status) ? 'WITH_QC' : ['PUBLISHED', 'SIGNED_OFF'].includes(r.status) ? 'ISSUED' : 'OTHER';
export const lastAction = (r: Report, action: string) => r.history.find(h => h.action === action);
