import { useEffect, useState } from "react";
import axios from "axios";
import { Medal, Trophy } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, SkeletonTable, cardClass } from "../siteOnboarding/ui";

const LEVELS = [["site", "Sites"], ["ro", "Regional offices"], ["zone", "Zones"]];
const METRICS = [["overall", "Overall index"], ["safety", "Safety performance"]];
const PODIUM = ["bg-[#fff4cc] border-[#e8c547]", "bg-[#eef1f4] border-[#b8c0ca]", "bg-[#fbe9dc] border-[#d9a27a]"];

export default function Rankings() {
  const [level, setLevel] = useState("site");
  const [metric, setMetric] = useState("overall");
  const [data, setData] = useState(null);
  useEffect(() => { axios.get(`${domain}/governance/leaderboard`, { params: { level, metric } }).then(({ data: d }) => setData(d)); }, [level, metric]);

  return (
    <div>
      <Header />
      <PageTitle title="Leaderboard" subtitle="Sites compete within their regional office, regional offices within their zone, and zones across the company. Only QC-approved audits count." crumbs={[{ label: "Governance" }]} />
      <div className="mb-5 flex flex-wrap gap-6">
        <div className="flex gap-2">{LEVELS.map(([k, t]) => <button key={k} onClick={() => setLevel(k)} className={`rounded-full px-4 py-2 text-sm ${level === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}</div>
        <div className="flex gap-2">{METRICS.map(([k, t]) => <button key={k} onClick={() => setMetric(k)} className={`rounded-full px-4 py-2 text-sm ${metric === k ? "bg-[#287a37] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}</div>
      </div>
      {!data ? <SkeletonTable rows={5} /> : data.rows.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No audited {LEVELS.find((l) => l[0] === level)[1].toLowerCase()} yet.</div> : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {data.rows.slice(0, 3).map((r, i) => (
              <div key={r.key} className={`rounded-3xl border-2 p-5 ${PODIUM[i]} ${r.mine ? "ring-2 ring-[#287a37]" : ""}`}>
                <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold">{i === 0 ? <Trophy size={18} /> : <Medal size={18} />}#{r.rank}</span><span className="text-2xl font-semibold">{r.score}%</span></div>
                <div className="mt-3 truncate text-lg font-semibold">{r.name}{r.mine ? " (you)" : ""}</div>
                <div className="truncate text-xs text-gray-600">{r.sub}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
            <table className="w-full text-sm">
              <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Rank</th><th>Name</th><th>Score</th><th>Sites audited</th><th>Open critical</th><th>Overdue</th><th>Closure rate</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key} className={`border-t border-[#e4e8ed] ${r.mine ? "bg-[#f1faf3] font-medium" : ""}`}>
                    <td className="p-3 font-semibold">#{r.rank}</td>
                    <td><div>{r.name}{r.mine ? " · you" : ""}</div><div className="text-xs text-gray-500">{r.sub}</div></td>
                    <td className="font-semibold">{r.score}%</td><td>{r.siteCount}</td>
                    <td className={r.openCritical ? "text-[#b42318]" : ""}>{r.masked ? "—" : r.openCritical}</td><td>{r.masked ? "—" : r.overdue}</td><td>{r.closureRate != null ? `${r.closureRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.notAudited > 0 && <p className="mt-3 text-xs text-gray-500">{data.notAudited} site(s) have no approved audit in this cycle and are not ranked.</p>}
        </>
      )}
    </div>
  );
}
