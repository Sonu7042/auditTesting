import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, Check, ClipboardPlus, Clock, MapPin, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { Field, Modal, PageTitle, ProgressBar, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import CameraCapture from "./CameraCapture";
import SignaturePad from "./SignaturePad";
import { DISCIPLINE_LABELS, FACILITY_LABELS, SEVERITY_STYLES, TRACK_LABELS } from "./helpers";

const api = `${domain}/client-audit-jobs`;

export default function AuditRun() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState(null);
  const [camera, setCamera] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [now, setNow] = useState(Date.now());
  const checkInPhoto = useRef(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [gps, setGps] = useState(null);

  const load = useCallback(async () => {
    const { data } = await axios.get(`${api}/${jobId}/check-in`);
    setDetails(data);
    if (data.session) {
      const res = await axios.get(`${api}/${jobId}/session`);
      setSession(res.data.session);
    }
  }, [jobId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const questions = useMemo(() => (session?.modules || []).flatMap((m) => m.sections.flatMap((s) => s.questions.map((q) => ({ ...q, moduleCode: m.moduleCode, sectionName: s.sectionName })))), [session]);
  const disciplines = useMemo(() => [...new Set(questions.map((q) => q.discipline))], [questions]);
  const activeTab = tab && disciplines.includes(tab) ? tab : disciplines[0];

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }); toast.success("Location captured"); },
      () => toast.error(details?.job?.isDemo ? "No location fix. Demo audits fall back to the site location." : "Location permission is needed to check in."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const checkIn = async () => {
    if (!checkInPhoto.current) return toast.error("Take the check-in photo first.");
    const f = new FormData();
    f.append("checkInPhoto", checkInPhoto.current, "check-in.jpg"); f.append("source", "LIVE_CAMERA");
    f.append("deviceId", `${navigator.platform || "device"}-${localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")).id.slice(0, 8) : "x"}`);
    if (gps) { f.append("latitude", gps.latitude); f.append("longitude", gps.longitude); f.append("accuracy", gps.accuracy); }
    setBusy(true);
    try {
      const { data } = await axios.post(`${api}/${jobId}/check-in`, f, { showSuccessToast: true });
      setSession(data.session); load();
    } finally { setBusy(false); }
  };

  const mergeResponse = (snapshotItemId, response) => setSession((s) => ({
    ...s,
    modules: s.modules.map((m) => ({ ...m, sections: m.sections.map((sec) => ({ ...sec, questions: sec.questions.map((q) => (q.snapshotItemId === snapshotItemId ? { ...q, response } : q)) })) })),
  }));

  if (!details) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const job = details.job;
  const submitted = questions.filter((q) => q.response?.responseStatus === "SUBMITTED").length;
  const percent = questions.length ? Math.round((submitted / questions.length) * 100) : 0;
  const elapsedMin = session ? Math.round((now - new Date(session.checkedInAt).getTime()) / 60000) : 0;

  const header = (
    <PageTitle
      crumbs={[{ label: "Audit Execution" }, { label: "New Report", to: "/auditor-dashboard/new-report" }, { label: job.location.locationName }]}
      title={`${job.location.dealerName} · ${job.location.locationName}`}
      subtitle={`${job.facilityType ? FACILITY_LABELS[job.facilityType] : "Whole site"} audit · ${TRACK_LABELS[details.job.track || "ALL"]}`}
      actions={<>{job.isDemo && <span className="whitespace-nowrap rounded-full bg-[#f1ebfd] px-3 py-1.5 text-xs font-medium text-[#6b3fc4]">Demo audit</span>}</>}
    />
  );

  if (!session) {
    return (
      <div>
        <Header />{header}
        <section className={`${cardClass} max-w-2xl`}>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} className="text-[#287a37]" />Check in at the site</h2>
          <p className="mb-4 text-sm text-gray-600">{job.location.address}. Check-in is allowed only inside the {job.location.geofenceRadiusM} m geofence, with a live photo.{job.isDemo ? " This is a demo audit, so the location and time checks are relaxed." : ""}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className={lightBtn} onClick={() => setCamera("checkin")}><Camera size={16} /> {photoPreview ? "Retake photo" : "Take check-in photo"}</button>
            <button className={lightBtn} onClick={locateMe}><MapPin size={16} /> {gps ? `Located (±${Math.round(gps.accuracy)} m)` : "Get my location"}</button>
            {photoPreview && <img src={photoPreview} alt="Check-in" className="h-14 rounded-lg border" />}
          </div>
          <div className="mt-5"><button className={darkBtn} disabled={busy || !photoPreview} onClick={checkIn}>Check in & unlock checklist</button></div>
        </section>
        {camera && <CameraCapture title="Check-in photo" stampText={gps ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : job.isDemo ? "DEMO" : ""} allowSample={job.isDemo} onClose={() => setCamera(null)} onCapture={(blob) => { checkInPhoto.current = blob; setPhotoPreview(URL.createObjectURL(blob)); setCamera(null); }} />}
      </div>
    );
  }

  const completed = session.status === "COMPLETED";
  const list = questions.filter((q) => q.discipline === activeTab);
  const bySection = list.reduce((acc, q) => { (acc[q.sectionName] ||= []).push(q); return acc; }, {});

  return (
    <div>
      <Header />{header}
      <div className={`mb-5 ${cardClass}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1"><div className="mb-1 flex justify-between text-sm gap-3"><span className="font-medium">{submitted} of {questions.length} items submitted</span><span>{percent}%</span></div><ProgressBar value={percent} /></div>
          <div className="flex items-center gap-1 text-sm text-gray-600"><Clock size={15} /> {elapsedMin} min on site</div>
          {!completed && <button className={lightBtn} onClick={() => setShowPropose(true)}><ClipboardPlus size={16} /> Propose new point</button>}
          {!completed && <button className={darkBtn} onClick={() => setShowFinish(true)}>Finish audit</button>}
        </div>
        {completed && <p className="mt-3 rounded-xl bg-[#eaf8ed] p-3 text-sm text-[#287a37]">You have submitted your part of this audit. The report is generated once every auditor on the visit has finished.</p>}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {disciplines.map((d) => {
          const qs = questions.filter((q) => q.discipline === d); const done = qs.filter((q) => q.response?.responseStatus === "SUBMITTED").length;
          return <button key={d} onClick={() => setTab(d)} className={`rounded-full px-4 py-2 text-sm ${activeTab === d ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{DISCIPLINE_LABELS[d]} <span className="opacity-70">{done}/{qs.length}</span></button>;
        })}
      </div>

      <div className="space-y-6">
        {Object.entries(bySection).map(([section, qs]) => (
          <section key={section}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{section}</h3>
            <div className="space-y-4">
              {qs.map((q) => <QuestionCard key={q.snapshotItemId} q={q} jobId={jobId} locked={completed} onSaved={mergeResponse} setCamera={setCamera} />)}
            </div>
          </section>
        ))}
      </div>

      {showFinish && <FinishModal jobId={jobId} onClose={() => setShowFinish(false)} onDone={() => { setShowFinish(false); load(); }} />}
      {showPropose && <ProposeModal jobId={jobId} disciplines={disciplines} onClose={() => setShowPropose(false)} />}
      {camera?.mode === "evidence" && (
        <CameraCapture title={camera.kind === "correction" ? "Correction photo" : "Evidence photo"} allowSample={job.isDemo} onClose={() => setCamera(null)}
          onCapture={(blob) => { camera.resolve(blob); setCamera(null); }} />
      )}
      <button className="mt-6 inline-flex min-h-10 items-center rounded-xl px-2 text-sm text-gray-600 underline hover:bg-white" onClick={() => navigate("/auditor-dashboard/new-report")}>Back to my audits</button>
    </div>
  );
}

function QuestionCard({ q, jobId, locked, onSaved, setCamera }) {
  const r = q.response;
  const [editing, setEditing] = useState(!r || r.responseStatus !== "SUBMITTED");
  const [answer, setAnswer] = useState(r?.answer || "");
  const [observation, setObservation] = useState(r?.observation || "");
  const [recommendation, setRecommendation] = useState(r?.recommendation || "");
  const [naReason, setNaReason] = useState(r?.naReason || "");
  const [measurement, setMeasurement] = useState(r?.measurementValue ?? "");
  const [closedOnSpot, setClosedOnSpot] = useState(Boolean(r?.closedOnSpot));
  const [correctionComment, setCorrectionComment] = useState(r?.correctionComment || "");
  const [photos, setPhotos] = useState([]);
  const [fixPhotos, setFixPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const isMeasure = q.responseType === "MEASUREMENT";
  const needPhotos = Math.max(1, Number(q.minimumEvidence || 0));
  const savedIssue = (r?.evidence || []).filter((e) => (e.kind || "ISSUE") === "ISSUE");
  const savedFix = (r?.evidence || []).filter((e) => e.kind === "CORRECTION");

  const measureVerdict = () => {
    if (!isMeasure || measurement === "" || Number.isNaN(Number(measurement))) return null;
    const v = Number(measurement);
    return (q.minimumValue != null && v < q.minimumValue) || (q.maximumValue != null && v > q.maximumValue) ? "NON_COMPLIANT" : "COMPLIANT";
  };
  const effective = isMeasure ? measureVerdict() || "" : answer;

  const take = (kind) => new Promise((resolve) => setCamera({ mode: "evidence", kind, resolve }));
  const addPhoto = async (kind) => {
    const blob = await take(kind);
    const item = { blob, url: URL.createObjectURL(blob) };
    if (kind === "correction") setFixPhotos((p) => [...p, item]); else setPhotos((p) => [...p, item]);
  };

  const submit = async () => {
    const f = new FormData();
    f.append("responseStatus", "SUBMITTED");
    if (isMeasure) f.append("measurementValue", measurement); else f.append("answer", effective);
    f.append("observation", observation); f.append("recommendation", recommendation); f.append("naReason", naReason);
    f.append("closedOnSpot", String(closedOnSpot)); f.append("correctionComment", correctionComment);
    photos.forEach((p, i) => f.append("evidence", p.blob, `evidence-${i}.jpg`));
    fixPhotos.forEach((p, i) => f.append("correctionEvidence", p.blob, `correction-${i}.jpg`));
    setSaving(true);
    try {
      const { data } = await axios.put(`${api}/${jobId}/session/responses/${q.snapshotItemId}`, f);
      onSaved(q.snapshotItemId, data.response); setPhotos([]); setFixPhotos([]); setEditing(false);
    } finally { setSaving(false); }
  };

  const submittedView = r?.responseStatus === "SUBMITTED" && !editing;
  const label = { COMPLIANT: "OK", NON_COMPLIANT: "Not OK", NA: "N/A" };

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)] ${submittedView ? "border-l-4 border-[#63C174]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-3xl"><span className="mr-2 text-xs font-semibold text-gray-500">{q.questionCode}</span><span className="text-sm font-medium">{q.questionText}</span></div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${SEVERITY_STYLES[q.severityOnFail] || SEVERITY_STYLES.MEDIUM}`}>{q.severityOnFail}</span>
      </div>
      {(q.expectedCondition || q.regulationRef) && <p className="mt-1 text-xs text-gray-500">{[q.expectedCondition, q.regulationRef].filter(Boolean).join(" · ")}</p>}

      {submittedView ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-3 py-1 ${r.result === "COMPLIANT" ? "bg-[#eaf8ed] text-[#287a37]" : r.result === "NA" ? "bg-[#f1f1f1]" : "bg-[#fdecec] text-[#b42318]"}`}><Check size={13} className="mr-1 inline" />{label[r.result]}{r.measurementValue != null ? ` · ${r.measurementValue} ${q.measurementUnit || ""}` : ""}{r.closedOnSpot ? " · closed on the spot" : ""}</span>
          <span className="text-xs text-gray-500">{savedIssue.length} photo(s){savedFix.length ? ` + ${savedFix.length} correction` : ""}</span>
          <div className="flex gap-1">{(r.evidence || []).slice(0, 4).map((e) => <img key={e.id} src={e.imageUrl} alt="" className="h-9 w-9 rounded border object-cover" />)}</div>
          {!locked && <button className="text-xs underline" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {isMeasure ? (
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" step="any" className={`${inputClass} !mt-0 w-40`} placeholder={`Reading (${q.measurementUnit || ""})`} value={measurement} onChange={(e) => setMeasurement(e.target.value)} />
              <span className="text-xs text-gray-500">Limit: {q.minimumValue != null ? `≥ ${q.minimumValue} ` : ""}{q.maximumValue != null ? `≤ ${q.maximumValue} ` : ""}{q.measurementUnit}</span>
              {effective && <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${effective === "COMPLIANT" ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#fdecec] text-[#b42318]"}`}>{effective === "COMPLIANT" ? "Within limit" : "Outside limit"}</span>}
            </div>
          ) : (
            <div className="flex gap-2">
              {[["COMPLIANT", "OK"], ["NON_COMPLIANT", "Not OK"], ["NA", "N/A"]].map(([v, t]) => (
                <button key={v} type="button" onClick={() => setAnswer(v)} className={`rounded-xl border px-5 py-2 text-sm ${answer === v ? (v === "NON_COMPLIANT" ? "border-[#b42318] bg-[#b42318] text-white" : "border-[#181919] bg-[#181919] text-white") : "border-[#d8dee8]"}`}>{t}</button>
              ))}
            </div>
          )}

          {effective === "NA" && <Field label="Reason for N/A *"><input className={inputClass} value={naReason} onChange={(e) => setNaReason(e.target.value)} /></Field>}

          {effective && effective !== "NA" && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-600">Photo evidence ({savedIssue.length + photos.length}/{needPhotos} required){effective === "COMPLIANT" ? " · no comment needed" : ""}</div>
              <div className="flex flex-wrap items-center gap-2">
                {savedIssue.map((e) => <img key={e.id} src={e.imageUrl} alt="" className="h-14 w-14 rounded-lg border object-cover" />)}
                {photos.map((p, i) => <img key={i} src={p.url} alt="" className="h-14 w-14 rounded-lg border-2 border-[#63C174] object-cover" />)}
                <button type="button" className={lightBtn} onClick={() => addPhoto("issue")}><Camera size={15} /> Add photo</button>
              </div>
            </div>
          )}

          {effective === "NON_COMPLIANT" && (
            <div className="space-y-3 rounded-xl bg-[#fff8f7] p-3">
              <Field label="What was found *"><textarea rows="2" className={inputClass} value={observation} onChange={(e) => setObservation(e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={closedOnSpot} onChange={(e) => setClosedOnSpot(e.target.checked)} />Corrected and closed on the spot</label>
              {!closedOnSpot ? (
                <Field label="Recommended action *"><textarea rows="2" className={inputClass} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} /></Field>
              ) : (
                <>
                  <Field label="What was corrected *"><textarea rows="2" className={inputClass} value={correctionComment} onChange={(e) => setCorrectionComment(e.target.value)} /></Field>
                  <div className="flex flex-wrap items-center gap-2">
                    {savedFix.map((e) => <img key={e.id} src={e.imageUrl} alt="" className="h-14 w-14 rounded-lg border object-cover" />)}
                    {fixPhotos.map((p, i) => <img key={i} src={p.url} alt="" className="h-14 w-14 rounded-lg border-2 border-[#63C174] object-cover" />)}
                    <button type="button" className={lightBtn} onClick={() => addPhoto("correction")}><Camera size={15} /> Correction photo *</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end"><button className={darkBtn} disabled={saving || !effective} onClick={submit}>{saving ? "Saving..." : "Submit item"}</button></div>
        </div>
      )}
    </div>
  );
}

function FinishModal({ jobId, onClose, onDone }) {
  const { confirm } = useConfirm();
  const [readiness, setReadiness] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { axios.get(`${api}/${jobId}/completion-readiness`).then(({ data }) => setReadiness(data.readiness)); }, [jobId]);

  const finish = async () => {
    if (!(await confirm({ title: "Submit your audit?", message: "Your answers become final and the checklist locks.", points: [`${readiness.summary.nonCompliant} Not OK finding(s) will be raised for the dealer`, "Your signature and declaration are stored with the audit", "The report is generated when every auditor on the visit has finished"], confirmLabel: "Submit audit", cancelLabel: "Keep checking" }))) return;
    setBusy(true);
    try { await axios.post(`${api}/${jobId}/complete`, { finalRemarks: remarks, declarationAccepted: accepted, signature }, { showSuccessToast: true }); onDone(); } finally { setBusy(false); }
  };
  return (
    <Modal title="Finish and submit audit" onClose={onClose}>
      {!readiness ? <p className="text-sm text-gray-500">Checking...</p> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 text-center">
            {[["Items", readiness.summary.total], ["Submitted", readiness.summary.submitted], ["Not OK", readiness.summary.nonCompliant], ["N/A", readiness.summary.na]].map(([l, v]) => <div key={l} className="rounded-xl bg-[#f3f5f7] p-3"><div className="text-lg font-semibold">{v}</div><div className="text-xs">{l}</div></div>)}
          </div>
          {readiness.blockers.length > 0 && <ul className="list-disc rounded-xl bg-[#fff3e0] p-3 pl-6 text-[#7a4f00]">{readiness.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          <Field label="Final remarks *"><textarea rows="2" className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />I declare that the findings recorded are true and were observed by me on site.</label>
          <SignaturePad onChange={setSignature} />
          <div className="flex justify-end gap-2"><button className={lightBtn} onClick={onClose}>Cancel</button><button className={darkBtn} disabled={busy || !readiness.ready || !remarks.trim() || !accepted || !signature} onClick={finish}>Submit audit</button></div>
        </div>
      )}
    </Modal>
  );
}

function ProposeModal({ jobId, disciplines, onClose }) {
  const { confirm } = useConfirm();
  const [form, setForm] = useState({ discipline: disciplines[0] || "INFRASTRUCTURE", sectionName: "", questionText: "", reason: "", severity: "MEDIUM" });
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!(await confirm({ title: "Send this point for review?", message: "Back-Admin and SGS will review it. It does not affect this audit's score.", points: ["If approved, a new checklist version includes it for upcoming audits", "You will not be able to change the wording after sending"], confirmLabel: "Send for review" }))) return;
    setBusy(true);
    try { await axios.post(`${domain}/client-audit-proposals`, { ...form, jobId }, { showSuccessToast: true }); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal title="Propose a new checklist point" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-gray-600">Use this when site conditions need a check that the checklist does not have. It is recorded for review and does not change this audit's score. Once approved, it applies to upcoming audits.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discipline"><select className={inputClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })}>{Object.entries(DISCIPLINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Severity if it fails"><select className={inputClass} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Section"><input className={inputClass} value={form.sectionName} onChange={(e) => setForm({ ...form, sectionName: e.target.value })} placeholder="e.g. Paint shop" /></Field>
        <Field label="New point *"><textarea rows="2" className={inputClass} value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} /></Field>
        <Field label="Why it is needed *"><textarea rows="2" className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={lightBtn} onClick={onClose}>Cancel</button><button className={darkBtn} disabled={busy || !form.questionText.trim() || !form.reason.trim()} onClick={send}>Send for review</button></div>
      </div>
    </Modal>
  );
}
