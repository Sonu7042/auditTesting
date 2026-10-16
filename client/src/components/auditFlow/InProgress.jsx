import { useEffect, useState } from "react";
import axios from "axios";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, SkeletonCard, cardClass } from "../siteOnboarding/ui";
import { SiteLink } from "./SiteTrail";
import { FACILITY_LABELS, TRACK_LABELS, fmtDateTime } from "./helpers";

export default function InProgress() {
  const [jobs, setJobs] = useState(null);
  const load = () => axios.get(`${domain}/client-audit-jobs`).then(({ data }) => setJobs((data.jobs || []).filter((j) => ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(j.status))));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Audit Execution", to: "/admin-dashboard/stage/5" }, { label: "In progress" }]} title="Audits in progress" subtitle="Live view of each track: who has checked in, how far from the site, and whether they have submitted." />
      {jobs === null ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No audits are scheduled or running.</div> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {jobs.map((j) => (
            <div key={j.id} className={cardClass}>
              <div className="flex justify-between gap-3"><div><SiteLink site={j.location} /><div className="text-xs text-gray-500">{j.facilityType ? FACILITY_LABELS[j.facilityType] : "Whole site"}{j.isDemo ? " · demo" : ""}</div></div><span className="text-xs text-gray-500">{fmtDateTime(j.scheduledStart)}</span></div>
              <div className="mt-4 space-y-2">
                {j.assignments.map((a) => {
                  const s = j.sessions.find((x) => x.auditorId === a.auditorId);
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-xl bg-[#f7f8fa] p-3 text-sm gap-3">
                      <div><div className="font-medium">{a.auditor.fullName}</div><div className="text-xs text-gray-500">{TRACK_LABELS[a.track]}</div></div>
                      <div className="text-right text-xs">
                        {!s ? <span className="rounded-full bg-[#f1f1f1] px-2.5 py-1">Not checked in</span>
                          : s.status === "COMPLETED" ? <span className="rounded-full bg-[#eaf8ed] px-2.5 py-1 text-[#287a37]">Submitted</span>
                          : <span className="rounded-full bg-[#fff6e8] px-2.5 py-1 text-[#9a5200]">On site</span>}
                        {s && <div className="mt-1 text-gray-500">in {fmtDateTime(s.checkedInAt)} · {Math.round(s.distanceFromSiteM)} m from site</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
