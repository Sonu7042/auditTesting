import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import domain from "../../api/domain";
import { darkBtn, inputClass } from "../siteOnboarding/ui";

import { STATUS_LABEL, STATUS_STYLE } from "./ticketMeta";
const when = (v) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// One support ticket as a conversation. Back-Admin can add internal notes and change the status.
export default function TicketThread({ ticketId, admin = false, onChanged }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => axios.get(`${domain}/help/tickets/${ticketId}`).then(({ data: d }) => setData(d)), [ticketId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="text-sm text-gray-500">Loading...</p>;
  const t = data.ticket;
  const send = async () => {
    setBusy(true);
    try { await axios.post(`${domain}/help/tickets/${ticketId}/messages`, { body: text, internal }, { showSuccessToast: false }); setText(""); setInternal(false); await load(); onChanged?.(); } finally { setBusy(false); }
  };
  const setStatus = async (status) => { await axios.patch(`${domain}/help/tickets/${ticketId}`, { status }); toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`); await load(); onChanged?.(); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">{t.ticketNumber}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
        <span className="rounded-full bg-[#f3f5f7] px-2.5 py-0.5 text-xs">{t.category.toLowerCase()}</span>
        {t.priority !== "NORMAL" && <span className="rounded-full bg-[#fdecec] px-2.5 py-0.5 text-xs text-[#b42318]">{t.priority.toLowerCase()}</span>}
        {admin && t.requester && <span className="text-xs text-gray-500">from {t.requester.fullName} ({t.requester.role.replaceAll("_", " ").toLowerCase()})</span>}
      </div>
      <h3 className="text-lg font-semibold">{t.subject}</h3>
      <ul className="mt-4 space-y-3">
        {data.messages.map((m) => (
          <li key={m.id} className={`rounded-2xl p-3.5 text-sm ${m.internal ? "border border-dashed border-[#e8c547] bg-[#fff8ec]" : m.fromStaff ? "bg-[#eaf8ed]" : "bg-[#f3f5f7]"}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><b className="text-[#181919]">{m.author}{m.fromStaff ? " · support" : ""}{m.internal ? " · internal note" : ""}</b><span>{when(m.createdAt)}</span></div>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
      {t.status !== "CLOSED" && (
        <div className="mt-4 space-y-2">
          <textarea className={`${inputClass} min-h-24`} placeholder={admin ? "Reply to the user, or add an internal note" : "Write a reply"} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {admin ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (the user does not see it)</label> : <span />}
            <button type="button" className={darkBtn} disabled={busy || text.trim().length < 2} onClick={send}>{internal ? "Add note" : "Send reply"}</button>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {admin && ["IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"].filter((s) => s !== t.status).map((s) => <button key={s} type="button" className="min-h-9 rounded-xl border border-[#d8dee8] px-3 text-xs font-medium hover:bg-[#f3f5f7]" onClick={() => setStatus(s)}>Mark {STATUS_LABEL[s].toLowerCase()}</button>)}
        {!admin && t.status === "RESOLVED" && <button type="button" className="min-h-9 rounded-xl border border-[#d8dee8] px-3 text-xs font-medium hover:bg-[#f3f5f7]" onClick={() => setText("Thanks, this is fixed.")}>It is fixed</button>}
      </div>
    </div>
  );
}
