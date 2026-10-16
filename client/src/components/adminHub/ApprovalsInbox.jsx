import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, SkeletonPage, cardClass } from "../siteOnboarding/ui";

// One inbox for everything waiting on Back-Admin, across every stage of the programme.
export default function ApprovalsInbox() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => { axios.get(`${domain}/admin-hub/approvals`).then(({ data: d }) => setData(d)); }, []);
  if (!data) return <div><Header /><SkeletonPage /></div>;

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Auditor Onboarding" }, { label: "Reviews & Approvals" }]} title="Reviews & approvals" subtitle={data.total ? `${data.total} item(s) are waiting for a decision. The oldest are listed first.` : "Nothing is waiting for you."} />
      {data.total === 0 && <div className={`${cardClass} flex items-center gap-3 text-sm text-gray-600`}><CheckCircle2 className="text-[#287a37]" /> Everything is up to date.</div>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mt-5">
        {data.sections.map((s) => (
          <section key={s.key} className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{s.title}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.count ? "bg-[#fff3e0] text-[#9a5200]" : "bg-[#eaf8ed] text-[#287a37]"}`}>{s.count ? `${s.count} waiting` : "Clear"}</span>
            </div>
            {s.items.length === 0 ? <p className="text-sm text-gray-500">No pending items.</p> : (
              <ul className="divide-y divide-[#eef0f3]">
                {s.items.map((i) => (
                  <li key={i.id}><button type="button" onClick={() => navigate(i.link)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-[#f7f8fa]">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{i.title}</span><span className="block truncate text-xs text-gray-500">{i.detail}</span></span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">{i.ageDays > 0 ? `${i.ageDays} d` : "today"}<ArrowRight size={14} /></span>
                  </button></li>
                ))}
              </ul>
            )}
            {s.count > s.items.length && <button className="mt-2 text-xs underline" onClick={() => navigate(s.link)}>Open all {s.count}</button>}
          </section>
        ))}
      </div>
    </div>
  );
}
