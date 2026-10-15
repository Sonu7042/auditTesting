const FACILITY_MODULES = {
  SHOWROOM: ["SR_SHOWROOM", "MANPOWER_SALES"],
  WORKSHOP: ["WS_WORKSHOP", "TOOLS_REGISTER", "MANPOWER_SERVICE"],
  STOCKYARD: ["SY_STOCKYARD", "MANPOWER_YARD"],
};
const SITE_MODULES = ["SITE_SHARED", "EFS_SAFETY", "THERMOGRAPHY"];
const ALL_DISCIPLINES = ["INFRASTRUCTURE", "FIRE", "ELECTRICAL", "THERMOGRAPHY"];
const TRACK_DISCIPLINES = {
  A: ["INFRASTRUCTURE", "FIRE"],
  B: ["ELECTRICAL", "THERMOGRAPHY"],
  ALL: ALL_DISCIPLINES,
};
const DISCIPLINE_SKILL = { INFRASTRUCTURE: "INFRASTRUCTURE", FIRE: "FIRE_SAFETY", ELECTRICAL: "ELECTRICAL", THERMOGRAPHY: "THERMOGRAPHY" };

const defaultDiscipline = (moduleCode) => (moduleCode === "THERMOGRAPHY" ? "THERMOGRAPHY" : moduleCode === "EFS_SAFETY" ? "ELECTRICAL" : "INFRASTRUCTURE");
const itemDiscipline = (item) => item.itemData?.discipline || defaultDiscipline(item.moduleCode);

// Items that belong to this audit job: its facility modules, plus the premises-wide
// modules when the job is the one that audits shared items.
const itemsInJobScope = (items, job) => {
  if (!job.facilityType) return items;
  const modules = new Set([...(FACILITY_MODULES[job.facilityType] || []), ...(job.includesShared ? SITE_MODULES : [])]);
  return items.filter((item) => modules.has(item.moduleCode));
};
const itemsForTrack = (items, job, track = "ALL") => {
  const allowed = new Set(TRACK_DISCIPLINES[track] || ALL_DISCIPLINES);
  return itemsInJobScope(items, job).filter((item) => allowed.has(itemDiscipline(item)));
};
const requiredSkillsForItems = (items) => [...new Set(items.map((item) => DISCIPLINE_SKILL[itemDiscipline(item)]).filter(Boolean))];

module.exports = { FACILITY_MODULES, SITE_MODULES, TRACK_DISCIPLINES, ALL_DISCIPLINES, itemDiscipline, itemsInJobScope, itemsForTrack, requiredSkillsForItems };
