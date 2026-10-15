import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";

const emptyCorrection = { snapshotItemId: "", category: "", priority: "MEDIUM", instruction: "", dueDate: "" };
const emptyResolution = { resolution: "", correctedResult: "", correctedObservation: "", correctedMeasurementValue: "", correctedNaReason: "" };
const categoryOptions = [
  ["INCORRECT_RESPONSE", "Incorrect response"], ["INSUFFICIENT_EVIDENCE", "Insufficient evidence"],
  ["EVIDENCE_QUALITY", "Blurred / wrong evidence"], ["SCORING_MISMATCH", "Scoring mismatch"],
  ["MISSING_OBSERVATION", "Missing observation"], ["RISK_CLASSIFICATION", "Wrong risk classification"],
  ["MEASUREMENT_VERIFICATION", "Measurement verification"], ["REPORT_DETAIL", "Report-level detail"],
];

export default function ClientAuditReports() {
  const role = localStorage.getItem("role");
  const admin = role === "ADMIN";
  const auditor = role === "AUDITOR";
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [correction, setCorrection] = useState(emptyCorrection);
  const [resolution, setResolution] = useState(emptyResolution);
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axios.get(`${domain}/client-audit-reports`);
    setReports(data.reports || []);
    if (selected) setSelected((data.reports || []).find((item) => item.id === selected.id) || null);
  }, [selected]);

  useEffect(() => {
    let active = true;
    axios.get(`${domain}/client-audit-reports`).then(({ data }) => active && setReports(data.reports || []));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = old; window.removeEventListener("keydown", close); };
  }, [selected]);

  const stats = useMemo(() => ({
    total: reports.length,
    draft: reports.filter((item) => item.status === "DRAFT").length,
    qc: reports.filter((item) => ["UNDER_REVIEW", "CORRECTION_SUBMITTED"].includes(item.status)).length,
    correction: reports.filter((item) => item.status === "CORRECTION_REQUIRED").length,
    published: reports.filter((item) => item.status === "PUBLISHED").length,
  }), [reports]);

  const run = async (request) => {
    if (busy) return;
    setBusy(true);
    try { await request(); await load(); } finally { setBusy(false); }
  };
  const reportAction = (report, action) => run(() => axios.patch(`${domain}/client-audit-reports/${report.id}/review`, { action, remarks }, { showSuccessToast: true }));
  const createCorrection = () => run(async () => {
    await axios.post(`${domain}/client-audit-reports/${selected.id}/corrections`, correction, { showSuccessToast: true });
    setCorrection(emptyCorrection); setRemarks("");
  });
  const submitCorrection = (item) => run(async () => {
    const form = new FormData();
    Object.entries(resolution).forEach(([key, value]) => value !== "" && form.append(key, value));
    files.forEach((file) => form.append("evidence", file));
    await axios.patch(`${domain}/client-audit-reports/corrections/${item.id}/submit`, form, { headers: { "Content-Type": "multipart/form-data" }, showSuccessToast: true });
    setResolution(emptyResolution); setFiles([]);
  });
  const reviewCorrection = (item, action) => run(async () => {
    await axios.patch(`${domain}/client-audit-reports/corrections/${item.id}/review`, { action, remarks }, { showSuccessToast: true });
    setRemarks("");
  });
  const downloadPdf = async (report) => {
    const response = await axios.get(`${domain}/client-audit-reports/${report.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data); const link = document.createElement("a");
    link.href = url; link.download = `${report.reportNumber}.pdf`; link.click(); URL.revokeObjectURL(url);
  };

  return <div>
    <Header />
    <div className="mb-5 rounded-3xl bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Client Audit Reports</h1>
      <p className="text-sm text-gray-500">Controlled QC corrections, report revisions, approval and publication.</p>
    </div>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
      {Object.entries(stats).map(([key, value]) => <div key={key} className="rounded-2xl bg-white p-4 shadow"><b className="text-2xl">{value}</b><div className="text-xs uppercase text-gray-500">{key}</div></div>)}
    </div>
    <div className="space-y-3">
      {reports.map((report) => <button key={report.id} onClick={() => setSelected(report)} className="w-full rounded-2xl border bg-white p-4 text-left hover:border-blue-300">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><b>{report.reportNumber}</b><div className="text-sm text-gray-500">{report.job.location.dealerName} - {report.job.location.locationName} · Revision {report.revision}</div></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">{report.status}</span></div>
        <div className="mt-2 text-xs text-gray-500">{report.corrections?.length || 0} correction point(s) · Click to open</div>
      </button>)}
      {!reports.length && <div className="rounded-2xl bg-white p-8 text-center text-gray-500">No reports are available for this account.</div>}
    </div>
    {selected && createPortal(<div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <div role="dialog" aria-modal="true" className="my-auto max-h-[calc(100dvh-24px)] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-48px)] sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><h2 className="font-bold">{selected.reportNumber}</h2><p className="text-xs text-gray-500">{selected.status} · Revision {selected.revision}</p></div><button onClick={() => setSelected(null)} className="h-10 w-10 rounded-full border text-xl">×</button></div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadPdf(selected)} className="rounded-xl border px-4 py-2">Download PDF</button>
            {(admin || auditor) && ["DRAFT", "RETURNED"].includes(selected.status) && <button disabled={busy} onClick={() => reportAction(selected, "SUBMIT")} className="rounded-xl bg-blue-700 px-4 py-2 text-white disabled:opacity-50">Submit for QC</button>}
            {admin && selected.status === "UNDER_REVIEW" && selected.corrections.every((item) => item.status === "ACCEPTED") && <button disabled={busy} onClick={() => reportAction(selected, "APPROVE")} className="rounded-xl bg-green-700 px-4 py-2 text-white disabled:opacity-50">Approve Report</button>}
            {admin && selected.status === "APPROVED" && <button disabled={busy} onClick={() => reportAction(selected, "PUBLISH")} className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50">Publish Report</button>}
          </div>

          {admin && ["UNDER_REVIEW", "CORRECTION_REQUIRED"].includes(selected.status) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">Raise QC correction</h3><div className="mt-3 grid gap-3 md:grid-cols-2">
            <select className="rounded-xl border bg-white p-2.5" value={correction.snapshotItemId} onChange={(event) => setCorrection((old) => ({ ...old, snapshotItemId: event.target.value }))}><option value="">Report-level correction</option>{selected.job.snapshot.items.map((item) => <option key={item.id} value={item.id}>{item.questionCode} - {item.itemData.questionText}</option>)}</select>
            <select className="rounded-xl border bg-white p-2.5" value={correction.category} onChange={(event) => setCorrection((old) => ({ ...old, category: event.target.value }))}><option value="">Select category</option>{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select className="rounded-xl border bg-white p-2.5" value={correction.priority} onChange={(event) => setCorrection((old) => ({ ...old, priority: event.target.value }))}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}</select>
            <input type="date" className="rounded-xl border bg-white p-2.5" value={correction.dueDate} onChange={(event) => setCorrection((old) => ({ ...old, dueDate: event.target.value }))} />
          </div><textarea rows="3" className="mt-3 w-full rounded-xl border bg-white p-3" placeholder="Explain exactly what the auditor must correct" value={correction.instruction} onChange={(event) => setCorrection((old) => ({ ...old, instruction: event.target.value }))} /><button disabled={busy || !correction.category || !correction.instruction.trim()} onClick={createCorrection} className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-white disabled:opacity-40">Send Correction to Lead Auditor</button></section>}

          <section><h3 className="mb-3 font-semibold">Correction register</h3><div className="space-y-3">
            {(selected.corrections || []).map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><b>{item.snapshotItem?.questionCode || "REPORT"} · {item.category.replaceAll("_", " ")}</b><p className="text-xs text-gray-500">Priority {item.priority}{item.dueDate ? ` · Due ${new Date(item.dueDate).toLocaleDateString("en-IN")}` : ""}</p></div><span className="h-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">{item.status}</span></div><p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><b>QC instruction:</b> {item.instruction}</p>
              {item.resolution && <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm"><b>Auditor resolution:</b> {item.resolution}{item.correctedResult && <div>Corrected result: {item.correctedResult}</div>}{item.correctedObservation && <div>Corrected observation: {item.correctedObservation}</div>}</div>}
              {item.reviewRemarks && <p className="mt-2 text-sm"><b>QC review:</b> {item.reviewRemarks}</p>}
              {!!item.evidence?.length && <div className="mt-3 flex flex-wrap gap-2">{item.evidence.map((file) => <a key={file.id} href={file.imageUrl} target="_blank" rel="noreferrer"><img src={file.imageUrl} alt={file.imageName || "Correction evidence"} className="h-20 w-20 rounded-xl border object-cover" /></a>)}</div>}
              {auditor && ["OPEN", "REOPENED"].includes(item.status) && <div className="mt-4 rounded-2xl bg-gray-50 p-4"><textarea rows="3" className="w-full rounded-xl border bg-white p-3" placeholder="Correction/clarification completed" value={resolution.resolution} onChange={(event) => setResolution((old) => ({ ...old, resolution: event.target.value }))} /><div className="mt-3 grid gap-3 md:grid-cols-2"><select className="rounded-xl border bg-white p-2.5" value={resolution.correctedResult} onChange={(event) => setResolution((old) => ({ ...old, correctedResult: event.target.value }))}><option value="">Keep original result</option><option>COMPLIANT</option><option>NON_COMPLIANT</option><option>NA</option></select><input type="number" step="any" className="rounded-xl border bg-white p-2.5" placeholder="Corrected measurement (optional)" value={resolution.correctedMeasurementValue} onChange={(event) => setResolution((old) => ({ ...old, correctedMeasurementValue: event.target.value }))} /></div><textarea rows="2" className="mt-3 w-full rounded-xl border bg-white p-3" placeholder="Corrected observation (optional)" value={resolution.correctedObservation} onChange={(event) => setResolution((old) => ({ ...old, correctedObservation: event.target.value }))} /><input className="mt-3 w-full rounded-xl border bg-white p-2.5" placeholder="N/A reason, if applicable" value={resolution.correctedNaReason} onChange={(event) => setResolution((old) => ({ ...old, correctedNaReason: event.target.value }))} /><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-3 block max-w-full text-sm" onChange={(event) => setFiles([...event.target.files])} /><button disabled={busy || !resolution.resolution.trim()} onClick={() => submitCorrection(item)} className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-white disabled:opacity-40">Submit Correction to QC</button></div>}
              {admin && item.status === "SUBMITTED" && <div className="mt-4"><textarea rows="2" className="w-full rounded-xl border p-3" placeholder="QC remarks (mandatory when reopening)" value={remarks} onChange={(event) => setRemarks(event.target.value)} /><div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => reviewCorrection(item, "ACCEPT")} className="rounded-xl bg-green-700 px-4 py-2 text-white disabled:opacity-50">Accept Correction</button><button disabled={busy || !remarks.trim()} onClick={() => reviewCorrection(item, "REOPEN")} className="rounded-xl bg-red-600 px-4 py-2 text-white disabled:opacity-40">Reopen</button></div></div>}
            </div>)}
            {!selected.corrections?.length && <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No QC corrections have been raised.</div>}
          </div></section>

          {!!selected.history?.length && <details className="rounded-2xl border p-4"><summary className="cursor-pointer font-semibold">Report audit trail</summary><div className="mt-3 space-y-2">{selected.history.map((item) => <div key={item.id} className="border-l-2 pl-3 text-sm"><b>{item.action}</b> · {item.fromStatus || "NEW"} → {item.toStatus}<div className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString("en-IN")}{item.remarks ? ` · ${item.remarks}` : ""}</div></div>)}</div></details>}
        </div>
      </div>
    </div>, document.body)}
  </div>;
}
