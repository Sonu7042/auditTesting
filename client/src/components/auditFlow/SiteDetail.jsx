import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, ProgressBar, Skeleton, SkeletonCard, cardClass, darkBtn, lightBtn } from "../siteOnboarding/ui";
import { ScoreRing } from "../auditorOnboarding/shared";
import DocumentViewer from "../common/DocumentViewer";
import ReportMenu from "../common/ReportMenu";
import UsersPanel from "../governance/UsersPanel";
import ChecklistProposals from "./ChecklistProposals";
import { SiteTrail } from "./SiteTrail";
import { SiteChangesPanel } from "../adminHub/SiteChangeRequests";
import SiteAwards from "../governance/SiteAwards";
import { basePathFor, siteShape } from "./siteTrailUtils";
import { DISCIPLINE_LABELS, FACILITY_LABELS, RATING_STYLES, SEVERITY_STYLES, fmtDate } from "./helpers";

const TABS = [["overview", "Dashboard"], ["checklist", "Checklist"], ["tools", "Tools"], ["manpower", "Manpower"], ["access", "Access"], ["proposals", "Proposed points"], ["changes", "Change requests"], ["awards", "Awards"], ["audits", "Audits & reports"], ["findings", "Findings"]];
const validity = (date) => {
  if (!date) return { label: "No date", cls: "bg-[#f1f1f1] text-[#555]" };
  const days = Math.floor((new Date(date) - new Date()) / 86400000);
  if (days < 0) return { label: "Expired", cls: "bg-[#fdecec] text-[#b42318]" };
  if (days <= 30) return { label: `Expires in ${days} d`, cls: "bg-[#fff3e0] text-[#9a5200]" };
  return { label: "Valid", cls: "bg-[#eaf8ed] text-[#287a37]" };
};

export default function SiteDetail() {
  const { locationId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const admin = localStorage.getItem("role") === "ADMIN";
  const base = basePathFor();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [findings, setFindings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("append");
  const [rank, setRank] = useState(null);
  const [viewer, setViewer] = useState(null);
  const { confirm } = useConfirm();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${domain}/client-audit-setup/locations/${locationId}/overview`, { showErrorToast: false });
      setD(data);
    } catch (e) { setError(e.userMessage || "This site is not available to you."); }
  }, [locationId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!d) return;
    if (admin) {
      axios.get(`${domain}/client-audit-setup/locations/${locationId}/checklist-snapshots`).then(({ data }) => setItems(data.snapshots?.[0]?.items || []));
      axios.get(`${domain}/client-qc/queue`, { params: { locationId } }).then(({ data }) => setReports((data.reports || []).filter((r) => r.location.id === locationId)));
    } else axios.get(`${domain}/client-qc/my-reports`).then(({ data }) => setReports((data.reports || []).filter((r) => r.location.id === locationId)));
    axios.get(`${domain}/client-qc/risk-register`, { params: { locationId } }).then(({ data }) => setFindings(data.register || []));
    axios.get(`${domain}/governance/leaderboard`, { params: { level: "site", metric: "overall", zone: d.site.zone, ro: d.site.regionalOffice } }).then(({ data }) => {
      const row = (data.rows || []).find((r) => r.key === locationId || r.mine);
      setRank(row ? { rank: row.rank, of: data.rows.length } : null);
    }).catch(() => setRank(null));
  }, [d, admin, locationId]);

  const site = d?.site;
  const profile = site?.profile || {};
  const byDiscipline = useMemo(() => items.reduce((acc, i) => { const k = i.itemData?.discipline || "INFRASTRUCTURE"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}), [items]);
  const newer = d?.versions?.[0] && !d.snapshots.some((s) => s.versionId === d.versions[0].id) ? d.versions[0] : null;

  const applyVersion = async (versionId) => {
    const v = d.versions.find((x) => x.id === versionId);
    if (!(await confirm({ title: `Use checklist ${v?.version || ""} for this site?`, message: "Future audits at this site use the new version. Audits already scheduled keep the checklist they were created with.", points: ["The questions that apply to this site are re-evaluated and frozen", "Past reports are not changed", "Score trends compare only the questions both versions share"], confirmLabel: "Use this version" }))) return;
    setBusy(true);
    try { await axios.post(`${domain}/client-audit-setup/locations/${locationId}/checklist-snapshots`, { versionId }, { showSuccessToast: true }); await load(); } finally { setBusy(false); }
  };
  const downloadTemplate = async () => {
    const res = await axios.get(`${domain}/client-audit-setup/registers-template`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = "tools-manpower-template.xlsx"; a.click(); URL.revokeObjectURL(url);
  };
  const uploadRegisters = async (file) => {
    if (!file) return;
    if (!(await confirm({ title: mode === "replace" ? "Replace the existing rows?" : "Add these rows?", tone: mode === "replace" ? "danger" : "primary", message: mode === "replace" ? "All current tools and manpower rows for this site are replaced by the workbook." : "Rows from the workbook are added, and rows with the same tool or role are updated.", confirmLabel: mode === "replace" ? "Replace rows" : "Add rows" }))) return;
    const f = new FormData(); f.append("file", file); f.append("mode", mode);
    setBusy(true);
    try { const { data } = await axios.post(`${domain}/client-audit-setup/locations/${locationId}/registers`, f); toast.success(data.message); await load(); } finally { setBusy(false); }
  };

  const counted = reports.filter((r) => ["APPROVED", "PUBLISHED", "SIGNED_OFF"].includes(r.status) && !r.isDemo && r.percent !== null);
  const score = counted.length ? Math.round((counted.reduce((a, r) => a + r.percent, 0) / counted.length) * 10) / 10 : null;
  const rating = counted.map((r) => r.rating).filter(Boolean).sort().slice(-1)[0];
  const real = findings.filter((f) => !f.isDemo);
  const openNow = real.filter((f) => !["CLOSED", "VOID"].includes(f.status));
  const openCritical = openNow.filter((f) => f.risk === "Critical").length;
  const overdue = openNow.filter((f) => f.overdue).length;
  const closure = real.length ? Math.round(((real.length - openNow.length) / real.length) * 100) : null;
  const disciplines = Object.entries(counted.reduce((acc, r) => { Object.entries(r.disciplines || {}).forEach(([k, v]) => { if (v.percent != null) (acc[k] ||= []).push(v.percent); }); return acc; }, {})).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10]);
  const history = [...counted].sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt)).map((r) => ({ label: fmtDate(r.generatedAt), percent: r.percent }));

  if (error) return <div><Header /><PageTitle title="Site" subtitle={error} /></div>;
  if (!d) {
    return (
      <div>
        <Header />
        <div className={`mb-6 ${cardClass}`}>
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-72 mb-2" />
          <Skeleton className="h-4 w-60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }
  const shape = siteShape({ ...site, companyId: site.programme.companyId, company: site.programme.company.companyName });
  const upload = admin && (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button className={lightBtn} onClick={downloadTemplate}><Download size={15} /> Template</button>
      <label className={`${lightBtn} cursor-pointer`}><Upload size={15} /> Upload Excel<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { uploadRegisters(e.target.files?.[0]); e.target.value = ""; }} /></label>
      <select className="rounded-xl border border-[#CECECE] bg-white px-3 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}><option value="append">Add to existing rows</option><option value="replace">Replace existing rows</option></select>
      {busy && <span className="text-xs text-gray-500">Working...</span>}
    </div>
  );

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Network", to: base }, { label: shape.company, to: `${base}?companyId=${shape.companyId}` }, { label: `Zone ${site.zone}`, to: `${base}?${new URLSearchParams({ companyId: shape.companyId, zone: site.zone })}` }, { label: site.regionalOffice, to: `${base}?${new URLSearchParams({ companyId: shape.companyId, zone: site.zone, ro: site.regionalOffice })}` }, { label: site.locationName }]}
        title={`${site.dealerName} · ${site.locationName}`}
        subtitle={`${site.locationCode}${site.sapCode ? ` · SAP ${site.sapCode}` : ""} · ${site.city || ""}${site.state ? `, ${site.state}` : ""}`}
        actions={<div className="flex flex-wrap gap-2">{site.facilities.map((f) => <span key={f.id} className="whitespace-nowrap rounded-full bg-[#eaf8ed] px-3 py-1.5 text-xs text-[#287a37]">{FACILITY_LABELS[f.facilityType]}{f.tier ? ` · ${f.tier}` : ""}</span>)}</div>}
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([k, t]) => <button key={k} onClick={() => setParams(k === "overview" ? {} : { tab: k })} className={`rounded-full px-4 py-2 text-sm ${tab === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className={`${cardClass} lg:col-span-2`}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr]">
              <div className="flex items-center gap-5">
                <ScoreRing value={score} size={120} />
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">Overall index</div>
                  <div className="text-4xl font-semibold">{score ?? "—"}{score !== null && "%"}</div>
                  {rating && <span className={`mt-1 inline-block rounded-lg px-2.5 py-0.5 text-sm font-semibold ${RATING_STYLES[rating]}`}>Rating {rating}</span>}
                  {rank && <div className="mt-2 text-xs text-gray-600">#{rank.rank} of {rank.of} in this regional office</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[["Open critical", openCritical, openCritical ? "text-[#b42318]" : ""], ["Overdue actions", overdue, overdue ? "text-[#9a5200]" : ""], ["Findings closed", closure !== null ? `${closure}%` : "—", ""], ["Audits counted", counted.length, ""]].map(([l, v, c]) => <div key={l} className="rounded-2xl bg-[#f7f8fa] p-4"><div className={`text-2xl font-semibold ${c}`}>{v}</div><div className="text-xs text-gray-500">{l}</div></div>)}
              </div>
            </div>
            {score === null && <p className="mt-4 rounded-xl bg-[#fff8f0] p-3 text-sm text-[#7a4f00]">{reports.length ? "This site has audits, but none has been approved by QC yet, so it is not scored." : "This site has not been audited yet."}</p>}
          </section>
          {disciplines.length > 0 && (
            <section className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold">Score by audit type</h2>
              <div className="space-y-3">{disciplines.map(([k, v]) => <div key={k}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{DISCIPLINE_LABELS[k]}</span><b>{v}%</b></div><ProgressBar value={v} /></div>)}</div>
            </section>
          )}
          {history.length > 0 && (
            <section className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold">Audit history</h2>
              {history.length < 2 ? <p className="text-sm text-gray-500">One audit so far ({history[0].percent}% on {history[0].label}). A trend appears after the next cycle.</p> : (
                <div className="h-44"><ResponsiveContainer><AreaChart data={history} margin={{ left: -20, right: 10, top: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" /><XAxis dataKey="label" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} /><Tooltip /><Area type="monotone" dataKey="percent" stroke="#287a37" strokeWidth={2} fill="#63C174" fillOpacity={0.25} name="Score %" /></AreaChart></ResponsiveContainer></div>
              )}
            </section>
          )}
          {counted.length > 0 && (
            <section className={`${cardClass} lg:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold">Latest reports</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {counted.slice(0, 3).map((r) => <Link key={r.id} to={admin ? `/admin-dashboard/qc/report/${r.id}` : `/user-dashboard/reports-hub/${r.id}`} className="rounded-2xl border border-[#e1e5ea] p-4 text-sm hover:bg-[#fafafa]"><div className="font-medium">{r.facilityType ? FACILITY_LABELS[r.facilityType] : "Site"} · {r.percent}%</div><div className="text-xs text-gray-500">{r.reportNumber} · {fmtDate(r.generatedAt)}</div></Link>)}
              </div>
            </section>
          )}
          <section className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold">Where this site sits</h2>
            <p className="mb-3"><SiteTrail site={shape} className="!text-sm" /></p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[["Zone", site.zone], ["Regional office", site.regionalOffice], ["State", site.state], ["District", site.district], ["City", site.city], ["Category", site.category], ["Parent code", site.parentCode], ["MADB code", site.madbCode], ["Electrical supply", site.electricalSupplyType]].map(([l, v]) => <div key={l}><dt className="text-xs text-gray-500">{l}</dt><dd>{v || "—"}</dd></div>)}
            </dl>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold">Contact & location</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2"><dt className="text-xs text-gray-500">Address</dt><dd>{site.address}</dd></div>
              {[["Dealer principal / GM", site.contactName], ["Phone", site.contactPhone], ["Email", site.contactEmail], ["Geofence", `${site.geofenceRadiusM} m`]].map(([l, v]) => <div key={l}><dt className="text-xs text-gray-500">{l}</dt><dd>{v || "—"}</dd></div>)}
            </dl>
          </section>
          <section className={`${cardClass} lg:col-span-2`}>
            <h2 className="mb-3 text-lg font-semibold">Audit scope by facility</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {site.facilities.map((f) => (
                <div key={f.id} className="rounded-xl border border-[#e1e5ea] p-3 text-sm">
                  <div className="font-medium">{FACILITY_LABELS[f.facilityType]} <span className="text-xs text-gray-500">{f.tier}</span></div>
                  <div className="mt-2 flex flex-wrap gap-1">{Object.entries(profile.scope?.[f.facilityType] || {}).filter(([, v]) => v).map(([k]) => <span key={k} className="whitespace-nowrap rounded-full bg-[#f3f5f7] px-2 py-0.5 text-xs">{k.charAt(0) + k.slice(1).toLowerCase()}</span>)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "checklist" && (
        <section className={cardClass}>
          <h2 className="mb-1 text-lg font-semibold">Checklist for this site</h2>
          <p className="mb-4 text-sm text-gray-500">The checklist is chosen from the library during site set-up, then frozen as a snapshot for this site. Later checklist versions only apply when you choose to use them.</p>
          {d.snapshots.length === 0 ? <p className="rounded-xl bg-[#fff3e0] p-3 text-sm text-[#7a4f00]">No checklist is attached yet.{admin && d.versions[0] ? "" : ""}</p> : (
            <div className="mb-4 rounded-xl bg-[#f7f8fa] p-4 text-sm"><b>{d.snapshots[0].checklistName}</b> · version {d.snapshots[0].checklistVersion} · {d.snapshots[0].itemCount} questions apply to this site<div className="text-xs text-gray-500">Frozen {fmtDate(d.snapshots[0].generatedAt)}</div></div>
          )}
          {Object.keys(byDiscipline).length > 0 && <div className="mb-4 flex flex-wrap gap-2">{Object.entries(byDiscipline).map(([k, v]) => <span key={k} className="whitespace-nowrap rounded-full bg-[#eaf8ed] px-3 py-1 text-xs text-[#287a37]">{DISCIPLINE_LABELS[k]}: {v}</span>)}</div>}
          {admin && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {newer && <button className={darkBtn} disabled={busy} onClick={() => applyVersion(newer.id)}>Use newer version {newer.version}</button>}
              {!d.snapshots.length && d.versions[0] && <button className={darkBtn} disabled={busy} onClick={() => applyVersion(d.versions[0].id)}>Attach latest checklist ({d.versions[0].version})</button>}
              <Link to="/admin-dashboard/client-checklist-designer" className="text-sm underline">Open checklist library</Link>
            </div>
          )}
          {items.length > 0 && (
            <div className="max-h-96 overflow-auto rounded-xl border border-[#e1e5ea]">
              {items.map((i) => <div key={i.id} className="flex gap-3 border-b border-[#eef0f3] p-2.5 text-xs last:border-b-0"><span className="w-14 font-semibold">{i.questionCode}</span><span className="flex-1">{i.itemData?.questionText}</span><span className="w-24 text-gray-500">{DISCIPLINE_LABELS[i.itemData?.discipline] || ""}</span><span className={`h-fit rounded-full px-2 py-0.5 ${SEVERITY_STYLES[i.itemData?.severityOnFail] || ""}`}>{i.itemData?.severityOnFail}</span></div>)}
            </div>
          )}
        </section>
      )}

      {tab === "tools" && (
        <section className={cardClass}>
          <h2 className="mb-3 text-lg font-semibold">Tools register</h2>
          {upload}
          {!profile.tools?.length ? <p className="text-sm text-gray-500">No tools listed for this site.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Tool</th><th>Category</th><th>Required</th><th>Available</th><th>Valid till</th><th>Status</th></tr></thead>
              <tbody>{profile.tools.map((t, i) => { const v = validity(t.validTill); return <tr key={i} className="border-t border-[#eef0f3]"><td className="py-2">{t.name}</td><td className="text-xs">{t.category}</td><td>{t.required}</td><td className={Number(t.available) < Number(t.required) ? "font-semibold text-[#9a5200]" : ""}>{t.available === "" ? "—" : t.available}</td><td className="text-xs">{fmtDate(t.validTill)}</td><td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${v.cls}`}>{v.label}</span></td></tr>; })}</tbody></table>
          )}
        </section>
      )}

      {tab === "manpower" && (
        <section className={cardClass}>
          <h2 className="mb-3 text-lg font-semibold">Manpower</h2>
          {upload}
          {!profile.manpower?.length ? <p className="text-sm text-gray-500">No manpower listed for this site.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Facility</th><th>Role</th><th>Required</th><th>On roll</th><th>Gap</th></tr></thead>
              <tbody>{profile.manpower.map((m, i) => <tr key={i} className="border-t border-[#eef0f3]"><td className="py-2 text-xs">{FACILITY_LABELS[m.facilityType] || m.facilityType}</td><td>{m.role}</td><td>{m.required}</td><td>{m.onRoll === "" ? "—" : m.onRoll}</td><td className={Number(m.onRoll) < Number(m.required) ? "font-semibold text-[#9a5200]" : "text-[#287a37]"}>{m.onRoll === "" ? "—" : Number(m.onRoll) - Number(m.required)}</td></tr>)}</tbody></table>
          )}
        </section>
      )}

      {tab === "access" && (
        admin ? (
          <UsersPanel
            title="Who can see this site"
            subtitle="Users covering this site directly, or through its regional office, zone or company. Add a site in-charge or site user here; each gets a generated username and a one-time password."
            url={`/governance/access/site/${locationId}`}
            lock={{ companyId: site.programme.companyId, locationId }}
            roles={["SITE_INCHARGE", "SITE_USER"]}
            emptyText="No client users cover this site yet."
          />
        ) : <section className={cardClass}><p className="text-sm text-gray-500">User access is managed by Back-Admin.</p></section>
      )}

      {tab === "changes" && <SiteChangesPanel site={site} />}
      {tab === "awards" && <SiteAwards site={site} />}
      {tab === "proposals" && (
        admin ? <ChecklistProposals embedded locationCode={site.locationCode} /> : (
          d.proposals.length === 0 ? <div className={`${cardClass} text-sm text-gray-500`}>No proposed points for this site.</div> : (
            <div className="space-y-3">{d.proposals.map((p) => <div key={p.id} className={cardClass}><div className="text-sm font-medium">{p.questionText}</div><div className="mt-1 text-xs text-gray-500">{p.status.replaceAll("_", " ")} · {fmtDate(p.createdAt)}</div></div>)}</div>
          )
        )
      )}

      {tab === "audits" && (
        <section className={cardClass}>
          <h2 className="mb-3 text-lg font-semibold">Audits & reports</h2>
          {reports.length === 0 ? <p className="text-sm text-gray-500">No reports for this site yet.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Report</th><th>Facility</th><th>Score</th><th>Findings</th><th>Status</th><th>Document</th></tr></thead>
              <tbody>{reports.map((r) => <tr key={r.id} className="border-t border-[#eef0f3]">
                <td className="py-2"><Link className="underline" to={admin ? `/admin-dashboard/qc/report/${r.id}` : `/user-dashboard/reports-hub/${r.id}`}>{r.reportNumber}</Link>{r.isDemo ? <span className="ml-2 text-xs text-gray-500">demo</span> : null}<div className="text-xs text-gray-500">{fmtDate(r.generatedAt)}</div></td>
                <td className="text-xs">{r.facilityType ? FACILITY_LABELS[r.facilityType] : "Site"}</td>
                <td className="w-40"><div className="flex items-center gap-2"><ProgressBar value={r.percent || 0} /><b>{r.percent ?? "—"}%</b>{r.rating && <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${RATING_STYLES[r.rating]}`}>{r.rating}</span>}</div></td>
                <td>{r.counts.nonCompliant}</td><td className="text-xs">{r.status.replaceAll("_", " ")}</td><td className="whitespace-nowrap"><ReportMenu reportId={r.id} compact label="Word" align="left" /><ReportMenu reportId={r.id} compact format="pdf" label="PDF" align="left" title="Audit report" onPreview={(v) => setViewer({ ...v, subtitle: `${r.reportNumber} · ${site.locationName}` })} /></td></tr>)}</tbody></table>
          )}
          {d.jobs.length > 0 && <p className="mt-4 text-xs text-gray-500">Recent audit visits: {d.jobs.map((j) => `${j.facilityType ? FACILITY_LABELS[j.facilityType] : "Site"} (${j.status.toLowerCase()}, ${fmtDate(j.scheduledStart)})`).join(" · ")}</p>}
        </section>
      )}

      {tab === "findings" && (
        <section className={cardClass}>
          <h2 className="mb-3 text-lg font-semibold">Findings</h2>
          {findings.length === 0 ? <p className="text-sm text-gray-500">No findings recorded for this site.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">NC</th><th>Finding</th><th>Risk</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{findings.filter((f) => !f.isDemo || admin).map((n) => <tr key={n.id} className="border-t border-[#eef0f3] align-top"><td className="py-2 text-xs">{n.ncNumber}<div className="text-gray-500">{n.questionCode}</div></td><td className="max-w-md text-xs">{n.question}<div className="text-gray-500">{n.observation}</div></td><td><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[n.risk.toUpperCase()]}`}>{n.risk}</span></td><td className="text-xs">{n.mahindraPriority}</td><td className={`text-xs ${n.overdue ? "font-semibold text-[#b42318]" : ""}`}>{fmtDate(n.dueAt)}</td><td className="text-xs">{n.closedOnSpot ? "Closed on the spot" : n.status.replaceAll("_", " ")}</td></tr>)}</tbody></table>
          )}
        </section>
      )}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
