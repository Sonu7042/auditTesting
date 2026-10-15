import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Download, Eye, FileSignature } from "lucide-react";
import toast from "react-hot-toast";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { Field, Modal, PageTitle, ProgressBar, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import ReportMenu from "../common/ReportMenu";
import DocumentViewer from "../common/DocumentViewer";
import SignaturePad from "./SignaturePad";
import ReportLifecycle from "./ReportLifecycle";
import ReportClarifications from "./ReportClarifications";
import ReportCapa from "./ReportCapa";
import { SiteTrail } from "./SiteTrail";
import { networkLinks, siteShape } from "./siteTrailUtils";
import { DISCIPLINE_LABELS, FACILITY_LABELS, RATING_STYLES, SEVERITY_STYLES, fmtDateTime } from "./helpers";

const STATUS = {
  DRAFT: "Draft", UNDER_REVIEW: "In QC review", CORRECTION_REQUIRED: "Correction required", CORRECTION_SUBMITTED: "Correction submitted",
  APPROVED: "Approved", PUBLISHED: "Issued to dealer", SIGNED_OFF: "Signed off", RETURNED: "Returned",
};
const QC_PARTS = [["accuracy", "Scoring accuracy against photos", 40], ["evidence", "Evidence completeness", 25], ["timeliness", "Timely submission", 15], ["protocol", "Protocol compliance", 20]];

export default function ReportDetail({ base }) {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const admin = role === "ADMIN";
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [qc, setQc] = useState({ accuracy: 85, evidence: 85, timeliness: 90, protocol: 90, remarks: "" });
  const [signoff, setSignoff] = useState(null);
  const [viewer, setViewer] = useState(false);
  const { confirm, ask } = useConfirm();

  const load = useCallback(() => axios.get(`${domain}/client-qc/reports/${reportId}`).then(({ data }) => setD(data)), [reportId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, msg) => { setBusy(true); try { await fn(); if (msg) toast.success(msg); await load(); } finally { setBusy(false); } };
  const GATES = {
    SUBMIT: { title: "Submit this report to QC?", message: "It will be locked for the auditors while QC reviews it.", points: ["QC checks the scoring against the photo evidence", "Corrections may be raised before approval"], confirmLabel: "Submit to QC" },
    APPROVE: { title: "Approve this report?", message: "QC confirms the scoring and evidence are correct.", points: ["The report can then be issued to the dealer", "Approved audits count in rankings and the dashboard", "Raise corrections first if anything looks wrong"], confirmLabel: "Approve report" },
    PUBLISH: { title: "Issue this report to the dealer?", message: "The dealer and their managers will be able to see it.", points: ["Findings and their closure targets start counting", "The dealer can sign off after the closing debrief", "Further changes need a new revision"], confirmLabel: "Issue to dealer" },
  };
  const review = async (action) => {
    if (action === "RETURN") {
      const reason = await ask({ title: "Return this report?", tone: "danger", message: "It goes back to the lead auditor for changes.", input: { label: "What needs to change?", required: true, defaultValue: remarks }, confirmLabel: "Return report" });
      if (!reason) return;
      setRemarks(reason);
      return act(() => axios.patch(`${domain}/client-audit-reports/${reportId}/review`, { action, remarks: reason }, { showSuccessToast: false }), "Report returned").then(() => setRemarks(""));
    }
    if (!(await confirm(GATES[action]))) return;
    if (action === "SUBMIT") {
      const send = (why) => act(() => axios.patch(`${domain}/client-audit-reports/${reportId}/review`, { action, remarks: why || remarks }, { showSuccessToast: false, showErrorToast: false }), "Report submit done");
      try { return await send(); } catch (e) {
        const message = e.response?.data?.message || "";
        if (!/24 hours/.test(message)) { toast.error(message || "The report could not be submitted."); return undefined; }
        const why = await ask({ title: "Submitting after 24 hours", tone: "danger", message: "Reports are expected within 24 hours of the audit. You can still submit it, but the reason is recorded and shown to QC.", input: { label: "Reason for the delay (for example, no network)", required: true }, confirmLabel: "Submit with reason" });
        return why ? send(why) : undefined;
      }
    }
    return reviewNow(action);
  };
  const reviewNow = (action) => act(() => axios.patch(`${domain}/client-audit-reports/${reportId}/review`, { action, remarks }, { showSuccessToast: false }), `Report ${action.toLowerCase()} done`).then(() => setRemarks(""));

  if (!d) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const { report: r, scoring, anomalies, register } = d;
  const open = register.filter((n) => !["CLOSED", "VOID"].includes(n.status));
  const canSign = ["ADMIN", "AUDITOR", "SITE_USER", "SITE_INCHARGE"].includes(role) && r.status === "PUBLISHED";

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: admin ? "QC Review" : "Client Submission", to: base }, { label: r.reportNumber }]}
        title={`${r.location.dealerName} · ${r.location.locationName}`}
        subtitle={`${r.facilityType ? FACILITY_LABELS[r.facilityType] : "Whole site"} · ${r.reportNumber} · revision ${r.revision}${r.isDemo ? " · demo" : ""}`}
        actions={<><Link to={networkLinks(siteShape(r.location)).site} className={lightBtn}>Site dashboard</Link><span className="whitespace-nowrap rounded-full bg-[#f3f5f7] px-3 py-1.5 text-xs font-medium">{STATUS[r.status] || r.status}</span><ReportMenu reportId={reportId} label="Word" /><ReportMenu reportId={reportId} format="pdf" label="PDF" title="Audit report" onPreview={(v) => setViewer({ ...v, subtitle: `${r.location.dealerName} · ${r.location.locationName} · ${r.reportNumber}` })} /></>}
      />

      <ReportLifecycle reportId={reportId} refreshKey={r.status + r.revision + register.length + open.length} />
      <ReportClarifications reportId={reportId} status={r.status} onChanged={load} />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={cardClass}><div className="text-xs text-gray-500">Audit score</div><div className="text-3xl font-semibold">{scoring.percent ?? "—"}{scoring.percent !== null && "%"}</div><div className="text-xs text-gray-500">{scoring.riskLevel}</div></div>
        <div className={cardClass}><div className="text-xs text-gray-500">Rating</div>{scoring.rating ? <span className={`mt-1 inline-block rounded-xl px-4 py-1 text-2xl font-semibold ${RATING_STYLES[scoring.rating]}`}>{scoring.rating}</span> : "—"}{scoring.counts.severity.CRITICAL > 0 && <div className="mt-1 text-xs text-[#b42318]">Capped by a Critical finding</div>}</div>
        <div className={cardClass}><div className="text-xs text-gray-500">Findings</div><div className="text-3xl font-semibold">{scoring.counts.nonCompliant}</div><div className="text-xs text-gray-500">{open.length} open · {scoring.counts.closedOnSpot} closed on the spot</div></div>
        <div className={cardClass}><div className="text-xs text-gray-500">Auditor QC score</div><div className="text-3xl font-semibold">{r.qcScore ?? "—"}{r.qcScore != null && "%"}</div><div className="text-xs text-gray-500">{r.auditors.map((a) => a.fullName).join(", ")}</div></div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={cardClass}>
            <h2 className="mb-4 text-lg font-semibold">Score by audit type</h2>
            <div className="space-y-3">
              {Object.entries(scoring.disciplines).map(([k, v]) => (
                <div key={k}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{DISCIPLINE_LABELS[k]} <span className="text-xs text-gray-500">({v.total} items · {v.nonCompliant} findings)</span></span><span className="font-medium">{v.percent ?? "—"}{v.percent !== null && "%"}</span></div><ProgressBar value={v.percent || 0} /></div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">Each audit type is reported separately; this page combines them for the facility. Checklist version {r.job.checklistVersion}.</p>
          </section>

          {admin && (
            <section className={cardClass}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><AlertTriangle size={18} className="text-[#9a5200]" />Anomaly flags</h2>
              {anomalies.length === 0 ? <p className="text-sm text-gray-500">No anomalies detected.</p> : (
                <ul className="space-y-2">{anomalies.map((a, i) => <li key={i} className="flex items-start gap-3 rounded-xl bg-[#fff8f0] p-3 text-sm"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${SEVERITY_STYLES[a.severity === "HIGH" ? "HIGH" : a.severity === "MEDIUM" ? "MEDIUM" : "LOW"]}`}>{a.code.replaceAll("_", " ")}</span>{a.message}</li>)}</ul>
              )}
            </section>
          )}

          <ReportCapa register={register} reportStatus={r.status} onChanged={load} />
        </div>

        <aside className="space-y-6">
          {admin && ["DRAFT", "UNDER_REVIEW", "APPROVED", "RETURNED"].includes(r.status) && (
            <section className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold">QC actions</h3>
              <textarea rows="2" className={inputClass} placeholder="Remarks (required to return)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <div className="mt-3 flex flex-wrap gap-2">
                {["DRAFT", "RETURNED"].includes(r.status) && <button className={darkBtn} disabled={busy} onClick={() => review("SUBMIT")}>Submit to QC</button>}
                {r.status === "UNDER_REVIEW" && <><button className={darkBtn} disabled={busy} onClick={() => review("APPROVE")}>Approve</button><button className={lightBtn} disabled={busy} onClick={() => review("RETURN")}>Return</button></>}
                {r.status === "APPROVED" && <button className={darkBtn} disabled={busy} onClick={() => review("PUBLISH")}>Issue to dealer</button>}
              </div>
            </section>
          )}

          {admin && (
            <section className={cardClass}>
              <h3 className="mb-1 text-sm font-semibold">Score the auditors</h3>
              <p className="mb-3 text-xs text-gray-500">Feeds each auditor's running performance score{r.isDemo ? " (demo audits are not counted)" : ""}.</p>
              {QC_PARTS.map(([k, label, w]) => (
                <div key={k} className="mb-3"><div className="flex justify-between text-xs gap-3"><span>{label} <span className="text-gray-500">({w}%)</span></span><b>{qc[k]}</b></div><input type="range" min="0" max="100" className="w-full" value={qc[k]} onChange={(e) => setQc({ ...qc, [k]: Number(e.target.value) })} /></div>
              ))}
              <button className={darkBtn} disabled={busy} onClick={async () => { if (await confirm({ title: "Save the QC score?", message: `The auditors are scored ${Math.round(qc.accuracy * 0.4 + qc.evidence * 0.25 + qc.timeliness * 0.15 + qc.protocol * 0.2)}% for this audit.`, points: r.isDemo ? ["Demo audit: not added to performance"] : ["It joins each auditor's running performance score", "Below 80% means retraining; below 60% they cannot be planned"], confirmLabel: "Save score" })) act(() => axios.post(`${domain}/client-qc/reports/${reportId}/score`, qc, { showSuccessToast: true })); }}>Save QC score</button>
            </section>
          )}

          <section className={cardClass}>
            <h3 className="mb-3 text-sm font-semibold">Dealer sign-off</h3>
            {r.status === "SIGNED_OFF" ? (
              <div className="text-sm"><b>{r.signedByName}</b>, {r.signedByDesignation}<div className="text-xs text-gray-500">{fmtDateTime(r.signedAt)}</div>{r.debriefNotes && <p className="mt-2 rounded-xl bg-[#f3f5f7] p-2 text-xs">{r.debriefNotes}</p>}</div>
            ) : canSign ? (
              <button className={darkBtn} onClick={() => setSignoff({ name: "", designation: "", debriefNotes: "", signature: "" })}><FileSignature size={16} /> Record sign-off</button>
            ) : <p className="text-xs text-gray-500">Available once the report is issued to the dealer. The senior dealer representative signs after the closing debrief.</p>}
            {admin && ["PUBLISHED", "SIGNED_OFF"].includes(r.status) && <button className={`${lightBtn} mt-3`} onClick={async () => { const reason = await ask({ title: "Open a revision?", tone: "danger", message: "The issued report goes back into QC and any dealer sign-off is cleared.", input: { label: "Reason for the revision", required: true }, confirmLabel: "Open revision" }); if (reason) act(() => axios.post(`${domain}/client-qc/reports/${reportId}/revise`, { reason }, { showSuccessToast: true })); }}>Open a revision</button>}
          </section>

          {admin && (
            <section className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold">History</h3>
              <ul className="space-y-2 text-xs">{(r.history || []).map((h, i) => <li key={i} className="border-l-2 border-[#d8dee8] pl-3"><div className="font-medium">{h.action.replaceAll("_", " ")}</div><div className="text-gray-500">{fmtDateTime(h.createdAt)}{h.remarks ? ` · ${h.remarks}` : ""}</div></li>)}</ul>
            </section>
          )}
        </aside>
      </div>

      {signoff && (
        <Modal title="Dealer sign-off" onClose={() => setSignoff(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">To be signed by the senior-most dealer representative after the closing debrief with the Dealer Principal or GM.</p>
            <div className="grid grid-cols-2 gap-3"><Field label="Name *"><input className={inputClass} value={signoff.name} onChange={(e) => setSignoff({ ...signoff, name: e.target.value })} /></Field><Field label="Designation *"><input className={inputClass} value={signoff.designation} onChange={(e) => setSignoff({ ...signoff, designation: e.target.value })} /></Field></div>
            <Field label="Debrief notes"><textarea rows="2" className={inputClass} value={signoff.debriefNotes} onChange={(e) => setSignoff({ ...signoff, debriefNotes: e.target.value })} /></Field>
            <SignaturePad onChange={(v) => setSignoff((s) => ({ ...s, signature: v }))} />
            <div className="flex justify-end gap-2"><button className={lightBtn} onClick={() => setSignoff(null)}>Cancel</button><button className={darkBtn} disabled={busy || !signoff.name || !signoff.designation || !signoff.signature} onClick={async () => { if (!(await confirm({ title: "Record this sign-off?", message: `${signoff.name}, ${signoff.designation} confirms the report was reviewed.`, points: ["The report is marked signed off", "The signature and time are stored with the report", "Changing it later needs a revision"], confirmLabel: "Record sign-off" }))) return; await act(() => axios.post(`${domain}/client-qc/reports/${reportId}/signoff`, signoff, { showSuccessToast: true })); setSignoff(null); }}>Record sign-off</button></div>
          </div>
        </Modal>
      )}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(false)} />}
      <button className="mt-6 inline-flex min-h-10 items-center rounded-xl px-2 text-sm text-gray-600 underline hover:bg-white" onClick={() => navigate(base)}>Back</button>
    </div>
  );
}
