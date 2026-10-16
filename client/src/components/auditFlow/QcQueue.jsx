import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, SkeletonTable, cardClass } from "../siteOnboarding/ui";
import { SiteLink } from "./SiteTrail";
import { FACILITY_LABELS, RATING_STYLES, fmtDateTime } from "./helpers";

const STATUS = { DRAFT: ["Draft", "bg-[#f1f1f1]"], UNDER_REVIEW: ["In QC review", "bg-[#fff6e8] text-[#9a5200]"], CORRECTION_REQUIRED: ["Correction required", "bg-[#fdecec] text-[#b42318]"], CORRECTION_SUBMITTED: ["Correction submitted", "bg-[#e8f1fd] text-[#1e61ad]"], APPROVED: ["Approved", "bg-[#eaf8ed] text-[#287a37]"], PUBLISHED: ["Issued", "bg-[#eaf8ed] text-[#287a37]"], SIGNED_OFF: ["Signed off", "bg-[#d9f3df] text-[#1b6b2c]"], RETURNED: ["Returned", "bg-[#fff3e0] text-[#9a5200]"] };
const GROUPS = [["ACTION", "Needs QC action", "DRAFT,UNDER_REVIEW,CORRECTION_REQUIRED,CORRECTION_SUBMITTED,RETURNED"], ["APPROVED", "Approved", "APPROVED"], ["ISSUED", "Issued", "PUBLISHED,SIGNED_OFF"], ["ALL", "All", ""]];

export default function QcQueue({ anomaliesOnly = false }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState(anomaliesOnly ? "ALL" : "ACTION");
  const [reports, setReports] = useState(null);
  useEffect(() => {
    const status = GROUPS.find((g) => g[0] === group)[2];
    axios.get(`${domain}/client-qc/queue`, { params: status ? { status } : {} }).then(({ data }) => setReports(data.reports || []));
  }, [group]);
  const shown = (reports || []).filter((r) => !anomaliesOnly || r.anomalyCount > 0);

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "QC Review", to: "/admin-dashboard/stage/6" }, { label: anomaliesOnly ? "Anomaly flags" : "QC queue" }]}
        title={anomaliesOnly ? "Anomaly flags" : "QC queue"}
        subtitle={anomaliesOnly ? "Audits with suspicious patterns: very short audits, unusually high scores, reused photos or heavy N/A use. Flags prompt a closer look; they are not a verdict." : "Check each auditor's scoring against the photo evidence before a report is released to the dealer."} />
      {!anomaliesOnly && <div className="mb-4 flex gap-2">{GROUPS.map(([k, t]) => <button key={k} onClick={() => setGroup(k)} className={`rounded-full px-4 py-2 text-sm ${group === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}</div>}
      {reports === null ? <SkeletonTable rows={5} /> : shown.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>{anomaliesOnly ? "No anomalies flagged." : "Nothing in this list."}</div> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Report</th><th>Site</th><th>Auditors</th><th>Score</th><th>Findings</th><th>Flags</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-[#e4e8ed] hover:bg-[#fafafa]" onClick={() => navigate(`/admin-dashboard/qc/report/${r.id}`)}>
                  <td className="p-3 text-xs"><div className="font-medium">{r.reportNumber}</div><div className="text-gray-500">{fmtDateTime(r.generatedAt)}{r.isDemo ? " · demo" : ""}</div></td>
                  <td><SiteLink site={r.location} /><div className="text-xs text-gray-500">{r.facilityType ? FACILITY_LABELS[r.facilityType] : "Site"}</div></td>
                  <td className="text-xs">{r.auditors.map((a) => <div key={a.id}>{a.fullName} <span className="text-gray-500">({a.track})</span></div>)}</td>
                  <td>{r.percent !== null ? <span className="flex items-center gap-2"><b>{r.percent}%</b>{r.rating && <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${RATING_STYLES[r.rating]}`}>{r.rating}</span>}</span> : "—"}</td>
                  <td className="text-xs">{r.counts.nonCompliant}</td>
                  <td>{r.anomalyCount ? <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${r.highAnomalies ? "bg-[#fdecec] text-[#b42318]" : "bg-[#fff3e0] text-[#9a5200]"}`}>{r.anomalyCount} flag{r.anomalyCount > 1 ? "s" : ""}</span> : <span className="text-xs text-gray-500">None</span>}</td>
                  <td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${STATUS[r.status]?.[1] || "bg-[#f1f1f1]"}`}>{STATUS[r.status]?.[0] || r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
