import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { HelpCircle, Pencil } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import domain from "../../api/domain";
import { Modal, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";

const STATUS = { OPEN: ["Waiting for an answer", "bg-[#fff6e8] text-[#9a5200]"], ANSWERED: ["Answered", "bg-[#e8f1fd] text-[#1e61ad]"], ACCEPTED: ["Change accepted: being made", "bg-[#f1ebfd] text-[#6b3fc4]"], ACTIONED: ["Change made", "bg-[#eaf8ed] text-[#287a37]"], CLOSED: ["Closed", "bg-[#f1f1f1] text-[#555]"] };
const CLIENT = ["SITE_USER", "SITE_INCHARGE", "REGIONAL_MANAGER", "ZONAL_MANAGER", "CORPORATE_MANAGER"];
const when = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// The dealer's questions and change requests on an issued report, and the answers. An accepted change opens a new revision
// of the report; sign-off waits until everything is dealt with.
export default function ReportClarifications({ reportId, status, onChanged }) {
  const role = localStorage.getItem("role"); const admin = role === "ADMIN";
  const { ask } = useConfirm();
  const [rows, setRows] = useState(null); const [form, setForm] = useState(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => axios.get(`${domain}/client-qc/reports/${reportId}/clarifications`).then(({ data }) => setRows(data.clarifications)), [reportId]);
  useEffect(() => { load(); }, [load]);
  const after = async () => { await load(); onChanged?.(); };

  const send = async () => { setBusy(true); try { await axios.post(`${domain}/client-qc/reports/${reportId}/clarifications`, form, { showSuccessToast: true }); setForm(null); await after(); } finally { setBusy(false); } };
  const respond = async (row, action) => {
    const copy = { ANSWER: ["Answer this question", "Your answer"], ACCEPT_CHANGE: ["Accept this change?", "What will be changed (the dealer sees this)"], DECLINE: ["Decline this request", "Reason for declining"] }[action];
    const text = await ask({ title: copy[0], message: action === "ACCEPT_CHANGE" ? "A new revision of the report opens for QC. The change is marked done when the revision is issued again." : undefined, tone: action === "DECLINE" ? "danger" : "primary", input: { label: copy[1], required: true }, confirmLabel: action === "ACCEPT_CHANGE" ? "Accept and open revision" : "Send" });
    if (!text) return;
    await axios.post(`${domain}/client-qc/clarifications/${row.id}/respond`, { action, response: text }, { showSuccessToast: true }); await after();
  };
  const close = async (row) => { await axios.post(`${domain}/client-qc/clarifications/${row.id}/close`, {}, { showSuccessToast: true }); await after(); };

  if (rows === null) return null;
  const canRaise = CLIENT.includes(role) && status === "PUBLISHED";
  if (!rows.length && !canRaise) return null;
  const mine = (r) => r.raisedBy?.id === JSON.parse(localStorage.getItem("user") || "{}").id;

  return (
    <section className={`${cardClass} mb-6`} id="clarifications">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Clarifications & change requests</h2><p className="mt-1 max-w-2xl text-sm text-gray-500">After the report is issued, the dealer can ask a question or request a change. Sign-off waits until every request is dealt with.</p></div>
        {canRaise && <div className="flex gap-2"><button className={lightBtn} onClick={() => setForm({ kind: "CLARIFICATION", message: "" })}><HelpCircle size={16} /> Ask a question</button><button className={darkBtn} onClick={() => setForm({ kind: "CHANGE", message: "" })}><Pencil size={16} /> Request a change</button></div>}
      </div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">Nothing raised yet.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-[#e1e5ea] p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs ${r.kind === "CHANGE" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#e8f1fd] text-[#1e61ad]"}`}>{r.kind === "CHANGE" ? "Change request" : "Question"}</span><span className="text-xs text-gray-500">{r.raisedBy?.fullName} · {when(r.createdAt)} · on revision {r.revisionRaised}</span></span><span className={`rounded-full px-3 py-1 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></div>
            <p className="mt-2">{r.message}</p>
            {r.response && <p className="mt-2 rounded-xl bg-[#f3f5f7] p-3 text-gray-700"><b>{r.respondedBy?.fullName}</b> · {when(r.respondedAt)}<br />{r.response}{r.resolvedInRevision ? <span className="mt-1 block text-xs text-gray-500">Handled in revision {r.resolvedInRevision}.</span> : null}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status === "OPEN" && (admin || role === "AUDITOR") && <button className={darkBtn} onClick={() => respond(r, "ANSWER")}>Answer</button>}
              {r.status === "OPEN" && admin && r.kind === "CHANGE" && <button className={darkBtn} onClick={() => respond(r, "ACCEPT_CHANGE")}>Accept change</button>}
              {r.status === "OPEN" && (admin || role === "AUDITOR") && <button className={lightBtn} onClick={() => respond(r, "DECLINE")}>Decline</button>}
              {["ANSWERED", "ACTIONED"].includes(r.status) && (admin || mine(r)) && <button className={lightBtn} onClick={() => close(r)}>{r.status === "ACTIONED" ? "Confirm the change is done" : "Close"}</button>}
            </div>
          </li>))}</ul>
      )}
      {form && (
        <Modal title={form.kind === "CHANGE" ? "Request a change to the report" : "Ask a question about the report"} onClose={() => setForm(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-gray-600">{form.kind === "CHANGE" ? "Describe what should change and why. If Back-Admin accepts, a new revision is prepared and issued to you again." : "Ask about a finding, a score or anything in the report. Back-Admin or the lead auditor will answer."}</p>
            <textarea className={inputClass} rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder={form.kind === "CHANGE" ? "For example: the Workshop fire extinguisher finding was already replaced on the audit day." : "Your question"} />
            <div className="flex justify-end gap-2"><button className={lightBtn} onClick={() => setForm(null)}>Cancel</button><button className={darkBtn} disabled={busy || form.message.trim().length < 5} onClick={send}>{busy ? "Sending..." : "Send"}</button></div>
          </div>
        </Modal>
      )}
    </section>
  );
}
