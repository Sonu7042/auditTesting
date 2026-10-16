import { useState } from "react";
import axios from "axios";
import { Camera } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import domain from "../../api/domain";
import { Field, Skeleton, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { SEVERITY_STYLES, fmtDate } from "./helpers";

const DEALER = ["SITE_USER", "SITE_INCHARGE", "REGIONAL_MANAGER", "ZONAL_MANAGER", "CORPORATE_MANAGER"];
const OPEN_FOR_CAPA = ["OPEN", "REJECTED", "MORE_EVIDENCE_REQUIRED"];
const emptyCapa = { rootCause: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", targetDate: "" };

// The findings of this report and their CAPA, in the report itself: the dealer submits the corrective and preventive action
// with evidence, the lead auditor verifies and closes it, and Back-Admin can close it with a recorded justification.
export default function ReportCapa({ register, reportStatus, onChanged }) {
  const role = localStorage.getItem("role"); const { confirm, ask } = useConfirm();
  const [openId, setOpenId] = useState(null); const [detail, setDetail] = useState(null);
  const [capa, setCapa] = useState(emptyCapa); const [files, setFiles] = useState([]); const [busy, setBusy] = useState(false);
  const issued = ["PUBLISHED", "SIGNED_OFF"].includes(reportStatus);

  const open = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setDetail(null); setCapa(emptyCapa); setFiles([]);
    const { data } = await axios.get(`${domain}/client-audit-ncs/${id}`); setDetail(data.record);
  };
  const refresh = async (id) => { const { data } = await axios.get(`${domain}/client-audit-ncs/${id}`); setDetail(data.record); onChanged?.(); };

  const submit = async () => {
    if (!(await confirm({ title: "Submit this corrective action plan?", message: "It goes to the lead auditor for verification.", points: ["You cannot edit it while it is being reviewed", "The auditor may close the finding, reject it, or ask for more evidence"], confirmLabel: "Submit CAPA" }))) return;
    const form = new FormData(); Object.entries(capa).forEach(([k, v]) => form.append(k, v)); files.forEach((f) => form.append("evidence", f));
    setBusy(true); try { await axios.post(`${domain}/client-audit-ncs/${detail.id}/capa`, form, { showSuccessToast: true }); await refresh(detail.id); } finally { setBusy(false); }
  };
  const review = async (action) => {
    const remarks = action === "CLOSE" ? "CAPA verified and accepted." : await ask({ title: action === "REJECT" ? "Reject this CAPA?" : "Ask for more evidence?", tone: "danger", input: { label: "What is needed?", required: true }, confirmLabel: "Send" });
    if (!remarks) return;
    setBusy(true); try { await axios.patch(`${domain}/client-audit-ncs/${detail.id}/review`, { action, remarks }, { showSuccessToast: true }); await refresh(detail.id); } finally { setBusy(false); }
  };
  const override = async () => {
    const justification = await ask({ title: "Close with an administrative override?", tone: "danger", message: "Use only when the finding is resolved but the normal CAPA route cannot be followed. The justification is recorded.", input: { label: "Justification", required: true }, confirmLabel: "Close finding" });
    if (!justification) return;
    setBusy(true); try { await axios.patch(`${domain}/client-audit-ncs/${detail.id}/admin-override-close`, { justification }, { showSuccessToast: true }); await refresh(detail.id); } finally { setBusy(false); }
  };

  const open_ = register.filter((n) => !["CLOSED", "VOID"].includes(n.status)).length;
  return (
    <section className={cardClass} id="capa">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Findings and CAPA</h2><span className="text-xs text-gray-500">{register.length ? `${register.length - open_} of ${register.length} closed` : ""}</span></div>
      {register.length === 0 ? <p className="text-sm text-gray-500">No findings were raised.</p> : (
        <ul className="divide-y divide-[#eef0f3]">{register.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => open(n.id)} className="grid w-full grid-cols-[1fr_auto] items-start gap-3 py-3 text-left hover:bg-[#f7f8fa]">
              <span className="min-w-0"><span className="block text-xs text-gray-500">{n.ncNumber} · {n.questionCode}</span><span className="block text-sm">{n.question}</span><span className="block text-xs text-gray-500">{n.observation}</span></span>
              <span className="flex flex-col items-end gap-1 text-xs"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 ${SEVERITY_STYLES[n.severity]}`}>{n.risk}</span><span>{n.mahindraPriority} · due {fmtDate(n.dueAt)}</span><span className="font-medium">{n.status.replaceAll("_", " ")}</span></span>
            </button>
            {openId === n.id && (
              <div className="mb-3 rounded-2xl bg-[#f7f8fa] p-4 text-sm">
                {!detail ? <div className="space-y-2 py-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-16 w-full" /></div> : (<>
                  {detail.recommendation && <p className="mb-2"><b>Auditor's recommendation:</b> {detail.recommendation}</p>}
                  {detail.rootCause && <dl className="mb-3 grid gap-2 md:grid-cols-2">{[["Root cause", detail.rootCause], ["Corrective action", detail.correctiveAction], ["Preventive action", detail.preventiveAction], ["Responsible", `${detail.responsiblePerson} · by ${fmtDate(detail.targetDate)}`]].map(([k, v]) => <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd>{v}</dd></div>)}</dl>}
                  {detail.auditorRemarks && <p className="mb-3 rounded-xl bg-white p-3 text-xs"><b>Auditor / Back-Admin:</b> {detail.auditorRemarks}</p>}
                  {(detail.evidence || []).length > 0 && <div className="mb-3 flex flex-wrap gap-2">{detail.evidence.map((e) => <img key={e.id} src={e.imageUrl} alt="CAPA evidence" className="h-20 rounded-lg border border-[#e1e5ea]" />)}</div>}
                  {DEALER.includes(role) && issued && OPEN_FOR_CAPA.includes(detail.status) && (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Root cause *"><textarea className={inputClass} rows={2} value={capa.rootCause} onChange={(e) => setCapa({ ...capa, rootCause: e.target.value })} /></Field>
                        <Field label="Corrective action *"><textarea className={inputClass} rows={2} value={capa.correctiveAction} onChange={(e) => setCapa({ ...capa, correctiveAction: e.target.value })} /></Field>
                        <Field label="Preventive action *"><textarea className={inputClass} rows={2} value={capa.preventiveAction} onChange={(e) => setCapa({ ...capa, preventiveAction: e.target.value })} /></Field>
                        <div className="grid gap-3"><Field label="Responsible person *"><input className={inputClass} value={capa.responsiblePerson} onChange={(e) => setCapa({ ...capa, responsiblePerson: e.target.value })} /></Field><Field label="Target date *"><input type="date" className={inputClass} value={capa.targetDate} onChange={(e) => setCapa({ ...capa, targetDate: e.target.value })} /></Field></div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3"><label className={`${lightBtn} cursor-pointer`}><Camera size={16} /> {files.length ? `${files.length} photo(s)` : "Add closure photo"}<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles([...e.target.files])} /></label><button className={darkBtn} disabled={busy || Object.values(capa).some((v) => !v)} onClick={submit}>{busy ? "Submitting..." : "Submit CAPA"}</button></div>
                    </div>
                  )}
                  {role === "AUDITOR" && detail.status === "CAPA_SUBMITTED" && <div className="flex flex-wrap gap-2"><button className={darkBtn} disabled={busy} onClick={() => review("CLOSE")}>Verify and close</button><button className={lightBtn} disabled={busy} onClick={() => review("MORE_EVIDENCE")}>Ask for more evidence</button><button className={lightBtn} disabled={busy} onClick={() => review("REJECT")}>Reject</button></div>}
                  {role === "ADMIN" && !["CLOSED", "VOID"].includes(detail.status) && <button className={`${lightBtn} mt-2`} disabled={busy} onClick={override}>Close with admin override</button>}
                  {!DEALER.includes(role) && role !== "ADMIN" && role !== "AUDITOR" ? null : (detail.status === "CLOSED" ? <p className="text-xs text-[#287a37]">Closed {detail.closedAt ? fmtDate(detail.closedAt) : ""}.</p> : null)}
                </>)}
              </div>
            )}
          </li>))}</ul>
      )}
    </section>
  );
}
