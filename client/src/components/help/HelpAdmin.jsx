import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { BookOpen, Inbox, Plus, ScrollText } from "lucide-react";
import toast from "react-hot-toast";
import domain from "../../api/domain";
import Header from "../adminDashboard/Header";
import { useConfirm } from "../common/confirmContext";
import { Field, Modal, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import TicketThread from "./TicketThread";
import { STATUS_LABEL, STATUS_STYLE } from "./ticketMeta";

const ROLES = [["ALL", "Everyone"], ["ADMIN", "Back-Admin"], ["AUDITOR", "Auditors"], ["CORPORATE_MANAGER", "Corporate"], ["ZONAL_MANAGER", "Zonal"], ["REGIONAL_MANAGER", "Regional"], ["SITE_INCHARGE", "Site in-charge"], ["SITE_USER", "Site users"]];
const audienceText = (a) => (a.includes("ALL") ? "Everyone" : a.map((r) => ROLES.find(([k]) => k === r)?.[1] || r).join(", "));
const day = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function AudiencePicker({ value, onChange }) {
  const toggle = (k) => onChange(k === "ALL" ? ["ALL"] : (value.includes(k) ? value.filter((x) => x !== k) : [...value.filter((x) => x !== "ALL"), k]));
  return <div className="mt-1 flex flex-wrap gap-2">{ROLES.map(([k, label]) => <button key={k} type="button" aria-pressed={value.includes(k)} onClick={() => toggle(k)} className={`min-h-9 rounded-full px-3 text-xs font-medium transition ${value.includes(k) ? "bg-[#181919] text-white" : "bg-[#f3f5f7] text-[#374151] hover:bg-[#ece9df]"}`}>{label}</button>)}</div>;
}

function Tickets() {
  const [status, setStatus] = useState("OPEN,IN_PROGRESS,WAITING_ON_USER");
  const [list, setList] = useState(null);
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get("ticket"));
  const load = useCallback(() => axios.get(`${domain}/help/tickets`, { params: { status } }).then(({ data }) => setList(data.tickets)), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[["OPEN,IN_PROGRESS,WAITING_ON_USER", "Active"], ["RESOLVED,CLOSED", "Resolved"], ["", "All"]].map(([v, l]) => <button key={l} type="button" onClick={() => setStatus(v)} className={`min-h-9 rounded-full px-4 text-sm font-medium ${status === v ? "bg-[#181919] text-white" : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"}`}>{l}</button>)}
      </div>
      {list === null ? <p className="text-sm text-gray-500">Loading...</p> : list.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>Nothing here.</div> : (
        <div className="space-y-2.5">
          {list.map((t) => (
            <button key={t.id} type="button" onClick={() => setView(t.id)} className={`${cardClass} flex w-full flex-wrap items-center justify-between gap-3 !p-4 text-left transition hover:-translate-y-0.5`}>
              <div className="min-w-0"><div className="text-[15px] font-semibold">{t.subject}</div><div className="mt-0.5 text-xs text-gray-500">{t.ticketNumber} · {t.requester?.fullName || "—"} ({(t.requester?.role || "").replaceAll("_", " ").toLowerCase()}) · {t.category.toLowerCase()} · {day(t.updatedAt)}</div></div>
              <div className="flex items-center gap-2">{t.priority !== "NORMAL" && <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-[#b42318]">{t.priority.toLowerCase()}</span>}<span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span></div>
            </button>
          ))}
        </div>
      )}
      {view && <Modal title="Support request" onClose={() => setView(null)} wide><TicketThread ticketId={view} admin onChanged={load} /></Modal>}
    </div>
  );
}

function Policies() {
  const { confirm } = useConfirm();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [people, setPeople] = useState(null);
  const load = useCallback(() => axios.get(`${domain}/help/admin/policies`).then(({ data }) => setList(data.policies)), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    const wasNew = Boolean(edit.newVersion);
    if (wasNew && !(await confirm({ title: "Publish a new version?", message: "Everyone this policy applies to must accept it again at their next login.", points: ["The old acceptances are kept as history", "Use this for real changes, not typo fixes"], confirmLabel: "Publish new version" }))) return;
    await axios.request({ method: edit.id ? "put" : "post", url: `${domain}/help/admin/policies${edit.id ? `/${edit.id}` : ""}`, data: edit, showSuccessToast: true });
    setEdit(null); load();
  };
  const showAcks = async (p) => { const { data } = await axios.get(`${domain}/help/admin/policies/${p.id}/acknowledgements`); setPeople({ policy: p, ...data }); };
  if (!list) return <p className="text-sm text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="mb-4 flex justify-end"><button type="button" className={darkBtn} onClick={() => setEdit({ title: "", body: "", audience: ["ALL"], requiresAck: true })}><Plus size={16} /> New policy</button></div>
      <div className="space-y-2.5">
        {list.map((p) => (
          <div key={p.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-3 !p-4`}>
            <div className="min-w-0"><div className="text-[15px] font-semibold">{p.title} <span className="text-xs font-normal text-gray-500">v{p.version}</span>{!p.active && <span className="ml-2 rounded-full bg-[#f1f1f1] px-2 py-0.5 text-xs font-normal">inactive</span>}</div><div className="mt-0.5 text-xs text-gray-500">For {audienceText(p.audience)} · published {day(p.publishedAt)}</div></div>
            <div className="flex items-center gap-3 text-sm"><button type="button" className="underline underline-offset-2" onClick={() => showAcks(p)}>{p.acceptedCount} of {p.audienceCount} accepted</button><button type="button" className={lightBtn} onClick={() => setEdit({ ...p, newVersion: false })}>Edit</button></div>
          </div>
        ))}
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.title}` : "New policy"} onClose={() => setEdit(null)} wide>
          <div className="space-y-3 text-sm">
            <Field label="Title *"><input className={inputClass} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Text *"><textarea className={`${inputClass} min-h-56 font-mono text-[13px]`} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <p className="-mt-1 text-xs text-gray-500">Use "## Heading", "- bullet", "1. step" and **bold**.</p>
            <div><span className="font-medium">Applies to</span><AudiencePicker value={edit.audience} onChange={(audience) => setEdit({ ...edit, audience })} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.requiresAck !== false} onChange={(e) => setEdit({ ...edit, requiresAck: e.target.checked })} /> People must accept it at login</label>
            {edit.id && <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>}
            {edit.id && <label className="flex items-start gap-2 rounded-xl bg-[#fff8ec] p-3"><input type="checkbox" className="mt-0.5" checked={Boolean(edit.newVersion)} onChange={(e) => setEdit({ ...edit, newVersion: e.target.checked })} /><span><b>Publish as a new version</b><br /><span className="text-xs text-gray-600">Everyone must accept it again. Leave off for small fixes.</span></span></label>}
            <div className="flex justify-end gap-2"><button className={lightBtn} onClick={() => setEdit(null)}>Cancel</button><button className={darkBtn} disabled={!edit.title.trim() || edit.body.trim().length < 20 || !edit.audience.length} onClick={save}>Save</button></div>
          </div>
        </Modal>
      )}
      {people && (
        <Modal title={`${people.policy.title}: who has accepted`} onClose={() => setPeople(null)} wide>
          <p className="mb-3 text-xs text-gray-500">Version {people.version}</p>
          <div className="max-h-[60vh] overflow-y-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Person</th><th>Role</th><th>Accepted</th></tr></thead><tbody>{people.people.map((u) => <tr key={u.id} className="border-t border-[#eef0f3]"><td className="py-2">{u.fullName}<div className="text-xs text-gray-500">{u.email}</div></td><td className="text-xs">{u.role.replaceAll("_", " ").toLowerCase()}</td><td className="text-xs">{u.acceptedAt ? day(u.acceptedAt) : <span className="rounded-full bg-[#fff3e0] px-2 py-0.5 text-[#9a5200]">Pending</span>}</td></tr>)}</tbody></table></div>
        </Modal>
      )}
    </div>
  );
}

function Training() {
  const { confirm } = useConfirm();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => axios.get(`${domain}/help/admin/training`).then(({ data }) => setList(data.modules)), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { await axios.request({ method: edit.id ? "put" : "post", url: `${domain}/help/admin/training${edit.id ? `/${edit.id}` : ""}`, data: edit, showSuccessToast: true }); setEdit(null); load(); };
  const remove = async (m) => { if (!(await confirm({ title: `Delete "${m.title}"?`, tone: "danger", message: "The module and everyone's progress on it are removed.", confirmLabel: "Delete module" }))) return; await axios.delete(`${domain}/help/admin/training/${m.id}`); toast.success("Deleted"); load(); };
  if (!list) return <p className="text-sm text-gray-500">Loading...</p>;
  return (
    <div>
      <div className="mb-4 flex justify-end"><button type="button" className={darkBtn} onClick={() => setEdit({ title: "", summary: "", body: "", videoUrl: "", category: "GENERAL", minutes: 5, audience: ["ALL"], published: true })}><Plus size={16} /> New module</button></div>
      <div className="space-y-2.5">
        {list.map((m) => (
          <div key={m.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-3 !p-4`}>
            <div className="min-w-0"><div className="text-[15px] font-semibold">{m.title}{!m.published && <span className="ml-2 rounded-full bg-[#f1f1f1] px-2 py-0.5 text-xs font-normal">draft</span>}</div><div className="mt-0.5 text-xs text-gray-500">For {audienceText(m.audience)} · {m.minutes} min · {m.completions} completed</div></div>
            <div className="flex gap-2"><button type="button" className={lightBtn} onClick={() => setEdit({ ...m, videoUrl: m.videoUrl || "", summary: m.summary || "" })}>Edit</button><button type="button" className="min-h-10 rounded-xl px-3 text-sm text-[#b42318] hover:bg-[#fdecec]" onClick={() => remove(m)}>Delete</button></div>
          </div>
        ))}
      </div>
      {edit && (
        <Modal title={edit.id ? "Edit module" : "New module"} onClose={() => setEdit(null)} wide>
          <div className="space-y-3 text-sm">
            <Field label="Title *"><input className={inputClass} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="One-line summary"><input className={inputClass} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></Field>
            <Field label="Content *"><textarea className={`${inputClass} min-h-48 font-mono text-[13px]`} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-3"><Field label="Video link (optional)"><input className={inputClass} value={edit.videoUrl} onChange={(e) => setEdit({ ...edit, videoUrl: e.target.value })} placeholder="https://" /></Field><Field label="Minutes"><input type="number" min="1" className={inputClass} value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: e.target.value })} /></Field><Field label="Group"><input className={inputClass} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field></div>
            <div><span className="font-medium">For</span><AudiencePicker value={edit.audience} onChange={(audience) => setEdit({ ...edit, audience })} /></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.published !== false} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /> Published (visible to the people above)</label>
            <div className="flex justify-end gap-2"><button className={lightBtn} onClick={() => setEdit(null)}>Cancel</button><button className={darkBtn} disabled={!edit.title.trim() || edit.body.trim().length < 10 || !edit.audience.length} onClick={save}>Save</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const TABS = [["tickets", "Support inbox", Inbox], ["policies", "Policies", ScrollText], ["training", "Training content", BookOpen]];
export default function HelpAdmin() {
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("ticket") ? "tickets" : "tickets"));
  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Governance" }]} title="Help content" subtitle="Answer support requests, publish policies people must accept, and manage the training they see." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">{TABS.map(([k, label, icon]) => { const Icon = icon; return <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${tab === k ? "bg-[#181919] text-white" : "bg-white text-[#374151] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#f7f5ef]"}`}><Icon size={16} />{label}</button>; })}</div>
      {tab === "tickets" && <Tickets />}
      {tab === "policies" && <Policies />}
      {tab === "training" && <Training />}
    </div>
  );
}
