import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { Field, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { SiteLink } from "./SiteTrail";
import { FACILITY_LABELS, TRACK_LABELS, fmtDateTime, toLocalInput } from "./helpers";

const NOTICE_STYLE = { SENT: "bg-[#eaf8ed] text-[#287a37]", PENDING: "bg-[#e8f1fd] text-[#1e61ad]", MISSED: "bg-[#fdecec] text-[#b42318]", SKIPPED: "bg-[#f1f1f1] text-[#555]" };
const JOB_STYLE = { SCHEDULED: "bg-[#e8f1fd] text-[#1e61ad]", IN_PROGRESS: "bg-[#fff6e8] text-[#9a5200]", COMPLETED: "bg-[#eaf8ed] text-[#287a37]", CANCELLED: "bg-[#f1f1f1] text-[#555]" };

const defaultStart = () => { const d = new Date(Date.now() + 8 * 86400000); d.setHours(9, 30, 0, 0); return d; };

export default function ScheduleAudit() {
  const [params] = useSearchParams();
  const [locations, setLocations] = useState([]);
  const [options, setOptions] = useState({ auditors: [], snapshots: [] });
  const [versions, setVersions] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ locationId: "", facilityType: "", includesShared: true, snapshotId: "", mode: "TWO", trackA: "", trackB: "", single: "", start: toLocalInput(defaultStart()), end: toLocalInput(new Date(defaultStart().getTime() + 8 * 3600000)), isDemo: params.get("demo") === "1", auditCycle: "FY 2026-27", notes: "" });
  const [readiness, setReadiness] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("ACTIVE");
  const { confirm, ask } = useConfirm();

  const load = useCallback(async () => {
    const [l, o, v, j] = await Promise.all([
      axios.get(`${domain}/client-audit-setup/locations`), axios.get(`${domain}/client-audit-jobs/options`),
      axios.get(`${domain}/client-audit-setup/checklists/versions`), axios.get(`${domain}/client-audit-jobs`),
    ]);
    setLocations(l.data.locations || []); setOptions(o.data); setVersions(v.data.versions || []); setJobs(j.data.jobs || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loc = locations.find((l) => l.id === form.locationId);
  const siteSnapshots = options.snapshots.filter((s) => s.locationId === form.locationId).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  const latestPublished = useMemo(() => versions.filter((v) => v.status === "PUBLISHED" && loc && v.programmeId === loc.programmeId).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0], [versions, loc]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!loc) return;
    const first = loc.facilities?.[0]?.facilityType || "";
    setForm((f) => ({ ...f, facilityType: f.facilityType && loc.facilities.some((x) => x.facilityType === f.facilityType) ? f.facilityType : first, snapshotId: siteSnapshots[0]?.id || "" }));
  }, [form.locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(() => {
    const assignments = form.mode === "ONE"
      ? (form.single ? [{ auditorId: form.single, track: "ALL" }] : [])
      : [form.trackA && { auditorId: form.trackA, track: "A" }, form.trackB && { auditorId: form.trackB, track: "B" }].filter(Boolean);
    return {
      snapshotId: form.snapshotId, facilityType: form.facilityType || null, includesShared: form.includesShared, isDemo: form.isDemo, assignments,
      scheduledStart: form.start ? new Date(form.start).toISOString() : "", scheduledEnd: form.end ? new Date(form.end).toISOString() : "", auditCycle: form.auditCycle, notes: form.notes,
    };
  }, [form]);

  useEffect(() => {
    if (!payload.snapshotId || !payload.assignments.length) return;
    let alive = true;
    axios.post(`${domain}/client-audit-jobs/readiness`, payload, { showErrorToast: false }).then(({ data }) => alive && setReadiness(data.readiness)).catch((e) => alive && setReadiness({ ready: false, blockers: [e.userMessage || "Could not check readiness"], auditorChecks: [] }));
    return () => { alive = false; };
  }, [payload]);

  const generateSnapshot = async () => {
    if (!latestPublished) return window.alert("Publish a checklist version for this programme first.");
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/locations/${loc.id}/checklist-snapshots`, { versionId: latestPublished.id }, { showSuccessToast: true });
      await load(); set("snapshotId", data.snapshot.id);
    } finally { setBusy(false); }
  };

  const schedule = async () => {
    const auditors = payload.assignments.length;
    if (!(await confirm({ title: "Schedule this audit and notify everyone?", message: `${loc?.locationName || "The site"}${form.facilityType ? ` · ${FACILITY_LABELS[form.facilityType]}` : ""} on ${fmtDateTime(payload.scheduledStart)}.`,
      points: [`${auditors} auditor(s) are told they are assigned`, form.isDemo ? "Demo audit: the dealer is still emailed, but results are not scored" : "The dealer contact is emailed the schedule now, then reminded at T-7, T-3 and T-1", "The audit appears in the calendar and the notice log", form.includesShared ? "It also covers the premises-wide items (site, electrical, fire, thermography)" : "Premises-wide items are audited in the other facility's audit"], confirmLabel: "Schedule & notify" }))) return;
    setBusy(true);
    try {
      await axios.post(`${domain}/client-audit-jobs`, payload, { showSuccessToast: true });
      setReadiness(null); await load();
    } finally { setBusy(false); }
  };
  const cancel = async (id) => {
    const reason = await ask({ title: "Cancel this audit?", tone: "danger", message: "The auditors and dealer are no longer expected on this date. A cancelled audit cannot be restarted; schedule a new one instead.", input: { label: "Reason for cancelling", required: true }, confirmLabel: "Cancel audit", cancelLabel: "Keep audit" });
    if (!reason) return;
    await axios.patch(`${domain}/client-audit-jobs/${id}/cancel`, { reason }, { showSuccessToast: true }); load();
  };

  const auditorLabel = (a) => `${a.fullName}${a.auditorQualification?.status === "ACTIVE" ? " · active" : " · not active"}${a.auditorQualification ? ` · ${Math.round(a.auditorQualification.calibrationScore)}%` : ""}`;
  const shownJobs = jobs.filter((j) => (filter === "ACTIVE" ? ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"].includes(j.status) : filter === "ALL" ? true : j.status === filter));

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Scheduling & Notification" }]} title="Scheduling" subtitle="Schedule one audit per facility. Each audit has two tracks with their own auditor. Dealer notices go out at scheduling, T-7, T-3 and T-1." actions={<Link to="/admin-dashboard/client-notices" className={lightBtn}>Notice log</Link>} />

      <section className={`${cardClass} mb-6`}>
        <h2 className="mb-4 text-lg font-semibold">Schedule an audit</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Site" span="md:col-span-2"><select className={inputClass} value={form.locationId} onChange={(e) => set("locationId", e.target.value)}><option value="">Select site</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.dealerName} · {l.locationName} ({l.locationCode})</option>)}</select></Field>
          <Field label="Facility"><select className={inputClass} disabled={!loc} value={form.facilityType} onChange={(e) => set("facilityType", e.target.value)}>{(loc?.facilities || []).map((f) => <option key={f.id} value={f.facilityType}>{FACILITY_LABELS[f.facilityType]}{f.tier ? ` · ${f.tier}` : ""}</option>)}</select></Field>
          <Field label="Checklist snapshot">
            {siteSnapshots.length ? <select className={inputClass} value={form.snapshotId} onChange={(e) => set("snapshotId", e.target.value)}>{siteSnapshots.map((s) => <option key={s.id} value={s.id}>{s.checklistName} v{s.checklistVersion} · {s.itemCount} items</option>)}</select>
              : <button className={`${lightBtn} mt-1 w-full`} disabled={!loc || busy} onClick={generateSnapshot}>Generate from latest checklist</button>}
            {siteSnapshots.length > 0 && latestPublished && !siteSnapshots.some((s) => s.versionId === latestPublished.id) && (
              <button className="mt-1 text-xs text-[#1e61ad] underline" disabled={busy} onClick={generateSnapshot}>A newer checklist (v{latestPublished.version}) is available. Use it for this audit.</button>
            )}
          </Field>
        </div>
        {loc && loc.facilities.length > 1 && (
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.includesShared} onChange={(e) => set("includesShared", e.target.checked)} />This audit also covers the premises-wide items (site, electrical, fire, thermography). Untick for the second facility of the same visit so they are audited once.</label>
        )}

        <div className="mt-6">
          <div className="mb-2 flex items-center gap-4 text-sm font-medium"><span>Auditors</span>
            {[["TWO", "Two tracks (A and B)"], ["ONE", "One auditor, all disciplines"]].map(([v, t]) => <label key={v} className="flex items-center gap-1 font-normal"><input type="radio" checked={form.mode === v} onChange={() => set("mode", v)} />{t}</label>)}
          </div>
          {form.mode === "TWO" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={TRACK_LABELS.A}><select className={inputClass} value={form.trackA} onChange={(e) => set("trackA", e.target.value)}><option value="">Select auditor</option>{options.auditors.map((a) => <option key={a.id} value={a.id}>{auditorLabel(a)}</option>)}</select></Field>
              <Field label={TRACK_LABELS.B}><select className={inputClass} value={form.trackB} onChange={(e) => set("trackB", e.target.value)}><option value="">Select auditor</option>{options.auditors.map((a) => <option key={a.id} value={a.id}>{auditorLabel(a)}</option>)}</select></Field>
            </div>
          ) : (
            <Field label="Auditor"><select className={`${inputClass} max-w-md`} value={form.single} onChange={(e) => set("single", e.target.value)}><option value="">Select auditor</option>{options.auditors.map((a) => <option key={a.id} value={a.id}>{auditorLabel(a)}</option>)}</select></Field>
          )}
          <p className="mt-2 text-xs text-gray-500">Choose by locality and competence. Only auditors who are approved, field-ready and free at that time pass the checks below.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Start"><input type="datetime-local" className={inputClass} value={form.start} onChange={(e) => set("start", e.target.value)} /></Field>
          <Field label="End"><input type="datetime-local" className={inputClass} value={form.end} onChange={(e) => set("end", e.target.value)} /></Field>
          <Field label="Audit cycle"><input className={inputClass} value={form.auditCycle} onChange={(e) => set("auditCycle", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 xl:col-span-4"><input type="checkbox" checked={form.isDemo} onChange={(e) => set("isDemo", e.target.checked)} />Demo audit (laptop, relaxed checks, not scored)</label>
        </div>
        <div className="mt-4"><Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>

        {readiness && (
          <div className={`mt-5 rounded-2xl p-4 text-sm ${readiness.ready ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fff3e0] text-[#7a4f00]"}`}>
            {readiness.ready ? `Ready to schedule${readiness.itemCount ? ` · ${readiness.itemCount} checklist items in scope` : ""}.` : <ul className="list-disc pl-5">{readiness.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
            {readiness.auditorChecks?.filter((c) => c.issues.length).map((c) => <div key={c.id} className="mt-2 text-xs"><b>{c.fullName}:</b> {c.issues.join("; ")}</div>)}
          </div>
        )}
        <div className="mt-5 flex justify-end"><button className={darkBtn} disabled={busy || !readiness?.ready} onClick={schedule}>Schedule audit & notify</button></div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">Scheduled audits</h2>
          {[["ACTIVE", "Active"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"], ["ALL", "All"]].map(([k, t]) => <button key={k} onClick={() => setFilter(k)} className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs ${filter === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}
        </div>
        {shownJobs.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No audits here.</div> : (
          <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
            <table className="w-full text-sm">
              <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Site</th><th>Facility</th><th>When</th><th>Auditors</th><th>Notices</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shownJobs.map((j) => (
                  <tr key={j.id} className="border-t border-[#e4e8ed] align-top">
                    <td className="p-3"><SiteLink site={j.location} />{j.isDemo ? <span className="text-xs text-gray-500">demo</span> : null}</td>
                    <td className="text-xs">{j.facilityType ? FACILITY_LABELS[j.facilityType] : "Whole site"}{j.includesShared ? <div className="text-gray-500">+ shared items</div> : null}</td>
                    <td className="text-xs">{fmtDateTime(j.scheduledStart)}</td>
                    <td className="text-xs">{j.assignments.map((a) => <div key={a.id}>{a.auditor.fullName} <span className="text-gray-500">({a.track})</span></div>)}</td>
                    <td><div className="flex flex-wrap gap-1">{(j.notices || []).filter((n) => n.kind !== "SCHEDULED").map((n) => <span key={n.id} title={n.note || ""} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${NOTICE_STYLE[n.status]}`}>{n.kind}</span>)}</div></td>
                    <td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${JOB_STYLE[j.status] || JOB_STYLE.SCHEDULED}`}>{j.status.replace("_", " ")}</span></td>
                    <td className="pr-3">{["SCHEDULED", "CONFIRMED"].includes(j.status) && <button className="min-h-9 rounded-xl px-2 text-xs text-[#b42318] underline hover:bg-[#fdecec]" onClick={() => cancel(j.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
