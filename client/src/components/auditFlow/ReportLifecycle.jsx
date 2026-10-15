import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Check, Circle, Clock } from "lucide-react";
import domain from "../../api/domain";
import { cardClass } from "../siteOnboarding/ui";
import { basePathFor } from "./siteTrailUtils";

const STATE = {
  DONE: { dot: "bg-[#287a37] text-white", ring: "border-[#cfe8d4]", icon: <Check size={14} /> },
  CURRENT: { dot: "bg-[#181919] text-white", ring: "border-[#181919] shadow-[0_2px_8px_rgba(0,0,0,0.15)]", icon: <Clock size={14} /> },
  PENDING: { dot: "bg-[#e6e8eb] text-[#888]", ring: "border-[#e1e5ea]", icon: <Circle size={10} /> },
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "");

// The whole life of one report on one strip: company, site set-up, checklist, scheduling, audit, submission, QC review,
// issue to the dealer, clarifications, changes, dealer approval, CAPA and awards. The highlighted step is where it is now.
export default function ReportLifecycle({ reportId, refreshKey }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => { axios.get(`${domain}/client-qc/reports/${reportId}/lifecycle`).then(({ data: d }) => setData(d)).catch(() => setData(null)); }, [reportId, refreshKey]);
  if (!data) return null;
  const admin = localStorage.getItem("role") === "ADMIN"; const base = basePathFor();
  const go = (target) => {
    if (target === "company" && admin) navigate(`/admin-dashboard/site-onboarding/${data.companyId}`);
    else if (target === "site") navigate(`${base}/site/${data.locationId}`);
    else if (target === "checklist") navigate(`${base}/site/${data.locationId}?tab=checklist`);
    else if (target === "scheduling" && admin) navigate("/admin-dashboard/client-audit-scheduling");
    else if (target === "awards") navigate(`${base}/site/${data.locationId}?tab=awards`);
    else if (target === "capa") document.getElementById("capa")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <section className={`${cardClass} mb-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Report lifecycle</h2>
        <span className="text-xs text-gray-500">{data.current === "complete" ? "Every step is complete." : `Now at: ${data.stages.find((s) => s.key === data.current)?.label || "—"}`}</span>
      </div>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.stages.map((s, i) => {
          const m = STATE[s.state]; const clickable = s.target && (s.target !== "company" && s.target !== "scheduling" || admin);
          return (
            <li key={s.key}>
              <button type="button" disabled={!clickable} onClick={() => go(s.target)} className={`h-full w-full rounded-2xl border bg-white p-3 text-left ${m.ring} ${clickable ? "hover:bg-[#f7f8fa]" : "cursor-default"} ${s.optional && s.state === "PENDING" ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${m.dot}`}>{s.state === "PENDING" ? i + 1 : m.icon}</span><span className="text-sm font-semibold">{s.label}</span>{s.at && <span className="ml-auto text-xs text-gray-500">{fmt(s.at)}</span>}</div>
                <p className="mt-2 line-clamp-4 text-xs text-gray-600">{s.detail}</p>
                {s.by && <p className="mt-1 text-xs text-gray-400">by {s.by}</p>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
