export const DISCIPLINE_LABELS = { INFRASTRUCTURE: "Infrastructure", FIRE: "Fire & Life Safety", ELECTRICAL: "Electrical", THERMOGRAPHY: "Thermography" };
export const FACILITY_LABELS = { SHOWROOM: "Showroom", WORKSHOP: "Workshop", STOCKYARD: "Stockyard" };
export const TRACK_LABELS = { A: "Track A · Infrastructure + Fire", B: "Track B · Electrical + Thermography", ALL: "All disciplines" };
export const SEVERITY_STYLES = { CRITICAL: "bg-[#fdecec] text-[#b42318]", HIGH: "bg-[#fff1e0] text-[#9a5200]", MEDIUM: "bg-[#fff8dc] text-[#8a6d00]", LOW: "bg-[#eef2f6] text-[#4a5a6a]" };
export const RATING_STYLES = { "A+": "bg-[#d9f3df] text-[#1b6b2c]", A: "bg-[#e6f6e9] text-[#287a37]", B: "bg-[#eef6d9] text-[#58741a]", C: "bg-[#fff1d6] text-[#8f5400]", D: "bg-[#fdecec] text-[#b42318]" };
export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const toLocalInput = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
