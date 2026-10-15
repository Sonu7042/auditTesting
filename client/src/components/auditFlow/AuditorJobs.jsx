import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { CalendarClock, MapPin, PlayCircle } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass, darkBtn } from "../siteOnboarding/ui";
import { FACILITY_LABELS, TRACK_LABELS, fmtDateTime } from "./helpers";

const STATUS = { SCHEDULED: "bg-[#e8f1fd] text-[#1e61ad]", CONFIRMED: "bg-[#e8f1fd] text-[#1e61ad]", IN_PROGRESS: "bg-[#fff6e8] text-[#9a5200]", COMPLETED: "bg-[#eaf8ed] text-[#287a37]", CANCELLED: "bg-[#f1f1f1] text-[#555]" };

export default function AuditorJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(null);
  const me = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    axios.get(`${domain}/client-audit-jobs`).then(({ data }) => setJobs(data.jobs || []));
  }, []);

  const mine = (job) => job.assignments.find((a) => a.auditorId === me.id);
  const sessionOf = (job) => job.sessions.find((s) => s.auditorId === me.id);

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Audit Execution" }]} title="New Report" subtitle="Your assigned audits. Open one to check in, answer the checklist with photo evidence, and submit." />
      {jobs === null ? <p className="text-sm text-gray-500">Loading...</p> : jobs.length === 0 ? (
        <div className={`${cardClass} text-center text-sm text-gray-500`}>No audits are assigned to you yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => {
            const a = mine(job); const s = sessionOf(job);
            const done = s?.status === "COMPLETED";
            return (
              <div key={job.id} className="rounded-3xl bg-white p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{job.location.locationName}</div>
                    <div className="text-xs text-gray-500">{job.location.dealerName}</div>
                  </div>
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${STATUS[job.status] || STATUS.SCHEDULED}`}>{job.status.replace("_", " ")}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {job.facilityType && <span className="rounded-full bg-[#eaf8ed] px-2.5 py-1 text-[#287a37]">{FACILITY_LABELS[job.facilityType]}</span>}
                  <span className="rounded-full bg-[#f3f5f7] px-2.5 py-1">{TRACK_LABELS[a?.track || "ALL"]}</span>
                  {job.isDemo && <span className="rounded-full bg-[#f1ebfd] px-2.5 py-1 text-[#6b3fc4]">Demo</span>}
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <div className="flex items-center gap-1"><CalendarClock size={13} /> {fmtDateTime(job.scheduledStart)} – {fmtDateTime(job.scheduledEnd)}</div>
                  <div className="flex items-center gap-1"><MapPin size={13} /> {job.location.city || job.location.address}</div>
                </div>
                <div className="mt-4">
                  {done ? <span className="text-sm text-[#287a37]">You have submitted this audit.</span>
                    : job.status === "CANCELLED" ? null
                    : <button className={darkBtn} onClick={() => navigate(`/auditor-dashboard/audit/${job.id}`)}><PlayCircle size={16} /> {s ? "Continue audit" : "Start audit"}</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
