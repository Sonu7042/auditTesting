import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass, inputClass, lightBtn } from "../siteOnboarding/ui";

const META = { VALID: ["Valid", "bg-[#eaf8ed] text-[#287a37]"], EXPIRING: ["Expiring soon", "bg-[#fff3e0] text-[#9a5200]"], EXPIRED: ["Expired", "bg-[#fdecec] text-[#b42318]"], NO_DATE: ["No date", "bg-[#f1f1f1] text-[#555]"] };

// Every tool the client says a site must hold, with its calibration or inspection date. An auditor cannot rely on an
// expired instrument, so the portal lists what is expired or running short across the whole network.
export default function InstrumentsRegister() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { axios.get(`${domain}/admin-hub/instruments`).then(({ data: d }) => setData(d)); }, []);
  const rows = useMemo(() => (data?.rows || []).filter((r) => (!filter || (filter === "SHORT" ? r.short : r.status === filter)) && (!q || `${r.site} ${r.code} ${r.tool} ${r.company}`.toLowerCase().includes(q.toLowerCase()))), [data, filter, q]);
  if (!data) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const t = data.totals;
  const tiles = [["", "All tools", t.tools], ["VALID", "Valid", t.valid], ["EXPIRING", "Expiring in 30 days", t.expiring], ["EXPIRED", "Expired", t.expired], ["SHORT", "Short of required", t.short]];
  const exportCsv = () => {
    const csv = ["Company,Site,Code,Zone,Regional Office,Tool,Category,Required,Available,Valid till,Status", ...rows.map((r) => [r.company, r.site, r.code, r.zone, r.regionalOffice, r.tool, r.category, r.required, r.available, r.validTill || "", r.status].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "instruments-register.csv"; a.click();
  };

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Auditor Onboarding" }, { label: "Instruments" }]} title="Instruments register" subtitle="Tools required at each site and their calibration or inspection validity. Update them in bulk from the site Excel (Tools sheet)." actions={<button className={lightBtn} onClick={exportCsv}><Download size={16} /> Export CSV</button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([key, label, n]) => (
          <button key={label} type="button" onClick={() => setFilter(key)} className={`rounded-2xl p-4 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] ${filter === key ? "bg-[#181919] text-white" : "bg-white"}`}><div className="text-2xl font-semibold">{n}</div><div className={`text-xs ${filter === key ? "text-white/80" : "text-gray-500"}`}>{label}</div></button>
        ))}
      </div>
      <section className={cardClass}>
        <input className={`${inputClass} mb-4 max-w-sm`} placeholder="Search site, code or tool" value={q} onChange={(e) => setQ(e.target.value)} />
        {rows.length === 0 ? <p className="text-sm text-gray-500">No tools match. Tools are added from each site's set-up or by importing the site workbook.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Site</th><th>Tool</th><th>Category</th><th>Held / required</th><th>Valid till</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={`${r.locationId}-${r.tool}-${i}`} className="border-t border-[#eef0f3]">
                <td className="py-2"><div className="font-medium">{r.site}</div><div className="text-xs text-gray-500">{r.company} · {r.code}</div></td>
                <td>{r.tool}</td><td className="text-xs">{r.category}</td>
                <td className={r.short ? "font-semibold text-[#b42318]" : ""}>{r.available === "" ? "—" : r.available} / {r.required}</td>
                <td className="whitespace-nowrap text-xs">{r.validTill ? new Date(r.validTill).toLocaleDateString("en-IN") : "—"}{r.daysLeft !== null ? <span className="ml-1 text-gray-500">({r.daysLeft < 0 ? `${-r.daysLeft} d ago` : `${r.daysLeft} d`})</span> : null}</td>
                <td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${META[r.status][1]}`}>{META[r.status][0]}</span></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
