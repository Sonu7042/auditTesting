import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass, lightBtn } from "../siteOnboarding/ui";
import { SiteLink } from "./SiteTrail";
import { DISCIPLINE_LABELS, FACILITY_LABELS, SEVERITY_STYLES, fmtDate } from "./helpers";

const RISKS = ["Critical", "High", "Medium", "Low"];
const PRIORITIES = ["Important & Urgent", "Urgent", "Important", "Rest"];
const RISK_KEY = { Critical: "CRITICAL", High: "HIGH", Medium: "MEDIUM", Low: "LOW" };

export default function RiskRegister() {
  const [rows, setRows] = useState(null);
  const [risk, setRisk] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [demo, setDemo] = useState(false);
  const admin = localStorage.getItem("role") === "ADMIN";

  useEffect(() => { axios.get(`${domain}/client-qc/risk-register`).then(({ data }) => setRows(data.register || [])); }, []);
  const shown = useMemo(() => (rows || []).filter((r) => (demo || !r.isDemo) && (!risk || r.risk === risk) && (!onlyOpen || !["CLOSED", "VOID"].includes(r.status)) && (!onlyOverdue || r.overdue)), [rows, risk, onlyOpen, onlyOverdue, demo]);
  const matrix = (r, p) => shown.filter((x) => x.risk === r && x.mahindraPriority === p).length;

  const exportCsv = () => {
    const head = ["NC", "Site", "Facility", "Audit type", "Question", "Finding", "Risk", "Mahindra priority", "Due", "Status", "Overdue"];
    const lines = shown.map((r) => [r.ncNumber, r.site.locationName, r.facilityType || "", DISCIPLINE_LABELS[r.discipline] || "", r.question, r.observation, r.risk, r.mahindraPriority, fmtDate(r.dueAt), r.status, r.overdue ? "Yes" : "No"].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "risk-register.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Closure Tracking" }]} title="Risk register" subtitle="Every finding carries two classifications: its safety risk and its Mahindra priority. Closure targets: 2 weeks, 4–6 weeks, one quarter, routine."
        actions={<button className={lightBtn} onClick={exportCsv}><Download size={16} /> Export CSV</button>} />
      <section className={`${cardClass} mb-6 overflow-x-auto`}>
        <table className="w-full text-center text-sm">
          <thead><tr><th className="p-2 text-left text-xs uppercase text-gray-500">Risk ↓ / Priority →</th>{PRIORITIES.map((p) => <th key={p} className="p-2 text-xs uppercase text-gray-500">{p}</th>)}</tr></thead>
          <tbody>{RISKS.map((r) => (
            <tr key={r} className="border-t border-[#eef0f3]"><td className="p-2 text-left"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${SEVERITY_STYLES[RISK_KEY[r]]}`}>{r}</span></td>
              {PRIORITIES.map((p) => { const n = matrix(r, p); return <td key={p} className="p-2"><span className={n ? "font-semibold" : "text-gray-300"}>{n}</span></td>; })}</tr>))}</tbody>
        </table>
      </section>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <select className="rounded-xl border border-[#CECECE] bg-white px-3 py-2" value={risk} onChange={(e) => setRisk(e.target.value)}><option value="">All risk levels</option>{RISKS.map((r) => <option key={r}>{r}</option>)}</select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />Open only</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />Overdue only</label>
        {admin && <label className="flex items-center gap-2"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />Include demo audits</label>}
        <span className="text-gray-500">{shown.length} finding(s)</span>
      </div>
      {rows === null ? <p className="text-sm text-gray-500">Loading...</p> : shown.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No findings match.</div> : (
        <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
          <table className="w-full text-sm">
            <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">NC</th><th>Site</th><th>Finding</th><th>Risk</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className="border-t border-[#e4e8ed] align-top">
                <td className="p-3 text-xs">{r.ncNumber}<div className="text-gray-500">{r.questionCode}</div></td>
                <td><SiteLink site={r.site} showDealer={false} /><div className="text-xs text-gray-500">{r.facilityType ? FACILITY_LABELS[r.facilityType] : ""} · {DISCIPLINE_LABELS[r.discipline] || ""}</div></td>
                <td className="max-w-xs text-xs">{r.question}<div className="text-gray-500">{r.observation}</div></td>
                <td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[RISK_KEY[r.risk]]}`}>{r.risk}</span></td>
                <td className="text-xs">{r.mahindraPriority}</td>
                <td className={`text-xs ${r.overdue ? "font-semibold text-[#b42318]" : ""}`}>{fmtDate(r.dueAt)}{r.overdue ? " · overdue" : ""}</td>
                <td className="text-xs">{r.closedOnSpot ? "Closed on the spot" : r.status.replaceAll("_", " ")}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
