import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, ProgressBar, SkeletonTable, StatusPill, cardClass } from "./ui";

export default function ReviewQueue() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axios.get(`${domain}/client-audit-setup/site-requests`, { params: { status: "SUBMITTED" } })
      .then(({ data }) => setRequests(data.requests || [])).finally(() => setLoading(false));
  }, []);
  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Site Onboarding", to: "/admin-dashboard/site-onboarding" }, { label: "Review queue" }]} title="Review queue" subtitle="Sites submitted for Back-Admin review. Approving creates the live site." />
      {loading ? <SkeletonTable rows={5} /> : requests.length === 0 ? (
        <div className={`${cardClass} text-center text-sm text-gray-500`}>Nothing is waiting for review.</div>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Site</th><th>Company</th><th>Zone / RO</th><th>Submitted</th><th>Ready</th><th /></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-[#e4e8ed] hover:bg-[#fafafa]" onClick={() => navigate(`/admin-dashboard/site-onboarding/request/${r.id}`)}>
                  <td className="p-3"><div className="font-medium">{r.locationName}</div><div className="text-xs text-gray-500">{r.locationCode}</div></td>
                  <td>{r.company?.companyName}</td>
                  <td className="text-xs">{r.zone}<div className="text-gray-500">{r.regionalOffice}</div></td>
                  <td className="text-xs">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}</td>
                  <td className="w-28"><ProgressBar value={r.readiness} /></td>
                  <td className="pr-3"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
