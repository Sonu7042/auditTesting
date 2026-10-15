import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Award, Download, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { Field, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import DocumentViewer from "../common/DocumentViewer";
import { fmtDate } from "../auditFlow/helpers";

const LEVEL = { SITE: "Site", RO: "Regional office", ZONE: "Zone" };
const METRIC = { OVERALL: "Overall index", SAFETY: "Safety performance" };
const STATUS = { DRAFT: "bg-[#fff6e8] text-[#9a5200]", APPROVED: "bg-[#eaf8ed] text-[#287a37]", REJECTED: "bg-[#f1f1f1] text-[#555]" };
const certLink = (c) => { const base = localStorage.getItem("role") === "ADMIN" ? "/admin-dashboard" : "/user-dashboard"; const [kind, rest] = c.nodeKey.split(":"); if (kind === "SITE") return `${base}/site/${rest}`; if (kind === "ZONE") return `${base}?zone=${encodeURIComponent(rest)}`; const [zone, ro] = rest.split("|"); return `${base}?zone=${encodeURIComponent(zone)}&ro=${encodeURIComponent(ro)}`; };
const today = () => new Date().toISOString().slice(0, 10);

export default function Awards() {
  const admin = localStorage.getItem("role") === "ADMIN";
  const [periods, setPeriods] = useState([]);
  const [certs, setCerts] = useState([]);
  const [form, setForm] = useState({ label: "Q2 FY 2026-27", type: "QUARTER", startsAt: "2026-07-01", endsAt: today(), topN: 3 });
  const [busy, setBusy] = useState(false);
  const { confirm, ask } = useConfirm();
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    const calls = [axios.get(`${domain}/governance/certificates`)];
    if (admin) calls.push(axios.get(`${domain}/governance/periods`));
    const [c, p] = await Promise.all(calls);
    setCerts(c.data.certificates || []); setPeriods(p?.data.periods || []);
  }, [admin]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };
  const pdf = async (c) => { const res = await axios.get(`${domain}/governance/certificates/${c.id}/pdf`, { responseType: "blob" }); const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = `${c.code}.pdf`; a.click(); URL.revokeObjectURL(url); };

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Governance" }]} title="Awards & certificates" subtitle={admin ? "Close a quarter or year to freeze the rankings and draft certificates for the top performers. Approve each certificate before it is issued." : "Certificates earned by your site, regional office or zone."} />
      {admin && (
        <section className={`${cardClass} mb-6`}>
          <h2 className="mb-3 text-lg font-semibold">Award periods</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Label" span="md:col-span-2"><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
            <Field label="Type"><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="QUARTER">Quarter</option><option value="YEAR">Year</option></select></Field>
            <Field label="From"><input type="date" className={inputClass} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
            <Field label="To"><input type="date" className={inputClass} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
            <Field label="Winners per list"><input type="number" min="1" max="10" className={inputClass} value={form.topN} onChange={(e) => setForm({ ...form, topN: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><button className={darkBtn} disabled={busy} onClick={async () => { if (await confirm({ title: "Create this award period?", message: `${form.label}: ${form.startsAt} to ${form.endsAt}.`, points: [`Top ${form.topN} in each list will be drafted as certificates when you close it`], confirmLabel: "Create period" })) run(() => axios.post(`${domain}/governance/periods`, form, { showSuccessToast: true })); }}>Create period</button></div>
          <div className="mt-5 space-y-2">
            {periods.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f7f8fa] p-3 text-sm">
                <b>{p.label}</b><span className="text-xs text-gray-500">{fmtDate(p.startsAt)} – {fmtDate(p.endsAt)}</span>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${p.status === "OPEN" ? "bg-[#e8f1fd] text-[#1e61ad]" : "bg-[#eaf8ed] text-[#287a37]"}`}>{p.status === "OPEN" ? "Open" : "Closed"}</span>
                <span className="text-xs text-gray-500">{p._count.certificates} certificate(s)</span>
                {p.status === "OPEN" && <button className={`${lightBtn} ml-auto`} disabled={busy} onClick={async () => { if (await confirm({ title: `Close ${p.label}?`, message: "The rankings for this period are frozen.", points: ["Draft certificates are created for the top performers", "Late corrections will not change the results", "Each certificate still needs your approval before it is issued", "A closed period cannot be reopened"], confirmLabel: "Close period" })) run(() => axios.post(`${domain}/governance/periods/${p.id}/close`, {}, { showSuccessToast: true })); }}>Close & draft certificates</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{admin ? "Certificates" : "My certificates"}</h2>
        {certs.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No certificates yet.</div> : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {certs.map((c) => (
              <div key={c.id} className="rounded-3xl bg-white p-5 shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
                <div className="flex items-start justify-between gap-3"><Award className="text-[#c9a227]" /><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${STATUS[c.status]}`}>{c.status === "DRAFT" ? "Awaiting approval" : c.status === "APPROVED" ? "Issued" : "Withdrawn"}</span></div>
                <h3 className="mt-3 font-semibold"><Link className="inline-block py-1 hover:underline" to={certLink(c)}>{c.nodeName}</Link></h3>
                <p className="text-xs text-gray-500">{c.companyName} · {LEVEL[c.level]}</p>
                <p className="mt-2 text-sm">Rank <b>#{c.rank}</b> · {METRIC[c.metric]} · <b>{c.score}%</b></p>
                <p className="text-xs text-gray-500">{c.period.label} · {c.code}</p>
                <div className="mt-4 flex gap-2">
                  {admin && c.status === "DRAFT" && <><button className={darkBtn} disabled={busy} onClick={async () => { if (await confirm({ title: "Approve and issue this certificate?", message: `${c.nodeName} · rank #${c.rank} · ${c.score}%`, points: ["The winner can see it and download the PDF", "It gets a verification code anyone can check", "You can withdraw it later if a mistake is found"], confirmLabel: "Approve & issue" })) run(() => axios.post(`${domain}/governance/certificates/${c.id}/decision`, { decision: "APPROVE" }, { showSuccessToast: true })); }}>Approve & issue</button><button className={lightBtn} disabled={busy} onClick={async () => { const reason = await ask({ title: "Withdraw this certificate?", tone: "danger", message: `${c.nodeName} will not receive this certificate. If it was already issued, its verification page stops showing it as genuine.`, input: { label: "Reason (kept for the record)", required: true }, confirmLabel: "Withdraw certificate" }); if (reason) run(() => axios.post(`${domain}/governance/certificates/${c.id}/decision`, { decision: "REJECT", reason })); }}>Withdraw</button></>}
                  {(c.status === "APPROVED" || admin) && <button className={lightBtn} onClick={() => setViewer({ title: "Certificate", subtitle: `${c.nodeName} · ${c.period.label} · ${c.code}`, url: `${domain}/governance/certificates/${c.id}/pdf`, filename: `${c.code}.pdf` })}><Eye size={15} /> View certificate</button>}{c.status === "APPROVED" && <button className={lightBtn} onClick={() => pdf(c)}><Download size={15} /> Download</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
