import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { BookOpen, Check, LifeBuoy, Plus, PlayCircle, ScrollText } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import domain from "../../api/domain";
import Header from "../adminDashboard/Header";
import { Field, Modal, PageTitle, ProgressBar, SkeletonTable, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import GuideTour from "./GuideTour";
import Markdown from "./Markdown";
import TicketThread from "./TicketThread";
import { STATUS_LABEL, STATUS_STYLE } from "./ticketMeta";

const TABS = [["start", "Start here", PlayCircle], ["training", "Training", BookOpen], ["policies", "Policies", ScrollText], ["support", "Support", LifeBuoy]];
const CATEGORY_LABEL = { REPORT: "A report", ACCESS: "Login or access", AUDIT: "An audit", TECHNICAL: "Something is not working", TRAINING: "Training", BILLING: "Billing or subscription", OTHER: "Something else" };
const day = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const rolePath = () => { const r = localStorage.getItem("role"); return r === "ADMIN" ? "/admin-dashboard" : r === "AUDITOR" ? "/auditor-dashboard" : "/user-dashboard"; };

function Start({ base }) {
  const [guide, setGuide] = useState(null);
  const [tour, setTour] = useState(false);
  useEffect(() => { axios.get(`${domain}/help/guide`).then(({ data }) => setGuide(data)); }, []);
  if (!guide) return <SkeletonTable rows={4} />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-600">The flow in your role, step by step. Open any page directly, or replay the guided tour.</p>
        <button type="button" className={lightBtn} onClick={() => setTour(true)}><PlayCircle size={16} /> Replay the quick guide</button>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {guide.steps.map((s, i) => (
          <li key={i} className={`${cardClass} !p-5`}>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#181919] text-sm font-semibold text-white">{i + 1}</span>
              <div className="min-w-0"><h3 className="text-[15px] font-semibold">{s.title}</h3><p className="mt-1 text-sm leading-relaxed text-gray-600">{s.text}</p>{s.link && <Link to={`${base}/${s.link}`} className="mt-2 inline-block text-sm font-medium text-[#1e61ad] underline underline-offset-2">Open this page</Link>}</div>
            </div>
          </li>
        ))}
      </ol>
      {tour && <GuideTour steps={guide.steps} basePath={base} onClose={() => setTour(false)} />}
    </div>
  );
}

function Training() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => axios.get(`${domain}/help/training`).then(({ data: d }) => setData(d)), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <SkeletonTable rows={4} />;
  const complete = async (m) => { await axios.post(`${domain}/help/training/${m.id}/complete`); toast.success("Marked as done"); setOpen(null); load(); };
  return (
    <div>
      <div className={`${cardClass} mb-4 !p-5`}>
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Your progress</span><span className="text-gray-600">{data.completedCount} of {data.total} done</span></div>
        <div className="mt-2"><ProgressBar value={data.total ? Math.round((data.completedCount / data.total) * 100) : 0} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.modules.map((m) => (
          <button key={m.id} type="button" onClick={() => setOpen(m)} className={`${cardClass} !p-5 text-left transition hover:-translate-y-0.5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="text-[15px] font-semibold">{m.title}</h3><p className="mt-1 text-sm text-gray-600">{m.summary}</p></div>
              {m.completed ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf8ed] text-[#287a37]" title="Done"><Check size={16} /></span> : null}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500"><span>{m.minutes} min</span><span>·</span><span>{m.category.replaceAll("_", " ").toLowerCase()}</span>{m.contentType === "VIDEO" && <span className="rounded-full bg-[#f1ebfd] px-2 py-0.5 text-[#6b3fc4]">video</span>}</div>
          </button>
        ))}
      </div>
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} wide>
          {open.videoUrl && <a href={open.videoUrl} target="_blank" rel="noreferrer" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-[#1e61ad] underline">Watch the video</a>}
          <Markdown text={open.body} />
          <div className="mt-5 flex justify-end gap-2"><button className={lightBtn} onClick={() => setOpen(null)}>Close</button><button className={darkBtn} disabled={open.completed} onClick={() => complete(open)}>{open.completed ? "Done" : "Mark as done"}</button></div>
        </Modal>
      )}
    </div>
  );
}

function Policies() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => axios.get(`${domain}/help/policies`).then(({ data }) => setList(data.policies)), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return <SkeletonTable rows={4} />;
  const accept = async (p) => { await axios.post(`${domain}/help/policies/acknowledge`, { ids: [p.id] }); toast.success("Accepted"); setOpen(null); load(); };
  return (
    <div className="space-y-3">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => setOpen(p)} className={`${cardClass} flex w-full items-center justify-between gap-3 !p-5 text-left transition hover:-translate-y-0.5`}>
          <div className="min-w-0"><h3 className="text-[15px] font-semibold">{p.title}</h3><p className="mt-0.5 text-xs text-gray-500">Version {p.version} · published {day(p.publishedAt)}</p></div>
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${p.pending ? "bg-[#fff3e0] text-[#9a5200]" : "bg-[#eaf8ed] text-[#287a37]"}`}>{p.pending ? "Needs your acceptance" : `Accepted ${day(p.acceptedAt)}`}</span>
        </button>
      ))}
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} wide>
          <p className="mb-3 text-xs text-gray-500">Version {open.version}</p>
          <Markdown text={open.body} />
          <div className="mt-5 flex justify-end gap-2"><button className={lightBtn} onClick={() => setOpen(null)}>Close</button>{open.pending && <button className={darkBtn} onClick={() => accept(open)}>I accept</button>}</div>
        </Modal>
      )}
    </div>
  );
}

function Support() {
  const [tickets, setTickets] = useState(null);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => axios.get(`${domain}/help/tickets`).then(({ data }) => setTickets(data.tickets)), []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${domain}/help/tickets`, form, { showSuccessToast: false }); toast.success(`Request ${data.ticketNumber} sent`); setForm(null); await load(); setView(data.id); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-600">Ask a question or report a problem, such as a report that looks wrong, a login that does not work, or a missing photograph. Back-Admin replies here.</p>
        <button type="button" className={darkBtn} onClick={() => setForm({ category: "REPORT", priority: "NORMAL", subject: "", description: "" })}><Plus size={16} /> New request</button>
      </div>
      {tickets === null ? <SkeletonTable rows={4} /> : tickets.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>No requests yet.</div> : (
        <div className="space-y-2.5">
          {tickets.map((t) => (
            <button key={t.id} type="button" onClick={() => setView(t.id)} className={`${cardClass} flex w-full flex-wrap items-center justify-between gap-3 !p-4 text-left transition hover:-translate-y-0.5`}>
              <div className="min-w-0"><div className="text-[15px] font-semibold">{t.subject}</div><div className="mt-0.5 text-xs text-gray-500">{t.ticketNumber} · {CATEGORY_LABEL[t.category] || t.category} · updated {day(t.updatedAt)}</div></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
            </button>
          ))}
        </div>
      )}
      {form && (
        <Modal title="New support request" onClose={() => setForm(null)}>
          <div className="space-y-3 text-sm">
            <Field label="What is it about?"><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Short title *"><input className={inputClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="For example: Facade photo missing in my report" /></Field>
            <Field label="Describe the problem *"><textarea className={`${inputClass} min-h-28`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened, where, and what you expected. Include the report number if there is one." /></Field>
            <Field label="How urgent is it?"><select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent: I cannot work</option></select></Field>
            <div className="flex justify-end gap-2"><button className={lightBtn} onClick={() => setForm(null)}>Cancel</button><button className={darkBtn} disabled={busy || form.subject.trim().length < 4 || form.description.trim().length < 10} onClick={create}>Send request</button></div>
          </div>
        </Modal>
      )}
      {view && <Modal title="Support request" onClose={() => setView(null)} wide><TicketThread ticketId={view} onChanged={load} /></Modal>}
    </div>
  );
}

export default function HelpCenter() {
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "start");
  const base = rolePath();
  const admin = localStorage.getItem("role") === "ADMIN";
  return (
    <div>
      <Header />
      <PageTitle title="Help & Training" subtitle="A guide to the flow, training for your role, the policies you accept, and support when something is wrong." actions={admin && <Link to="/admin-dashboard/help-admin" className={lightBtn}>Manage help content</Link>} />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([key, label, icon]) => { const Icon = icon; return (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${tab === key ? "bg-[#181919] text-white" : "bg-white text-[#374151] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#f7f5ef]"}`}><Icon size={16} />{label}</button>
        ); })}
      </div>
      {tab === "start" && <Start base={base} />}
      {tab === "training" && <Training />}
      {tab === "policies" && <Policies />}
      {tab === "support" && <Support />}
    </div>
  );
}
