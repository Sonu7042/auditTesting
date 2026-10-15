import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass, lightBtn } from "../siteOnboarding/ui";
import { FACILITY_LABELS } from "./helpers";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLOR = { SCHEDULED: "bg-[#e8f1fd] text-[#1e61ad]", CONFIRMED: "bg-[#e8f1fd] text-[#1e61ad]", IN_PROGRESS: "bg-[#fff6e8] text-[#9a5200]", COMPLETED: "bg-[#eaf8ed] text-[#287a37]", CANCELLED: "bg-[#f1f1f1] text-[#888] line-through" };

export default function ClientCalendar() {
  const [jobs, setJobs] = useState([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  useEffect(() => { axios.get(`${domain}/client-audit-jobs`).then(({ data }) => setJobs(data.jobs || [])).catch(() => setJobs([])); }, []);

  const cells = useMemo(() => {
    const first = month.getDay(); const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first + total) / 7) * 7 }, (_, i) => { const day = i - first + 1; return day >= 1 && day <= total ? new Date(month.getFullYear(), month.getMonth(), day) : null; });
  }, [month]);
  const byDay = (d) => jobs.filter((j) => { const s = new Date(j.scheduledStart); return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth() && s.getDate() === d.getDate(); });
  const monthCount = jobs.filter((j) => { const s = new Date(j.scheduledStart); return s.getFullYear() === month.getFullYear() && s.getMonth() === month.getMonth(); }).length;

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Scheduling & Notification" }]} title="Calendar" subtitle={`${monthCount} audit(s) in ${month.toLocaleString("en-IN", { month: "long", year: "numeric" })}`}
        actions={<><button className={lightBtn} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="w-36 text-center text-sm font-medium">{month.toLocaleString("en-IN", { month: "long", year: "numeric" })}</span>
          <button className={lightBtn} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button></>} />
      <div className={`${cardClass} !p-3`}>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-[#e4e8ed]">
          {DAYS.map((d) => <div key={d} className="bg-[#f3f5f7] p-2 text-center text-xs font-medium text-gray-500">{d}</div>)}
          {cells.map((d, i) => (
            <div key={i} className="min-h-[96px] bg-white p-1.5">
              {d && <div className={`mb-1 text-xs ${d.toDateString() === new Date().toDateString() ? "font-bold text-[#287a37]" : "text-gray-500"}`}>{d.getDate()}</div>}
              {d && byDay(d).map((j) => <div key={j.id} title={`${j.location.dealerName} · ${j.assignments.map((a) => a.auditor.fullName).join(", ")}`} className={`mb-1 break-words rounded-lg px-1.5 py-1 text-xs leading-snug ${COLOR[j.status]}`}>{j.location.locationName}{j.facilityType ? ` · ${FACILITY_LABELS[j.facilityType][0]}` : ""}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
