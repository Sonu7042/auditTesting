export const STATUS_META = {
  CREATED: { label: "Created", cls: "bg-[#f1f1f1] text-[#555]" },
  TRAINING: { label: "In training", cls: "bg-[#e8f1fd] text-[#1e61ad]" },
  UNDER_REVIEW: { label: "Awaiting review", cls: "bg-[#fff6e8] text-[#9a5200]" },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "bg-[#f1ebfd] text-[#6b3fc4]" },
  RETRAINING: { label: "Retraining", cls: "bg-[#fff3e0] text-[#9a5200]" },
  APPROVED: { label: "Approved", cls: "bg-[#eaf8ed] text-[#287a37]" },
  REJECTED: { label: "Rejected", cls: "bg-[#fdecec] text-[#b42318]" },
  LEGACY: { label: "Existing auditor", cls: "bg-[#f1f1f1] text-[#555]" },
};

export const TAG_META = {
  ELIGIBLE: { label: "Eligible", cls: "bg-[#eaf8ed] text-[#287a37]" },
  RETRAIN: { label: "Retraining needed", cls: "bg-[#fff3e0] text-[#9a5200]" },
  BLOCKED: { label: "Cannot plan", cls: "bg-[#fdecec] text-[#b42318]" },
};

export const SKILL_LABELS = { INFRASTRUCTURE: "Infrastructure", ELECTRICAL: "Electrical", FIRE_SAFETY: "Fire & Life Safety", THERMOGRAPHY: "Thermography" };

