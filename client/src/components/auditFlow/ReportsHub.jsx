import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import ReportMenu from "../common/ReportMenu";
import { PageTitle, ProgressBar, cardClass, inputClass } from "../siteOnboarding/ui";
import DocumentViewer from "../common/DocumentViewer";
import { SiteLink } from "./SiteTrail";
import { FACILITY_LABELS, RATING_STYLES } from "./helpers";
import { ImageOff } from "lucide-react";

const dayOnly = (v) => new Date(v).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replaceAll("/", ".");
const hm = (v) => new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
// DD.MM.YYYY and DD.MM.YYYY, HH:MM, in Indian time.
const dtc = (v) => (v ? `${dayOnly(v)}, ${hm(v)}` : "—");
const day = (v) => (v ? dayOnly(v) : "—");
const STATUS_TEXT = (s) => (s === "SIGNED_OFF" ? "Signed off" : s === "PUBLISHED" ? "Issued" : s.replaceAll("_", " ").toLowerCase());

// The auditor's first photograph (site front facade). Loaded only when the card scrolls into view.
function FacadeThumb({ reportId, enabled }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || !ref.current) return undefined;
    let url; let cancelled = false;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      axios.get(`${domain}/client-qc/reports/${reportId}/facade`, { responseType: "blob", showErrorToast: false })
        .then((res) => { if (!cancelled) { url = URL.createObjectURL(res.data); setSrc(url); } })
        .catch(() => !cancelled && setFailed(true));
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [reportId, enabled]);
  return (
    <div ref={ref} className="flex h-[52px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e9ecef] text-gray-400">
      {src ? <img src={src} alt="Site front facade" className="h-full w-full object-cover" /> : failed || !enabled ? <ImageOff size={16} aria-label="No photograph" /> : <span className="text-[10px]">Photo...</span>}
    </div>
  );
}

// "09 Oct 2026, 19:41 | 19:42 · 1 min" when the audit ran within one day, otherwise both dates.

// "≤ 24 h" in green when the step met its time limit, otherwise the hours taken in amber.
function Chip({ ok, limit, over, title }) {
  return <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10.5px] font-medium ${ok ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fff3e0] text-[#9a5200]"}`} title={title || (ok ? `Within ${limit}` : `Took ${over}, over the ${limit} limit`)}>{ok ? `≤ ${limit}` : `${over}`}</span>;
}

const RISK_STYLE = { HIGH: "bg-[#fdecec] text-[#b42318]", MEDIUM: "bg-[#fff3e0] text-[#9a5200]", LOW: "bg-[#eaf8ed] text-[#287a37]", NA: "bg-[#eceef1] text-gray-500" };
const riskKey = (level) => (/high/i.test(level || "") ? "HIGH" : /medium/i.test(level || "") ? "MEDIUM" : /low/i.test(level || "") ? "LOW" : "NA");

// Heading above, value below.
function Fact({ label, children }) {
  return <div className="min-w-0 whitespace-nowrap"><dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</dt><dd className="mt-px text-[12.5px] font-medium text-[#181919]">{children}</dd></div>;
}

// One audit, one full-width row: what it scored, when it was planned, done, submitted and reviewed, and where the auditor checked in.
function AuditRow({ r, siteName, onOpen, onPreview }) {
  const v = r.visit || {};
  const [now] = useState(() => Date.now());
  const late = v.syncLateHours > 24;
  const hoursBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 36e5));
  const takenH = v.startedAt && v.completedAt ? hoursBetween(v.startedAt, v.completedAt) : 0;
  const reviewH = v.syncedAt ? hoursBetween(v.syncedAt, v.reviewedAt || now) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-[#f7f8fa] px-3 py-2.5 hover:bg-[#f0f2f5]">
      <FacadeThumb reportId={r.id} enabled={Boolean(v.hasFacade)} />
      <div className="min-w-0 flex-1 basis-[560px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={onOpen} title="Open the audit" className="text-left text-[14px] font-semibold hover:underline">{FACILITY_LABELS[r.facilityType] || "Whole site"} audit</button>
          {r.rating && <span className={`rounded-md px-1.5 py-px text-[11px] font-semibold ${RATING_STYLES[r.rating]}`}>{r.rating}</span>}
          <span className={`rounded-full px-2 py-px text-[11px] font-medium ${RISK_STYLE[riskKey(r.riskLevel)]}`} title="Risk level from the score">{riskKey(r.riskLevel) === "NA" ? "N/A" : `${riskKey(r.riskLevel)[0]}${riskKey(r.riskLevel).slice(1).toLowerCase()} risk`}</span>
          <span className="text-[11px] text-gray-600" title="Non-compliances raised">{r.counts?.nonCompliant ?? 0} finding{(r.counts?.nonCompliant ?? 0) === 1 ? "" : "s"}</span>
          <span className="rounded-full bg-white px-2 py-px text-[11px] text-gray-600">{STATUS_TEXT(r.status)}</span>
          <span className="text-[11px] text-gray-500">{r.reportNumber}</span>
        </div>
        <dl className="mt-1.5 flex flex-wrap items-start gap-x-6 gap-y-1.5">
          <Fact label="Planned">{day(v.planned)}</Fact>
          <Fact label="Started">{v.startedAt ? dtc(v.startedAt) : <span className="font-normal text-gray-500">Not started</span>}</Fact>
          <Fact label="Completed">
            {v.completedAt ? dtc(v.completedAt) : <span className="font-normal text-gray-500">in progress</span>}
            {v.completedAt && <Chip ok={takenH <= 24} limit="24 h" over={`${takenH} h`} />}
          </Fact>
          <Fact label="Synced on">
            {dtc(v.syncedAt)}
            {late
              ? <span className="ml-1.5 rounded-full bg-[#fff3e0] px-1.5 py-px text-[10.5px] font-medium text-[#9a5200]" title={v.syncJustification || "No justification recorded"}>Late · {v.syncLateHours} h</span>
              : <Chip ok limit="24 h" />}
            {late && <span className="ml-1.5 inline-block max-w-[190px] truncate align-bottom text-[11px] font-normal text-gray-600" title={v.syncJustification || ""}>{v.syncJustification ? `“${v.syncJustification}”` : "no reason recorded"}</span>}
          </Fact>
          <Fact label="Reviewed on">
            {v.reviewedAt ? dtc(v.reviewedAt) : <span className="font-normal text-gray-500">pending</span>}
            {v.reviewedAt ? <Chip ok={reviewH <= 48} limit="48 h" over={`${reviewH} h`} /> : reviewH > 48 ? <Chip ok={false} limit="48 h" over={`${reviewH} h and counting`} /> : null}
          </Fact>
          <Fact label="Approved on">{v.approvedAt ? dtc(v.approvedAt) : <span className="font-normal text-gray-500">not yet</span>}</Fact>
        </dl>
      </div>
      {/* Score on top; Word on the left edge of the bar, Open on its right edge, PDF centred. */}
      <div className="ml-auto w-[240px] shrink-0">
        <div className="flex items-center gap-2"><div className="flex-1"><ProgressBar value={r.percent || 0} /></div><b className="w-12 text-right text-[13px]">{r.percent ?? "—"}{r.percent !== null && "%"}</b></div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="-ml-3"><ReportMenu reportId={r.id} compact label="Word" align="left" /></div>
          <ReportMenu reportId={r.id} compact format="pdf" label="PDF" title="Audit report" onPreview={(p) => onPreview({ ...p, subtitle: `${siteName} · ${r.reportNumber}` })} />
          <button type="button" onClick={onOpen} className="-mr-3 min-h-9 rounded-xl px-3 text-xs font-medium text-[#1e61ad] hover:bg-white">Open</button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsHub() {
  const navigate = useNavigate();
  const admin = localStorage.getItem("role") === "ADMIN";
  const base = admin ? "/admin-dashboard" : "/user-dashboard";
  const [reports, setReports] = useState(null);
  const [search, setSearch] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    const url = admin ? `${domain}/client-qc/queue` : `${domain}/client-qc/my-reports`;
    axios.get(url).then(({ data }) => setReports(data.reports || []));
  }, [admin]);

  const sites = useMemo(() => {
    const map = new Map();
    (reports || []).filter((r) => showDemo || !r.isDemo).forEach((r) => {
      const key = r.location.id;
      if (!map.has(key)) map.set(key, { location: r.location, facilities: {} });
      const bucket = map.get(key).facilities; const f = r.facilityType || "SITE";
      if (!bucket[f] || new Date(r.generatedAt) > new Date(bucket[f].generatedAt)) bucket[f] = r;
    });
    const q = search.trim().toLowerCase();
    return [...map.values()].filter((s) => !q || `${s.location.locationName} ${s.location.dealerName} ${s.location.locationCode}`.toLowerCase().includes(q))
      .map((s) => { const list = Object.values(s.facilities).filter((r) => r.percent !== null); return { ...s, combined: list.length ? Math.round((list.reduce((a, r) => a + r.percent, 0) / list.length) * 10) / 10 : null }; });
  }, [reports, search, showDemo]);

  const open = (id) => navigate(admin ? `${base}/qc/report/${id}` : `${base}/reports-hub/${id}`);

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Client Submission" }]} title="Reports" subtitle="One report per facility and audit type, plus the combined score for the site once all its facility audits are in. Each audit has its Word and PDF report, per audit type or combined." actions={admin && <ReportMenu />} />
      <div className="mb-5 flex items-center gap-4"><input className={`${inputClass} !mt-0 max-w-xs`} placeholder="Search site, dealer or code" value={search} onChange={(e) => setSearch(e.target.value)} />{admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} />Include demo audits</label>}</div>
      {reports === null ? <p className="text-sm text-gray-500">Loading...</p> : sites.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No reports yet.</div> : (
        <div className="grid grid-cols-1 gap-5">
          {sites.map((s) => (
            <section key={s.location.id} className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <SiteLink site={s.location} />
                <div className="text-right"><div className="text-xs text-gray-500">Combined</div><div className="text-2xl font-semibold">{s.combined ?? "—"}{s.combined !== null && "%"}</div></div>
              </div>
              <div className="mt-3 space-y-2">
                {Object.values(s.facilities).map((r) => <AuditRow key={r.id} r={r} siteName={s.location.locationName} onOpen={() => open(r.id)} onPreview={setViewer} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
