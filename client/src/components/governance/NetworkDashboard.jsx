import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronRight, Trophy } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { ProgressBar, SkeletonPage, cardClass } from "../siteOnboarding/ui";
import { ScoreRing } from "../auditorOnboarding/shared";
import { DISCIPLINE_LABELS, RATING_STYLES } from "../auditFlow/helpers";
import { SiteTrail } from "../auditFlow/SiteTrail";

const LEVEL_TITLE = { zone: "Zones", ro: "Regional offices", site: "Sites" };
const RATING_COLORS = { "A+": "#1b6b2c", A: "#63C174", B: "#b8d86a", C: "#f0b429", D: "#e5484d" };
const monthLabel = (m) => new Date(`${m}-01`).toLocaleString("en-IN", { month: "short", year: "2-digit" });

// One dashboard for the whole network: overall performance, then zone, regional office, site,
// and finally the site's own dashboard. The URL carries the position, so every view is linkable.
export default function NetworkDashboard() {
  const admin = localStorage.getItem("role") === "ADMIN";
  const base = admin ? "/admin-dashboard" : "/user-dashboard";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const path = useMemo(() => Object.fromEntries(["companyId", "zone", "ro"].map((k) => [k, params.get(k)]).filter(([, v]) => v)), [params]);
  const [data, setData] = useState(null);

  useEffect(() => { axios.get(`${domain}/governance/summary`, { params: path }).then(({ data: d }) => setData(d)); }, [path]);

  const go = (p) => navigate(`${base}${Object.keys(p).length ? `?${new URLSearchParams(p).toString()}` : ""}`);
  const drill = (node) => { if (node.level === "zone") go({ ...path, zone: node.key }); else if (node.level === "ro") go({ ...path, ro: node.key }); };

  // A user who covers a single zone or office starts inside it instead of at a one-card list.
  useEffect(() => {
    if (!admin && data && data.nodes.length === 1 && data.level !== "site") drill(data.nodes[0]);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div><Header /><SkeletonPage /></div>;
  const t = data.totals;
  const company = data.companies.find((c) => c.id === path.companyId);
  const crumbs = [
    { label: admin ? "All sites" : "My network", p: {} },
    company && { label: company.name, p: { companyId: company.id } },
    path.zone && { label: `Zone ${path.zone}`, p: { ...(company ? { companyId: company.id } : {}), zone: path.zone } },
    path.ro && { label: path.ro, p: { ...(company ? { companyId: company.id } : {}), zone: path.zone, ro: path.ro } },
  ].filter(Boolean);
  const scopeName = path.ro || (path.zone ? `Zone ${path.zone}` : company?.name || (admin ? "the whole network" : "your network"));
  const dist = Object.entries(data.distribution);
  const distMax = Math.max(1, ...dist.map(([, n]) => n));
  const kpis = [
    ["Sites audited", `${t.auditedCount}/${t.siteCount}`, ""],
    ["Safety index", t.safety !== null ? `${t.safety}%` : "—", ""],
    ["Open critical", t.openCritical, t.openCritical ? "text-[#b42318]" : ""],
    ["Overdue actions", t.overdue, t.overdue ? "text-[#9a5200]" : ""],
    ["Findings closed", t.closureRate !== null ? `${t.closureRate}%` : "—", ""],
  ];

  return (
    <div>
      <Header />
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm" aria-label="Where you are">
        {crumbs.map((c, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight size={14} className="text-gray-500" />}<button className={`rounded-full px-3 py-1.5 shadow-sm ${i === crumbs.length - 1 ? "bg-[#181919] text-white" : "bg-white"}`} onClick={() => go(c.p)}>{c.label}</button></span>)}
      </nav>
      {!path.zone && data.companies.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => go({})} className={`rounded-full px-4 py-1.5 text-sm ${!path.companyId ? "bg-[#287a37] text-white" : "bg-white shadow-sm"}`}>All companies</button>
          {data.companies.map((c) => <button key={c.id} onClick={() => go({ companyId: c.id })} className={`rounded-full px-4 py-1.5 text-sm ${path.companyId === c.id ? "bg-[#287a37] text-white" : "bg-white shadow-sm"}`}>{c.name}</button>)}
        </div>
      )}

      <section className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-[#1F3A5F] to-[#2b5a8c] p-6 text-white shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
          <div className="text-xs uppercase tracking-wide text-white/70">Performance · {scopeName}</div>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1"><div className="text-5xl font-semibold leading-none xl:text-6xl">{t.overall ?? "—"}{t.overall !== null && <span className="text-3xl">%</span>}</div><div className="pb-1 text-sm text-white/80">overall index</div></div>
          <div className="mt-5 space-y-1.5">
            {dist.map(([r, n]) => <div key={r} className="flex items-center gap-2 text-xs"><span className="w-6">{r}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${(n / distMax) * 100}%`, background: RATING_COLORS[r] }} /></div><span className="w-5 text-right">{n}</span></div>)}
          </div>
          <div className="mt-2 text-xs text-white/60">Sites by rating. Only QC-approved audits count.</div>
        </div>
        <div className={`${cardClass} lg:col-span-2`}>
          <div className="mb-2 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Overall index over time</h2><span className="text-xs text-gray-500">Monthly average of counted audits</span></div>
          {data.trend.length < 2 ? <p className="py-10 text-center text-sm text-gray-500">{data.trend.length ? `Only ${monthLabel(data.trend[0].month)} so far (${data.trend[0].overall}%). The trend appears once audits span more than one month.` : "No counted audits yet."}</p> : (
            <div className="h-44"><ResponsiveContainer><AreaChart data={data.trend.map((x) => ({ ...x, label: monthLabel(x.month) }))} margin={{ left: -20, right: 10, top: 5 }}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63C174" stopOpacity={0.5} /><stop offset="100%" stopColor="#63C174" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="label" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Area type="monotone" dataKey="overall" stroke="#287a37" strokeWidth={2} fill="url(#trendFill)" name="Overall %" /></AreaChart></ResponsiveContainer></div>
          )}
        </div>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map(([l, v, c]) => <div key={l} className={cardClass}><div className={`text-2xl font-semibold ${c}`}>{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
      </section>

      <section className={`${cardClass} mb-6`}>
        <h2 className="mb-3 text-sm font-semibold">Average score by audit type</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(data.disciplines).map(([k, v]) => <div key={k}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{DISCIPLINE_LABELS[k]}</span><b className="shrink-0 tabular-nums">{v ?? "—"}{v !== null && "%"}</b></div><ProgressBar value={v || 0} /></div>)}
        </div>
      </section>

      <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{LEVEL_TITLE[data.level]} in {scopeName}</h2><span className="text-xs text-gray-500">{data.level === "site" ? "Open a site for its own dashboard" : "Click to go one level down"}</span></div>
      {data.nodes.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>Nothing here yet.</div> : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.nodes.map((n) => {
            const inner = (
              <>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{n.name}</h3><p className="truncate text-xs text-gray-500">{n.sub || `${n.siteCount} site${n.siteCount === 1 ? "" : "s"} · ${n.auditedCount} audited`}</p></div>
                  <ScoreRing value={n.overall} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-[#f3f5f7] py-2"><div className="text-sm font-semibold">{n.safety ?? "—"}{n.safety != null && "%"}</div>Safety</div>
                  <div className={`rounded-xl py-2 ${n.openCritical ? "bg-[#fdecec] text-[#b42318]" : "bg-[#f3f5f7]"}`}><div className="text-sm font-semibold">{n.openCritical}</div>Critical</div>
                  <div className={`rounded-xl py-2 ${n.overdue ? "bg-[#fff3e0] text-[#9a5200]" : "bg-[#f3f5f7]"}`}><div className="text-sm font-semibold">{n.overdue}</div>Overdue</div>
                </div>
                {n.level === "site" && n.rating && <span className={`mt-3 inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${RATING_STYLES[n.rating]}`}>Rating {n.rating}</span>}
                {n.level === "site" && n.overall === null && <p className="mt-3 text-xs text-gray-500">Not audited yet</p>}
              </>
            );
            const cls = "rounded-3xl bg-white p-5 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)]";
            return n.level === "site" ? <Link key={n.key} to={`${base}/site/${n.locationId}`} className={cls}>{inner}</Link> : <button key={n.key} onClick={() => drill(n)} className={cls}>{inner}</button>;
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className={cardClass}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-[#9a5200]" />Needs attention</h2>
          {data.attention.length === 0 ? <p className="text-sm text-gray-500">Nothing is flagged.</p> : data.attention.map((s) => (
            <Link key={s.id} to={`${base}/site/${s.id}?tab=findings`} className="flex items-center gap-3 border-t border-[#eef0f3] py-2.5 first:border-t-0 hover:bg-[#fafafa]">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.name}</div><SiteTrail site={s} /></div>
              <span className="text-xs">{s.openCritical ? <b className="text-[#b42318]">{s.openCritical} critical</b> : null}{s.overdue ? <span className="ml-2 text-[#9a5200]">{s.overdue} overdue</span> : null}</span>
              <b className="w-12 text-right text-sm">{s.overall}%</b>
            </Link>
          ))}
        </section>
        <section className={cardClass}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Trophy size={16} className="text-[#c9a227]" />Top performers</h2>
          {data.best.length === 0 ? <p className="text-sm text-gray-500">No audited sites yet.</p> : data.best.map((s, i) => (
            <Link key={s.id} to={`${base}/site/${s.id}`} className="flex items-center gap-3 border-t border-[#eef0f3] py-2.5 first:border-t-0 hover:bg-[#fafafa]">
              <span className="w-6 text-sm font-semibold text-gray-500">#{i + 1}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.name}</div><SiteTrail site={s} /></div>
              <b className="text-sm">{s.overall}%</b>
            </Link>
          ))}
          <Link to={`${base}/rankings`} className="mt-3 inline-block text-xs underline">Full leaderboard</Link>
        </section>
      </div>
    </div>
  );
}
