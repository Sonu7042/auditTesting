const { itemDiscipline, itemsForTrack } = require("./auditScope");

const RATINGS = [["A+", 90], ["A", 80], ["B", 70], ["C", 60], ["D", 0]];
const RATING_ORDER = ["D", "C", "B", "A", "A+"];
const CLOSURE_DAYS = { IMPORTANT_URGENT: 14, URGENT: 42, IMPORTANT: 90, REST: 180 };
const RISK_BY_SEVERITY = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_LABEL = { IMPORTANT_URGENT: "Important & Urgent", URGENT: "Urgent", IMPORTANT: "Important", REST: "Rest" };

const ratingFor = (percent) => RATINGS.find(([, min]) => percent >= min)[0];
const capRating = (rating, cap) => (RATING_ORDER.indexOf(rating) > RATING_ORDER.indexOf(cap) ? cap : rating);
// Score bands used in the sample audit report.
const riskLevelFor = (percent) => (percent <= 25 ? "High risk" : percent <= 75 ? "Medium risk" : "Low risk");

// Scores the items of one job from the submitted responses of all its sessions.
const scoreJob = (job, sessions) => {
  const items = itemsForTrack(job.snapshot.items, job, "ALL");
  const responseByItem = new Map();
  for (const session of sessions) for (const r of session.responses || []) if (r.responseStatus === "SUBMITTED") responseByItem.set(r.snapshotItemId, r);
  const byDiscipline = {};
  const counts = { total: items.length, answered: 0, compliant: 0, nonCompliant: 0, na: 0, closedOnSpot: 0, severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, priority: { IMPORTANT_URGENT: 0, URGENT: 0, IMPORTANT: 0, REST: 0 } };
  let earned = 0; let possible = 0;
  for (const item of items) {
    const d = itemDiscipline(item);
    byDiscipline[d] ||= { earned: 0, possible: 0, total: 0, nonCompliant: 0 };
    byDiscipline[d].total += 1;
    const r = responseByItem.get(item.id);
    if (!r) continue;
    counts.answered += 1;
    if (r.result === "NA") { counts.na += 1; continue; }
    const weight = Number(item.itemData?.weight || 1);
    possible += weight; byDiscipline[d].possible += weight;
    if (r.result === "COMPLIANT") { counts.compliant += 1; earned += weight; byDiscipline[d].earned += weight; }
    else if (r.result === "NON_COMPLIANT") {
      counts.nonCompliant += 1; byDiscipline[d].nonCompliant += 1;
      const sev = item.itemData?.severityOnFail || "MEDIUM"; const pri = item.itemData?.mahindraPriority || "IMPORTANT";
      counts.severity[sev] = (counts.severity[sev] || 0) + 1; counts.priority[pri] = (counts.priority[pri] || 0) + 1;
      if (r.closedOnSpot) { counts.closedOnSpot += 1; earned += weight * 0.5; byDiscipline[d].earned += weight * 0.5; }
    }
  }
  const pct = (e, p) => (p ? Math.round((e / p) * 1000) / 10 : null);
  const percent = pct(earned, possible);
  let rating = percent === null ? null : ratingFor(percent);
  // A Critical failure caps the rating at C, a High failure at B.
  if (rating && counts.severity.CRITICAL > 0) rating = capRating(rating, "C");
  else if (rating && counts.severity.HIGH > 0) rating = capRating(rating, "B");
  return {
    percent, rating, riskLevel: percent === null ? null : riskLevelFor(percent), counts,
    disciplines: Object.fromEntries(Object.entries(byDiscipline).map(([k, v]) => [k, { percent: pct(v.earned, v.possible), total: v.total, nonCompliant: v.nonCompliant }])),
  };
};

// Heuristic checks for suspicious audits. These flag work for QC; they are not a verdict.
const detectAnomalies = (job, sessions, scoring) => {
  const flags = [];
  const itemsAnswered = scoring.counts.answered;
  for (const s of sessions) {
    const end = s.completion?.completedAt || s.endedAt;
    if (!end) continue;
    const minutes = (new Date(end) - new Date(s.checkedInAt)) / 60000;
    const perItem = (s.responses || []).length ? minutes / s.responses.length : null;
    if (perItem !== null && perItem < 0.4 && s.responses.length >= 5) flags.push({ code: "SHORT_DURATION", severity: "HIGH", message: `${s.auditor?.fullName || "Auditor"} finished ${s.responses.length} items in ${Math.max(1, Math.round(minutes))} min (${perItem.toFixed(1)} min per item).` });
  }
  if (scoring.percent !== null && scoring.percent >= 97 && itemsAnswered >= 10) flags.push({ code: "HIGH_SCORE", severity: "MEDIUM", message: `Score ${scoring.percent}% with almost no findings is unusually high.` });
  if (itemsAnswered && scoring.counts.na / itemsAnswered > 0.25) flags.push({ code: "NA_OVERUSE", severity: "MEDIUM", message: `${Math.round((scoring.counts.na / itemsAnswered) * 100)}% of items were marked not applicable.` });
  const hashes = new Map();
  for (const s of sessions) for (const r of s.responses || []) for (const e of r.evidence || []) {
    if (!e.fileHash) continue;
    hashes.set(e.fileHash, (hashes.get(e.fileHash) || 0) + 1);
  }
  const reused = [...hashes.values()].filter((n) => n > 1).length;
  if (reused) flags.push({ code: "REUSED_PHOTO", severity: "HIGH", message: `${reused} photo(s) appear on more than one checklist item.` });
  for (const s of sessions) if (s.distanceFromSiteM > job.location.geofenceRadiusM * 0.9 && !job.isDemo) flags.push({ code: "EDGE_OF_GEOFENCE", severity: "LOW", message: `${s.auditor?.fullName || "Auditor"} checked in near the geofence edge (${Math.round(s.distanceFromSiteM)} m).` });
  return flags;
};

const closureDueAt = (createdAt, priority) => new Date(new Date(createdAt).getTime() + (CLOSURE_DAYS[priority] || 90) * 86400000);

module.exports = { scoreJob, detectAnomalies, ratingFor, RISK_BY_SEVERITY, PRIORITY_LABEL, CLOSURE_DAYS, closureDueAt };
