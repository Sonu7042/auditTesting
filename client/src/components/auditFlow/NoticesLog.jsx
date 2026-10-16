import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, SkeletonTable, cardClass, darkBtn } from "../siteOnboarding/ui";
import { SiteLink } from "./SiteTrail";
import { FACILITY_LABELS, fmtDateTime } from "./helpers";

const LABEL = { SCHEDULED: "Scheduled", T7: "T-7 reminder + logistics", T3: "T-3 deployment check", T1: "T-1 verification + arrival tracking" };
const STYLE = { SENT: "bg-[#eaf8ed] text-[#287a37]", PENDING: "bg-[#e8f1fd] text-[#1e61ad]", MISSED: "bg-[#fdecec] text-[#b42318]", SKIPPED: "bg-[#f1f1f1] text-[#555]" };

export default function NoticesLog() {
  const [notices, setNotices] = useState(null);
  const { confirm } = useConfirm();
  const load = () => axios.get(`${domain}/client-audit-jobs/notices`).then(({ data }) => setNotices(data.notices || []));
  useEffect(() => { load(); }, []);
  const runNow = async () => {
    if (!(await confirm({ title: "Send all due notices now?", message: "Reminders that have reached their due time are sent immediately.", points: ["Dealers receive their reminder email", "Auditors receive their deployment-check notification", "Each one is logged in this trail"], confirmLabel: "Send due notices" }))) return; const { data } = await axios.post(`${domain}/client-audit-jobs/notices/run`); toast.success(data.message); load(); };

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Scheduling & Notification", to: "/admin-dashboard/stage/4" }, { label: "Notices" }]} title="Notifications & escalations" subtitle="The communication audit trail for every scheduled audit. Reminders are sent automatically when due; missed ones are flagged for follow-up."
        actions={<button className={darkBtn} onClick={runNow}>Send due notices now</button>} />
      {notices === null ? <SkeletonTable rows={5} /> : notices.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No notices yet. They are created when an audit is scheduled.</div> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Audit</th><th>Notice</th><th>Due</th><th>Sent</th><th>To</th><th>Status</th></tr></thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id} className="border-t border-[#e4e8ed]">
                  <td className="p-3"><SiteLink site={n.job.location} />{n.job.facilityType ? <div className="text-xs text-gray-500">{FACILITY_LABELS[n.job.facilityType]}</div> : null}</td>
                  <td className="text-xs">{LABEL[n.kind] || n.kind}</td>
                  <td className="text-xs">{fmtDateTime(n.dueAt)}</td>
                  <td className="text-xs">{fmtDateTime(n.sentAt)}</td>
                  <td className="text-xs text-gray-500">{n.recipient || "—"}</td>
                  <td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${STYLE[n.status]}`}>{n.status}</span>{n.status === "MISSED" && <div className="text-xs text-[#b42318]">Escalate: scheduled inside the notice window</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
