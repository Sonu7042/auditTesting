import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import InitialAvatar from "../InitialAvatar";
import ExcelImport, { ImportButton } from "../common/ExcelImport";
import { Field, Modal, PageTitle, SkeletonCard, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { STATUS_META, SKILL_LABELS, TAG_META } from "./meta";
import { Pill, ScoreRing } from "./shared";

const FILTERS = [["ALL", "All"], ["APPROVED", "Approved"], ["IN_PROGRESS", "In onboarding"], ["RETRAIN", "Retraining"], ["REJECTED", "Rejected"]];
const empty = { fullName: "", email: "", phone: "", dateOfBirth: "", emergencyContact: "", baseLocation: "", supportedRegions: "", skills: [], notes: "" };

export default function AuditorCards() {
  const navigate = useNavigate();
  const [auditors, setAuditors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const { confirm } = useConfirm();

  const load = async () => {
    try { const { data } = await axios.get(`${domain}/auditor-onboarding`); setAuditors(data.auditors || []); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm(empty);
    setErrors({});
    setShowAdd(true);
  };

  const closeAdd = () => {
    setShowAdd(false);
    setForm(empty);
    setErrors({});
  };

  const toggleSkill = (s) => setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));
  const save = async () => {
    const errs = {};
    if (!form.fullName?.trim()) {
      errs.fullName = "Full name is required.";
    }
    if (!form.email?.trim()) {
      errs.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "Please enter a valid email address.";
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    if (!(await confirm({ title: "Create this auditor and send login details?", message: `${form.fullName} will be registered as an auditor.`, points: ["A temporary username and password are generated", `They are emailed to ${form.email} when email is set up; otherwise you share them`, "The auditor must finish training, the quiz and the demo checklist before they can be assigned"], confirmLabel: "Create & send login" }))) return;
    setSaving(true);
    try {
      const { data } = await axios.post(`${domain}/auditor-onboarding`, form);
      closeAdd();
      setCreated(data);
      load();
    } catch (err) {
      const resData = err.response?.data;
      if (resData?.errors) {
        setErrors(resData.errors);
      } else if (resData?.message) {
        const msg = resData.message;
        if (msg.toLowerCase().includes("email")) {
          setErrors({ email: msg });
        } else if (msg.toLowerCase().includes("name")) {
          setErrors({ fullName: msg });
        }
      }
    } finally { setSaving(false); }
  };

  const q = search.trim().toLowerCase();
  const shown = auditors.filter((a) => {
    if (q && !`${a.fullName} ${a.email} ${a.baseLocation || ""}`.toLowerCase().includes(q)) return false;
    if (filter === "APPROVED") return a.status === "APPROVED";
    if (filter === "IN_PROGRESS") return ["CREATED", "TRAINING", "UNDER_REVIEW", "AWAITING_APPROVAL"].includes(a.status);
    if (filter === "RETRAIN") return a.status === "RETRAINING" || a.tag === "RETRAIN" || a.tag === "BLOCKED";
    if (filter === "REJECTED") return a.status === "REJECTED";
    return true;
  });

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Auditor Onboarding" }]}
        title="Auditors"
        subtitle="Create an auditor to start onboarding: training, quiz and demo, Back-Admin review, then approval."
        actions={<><ImportButton label="Import auditors" onClick={() => setShowImport(true)} /><button className={darkBtn} onClick={openAdd}><Plus size={16} /> Add Auditor</button></>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className={`${inputClass} !mt-0 pl-9`} placeholder="Search name, email or base" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-4 py-2 text-sm ${filter === key ? "bg-[#181919] text-white" : "bg-white text-gray-600 shadow-sm"}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className={`${cardClass} text-center text-sm text-gray-500`}>No auditors here yet. Add an auditor to begin onboarding.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <button key={a.id} type="button" onClick={() => navigate(`/admin-dashboard/auditor-onboarding/${a.id}`)} className="rounded-3xl bg-white p-5 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)]">
              <div className="flex items-start gap-3">
                <InitialAvatar name={a.fullName} className="h-11 w-11" textClassName="text-base" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-[#20242c]">{a.fullName}</h3>
                  <p className="truncate text-xs text-gray-500">{a.baseLocation || a.email}</p>
                </div>
                <ScoreRing value={a.score} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill meta={STATUS_META[a.status]} />
                {a.tag && <Pill meta={TAG_META[a.tag]} />}
                {a.auditorCode && <span className="whitespace-nowrap rounded-full bg-[#e8f1fd] px-2.5 py-1 text-xs text-[#1e61ad]">ID {a.auditorCode}</span>}
                {a.status === "APPROVED" && <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${a.fieldReady ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#f1f1f1] text-[#555]"}`}>{a.fieldReady ? "Field ready" : "Field checks pending"}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(a.skills || []).map((s) => <span key={s} className="whitespace-nowrap rounded-full bg-[#f3f5f7] px-2 py-0.5 text-xs text-gray-600">{SKILL_LABELS[s] || s}</span>)}
              </div>
              {a.scoreBasis && <p className="mt-2 text-xs text-gray-500">{a.scoreBasis}</p>}
            </button>
          ))}
          <button type="button" onClick={openAdd} className="flex min-h-[170px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#CECECE] text-sm text-gray-500 hover:border-[#63C174] hover:text-[#287a37]">
            <Plus size={28} /> Add auditor
          </button>
        </div>
      )}

      {showAdd && (
        <Modal title="Step 1 · Create auditor" onClose={closeAdd}>
          <div className="space-y-4">
            <Field label="Full name *" error={errors.fullName}>
              <input
                className={`${inputClass} ${errors.fullName ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500/20" : ""}`}
                value={form.fullName}
                onChange={(e) => {
                  setForm({ ...form, fullName: e.target.value });
                  if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: "" }));
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email *" error={errors.email}>
                <input
                  className={`${inputClass} ${errors.email ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500/20" : ""}`}
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                  }}
                />
              </Field>
              <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Emergency contact number (shown on the ID card)"><input className={inputClass} inputMode="tel" placeholder="Family member or colleague to call in an emergency" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of birth (shown on the ID card)"><input type="date" className={inputClass} max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
              <Field label="Base location"><input className={inputClass} value={form.baseLocation} onChange={(e) => setForm({ ...form, baseLocation: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Regions supported (comma separated)"><input className={inputClass} placeholder="EAST, PATNA" value={form.supportedRegions} onChange={(e) => setForm({ ...form, supportedRegions: e.target.value })} /></Field>
            </div>
            <div>
              <span className="text-sm font-medium text-[#374151]">Skills</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(SKILL_LABELS).map(([key, label]) => (
                  <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${form.skills.includes(key) ? "border-[#63C174] bg-[#f5fcf6]" : "border-[#d8dee8]"}`}>
                    <input type="checkbox" checked={form.skills.includes(key)} onChange={() => toggleSkill(key)} />{label}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Notes"><textarea rows="2" className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <p className="text-xs text-gray-500">A temporary username and password are generated and emailed to the auditor, who then completes the training.</p>
            <div className="flex justify-end gap-2">
              <button className={lightBtn} onClick={closeAdd}>Cancel</button>
              <button className={darkBtn} disabled={saving} onClick={save}>{saving ? "Creating..." : "Create & send login"}</button>
            </div>
          </div>
        </Modal>
      )}

      {created && (
        <Modal title="Auditor created" onClose={() => setCreated(null)}>
          <div className="space-y-3 text-sm">
            <p>{created.auditor.fullName} has been added. Their username is <b className="font-mono tracking-wider">{created.credentials.username}</b>.</p>
            <p className="text-xs text-gray-500">No password has been sent yet. Open the auditor and choose "Send one-time login details" when you are ready; they will then set their own password at first login.</p>
            <div className="flex justify-end gap-2">
              <button className={lightBtn} onClick={() => setCreated(null)}>Close</button>
              <button className={darkBtn} onClick={() => navigate(`/admin-dashboard/auditor-onboarding/${created.auditor.id}`)}>Open auditor</button>
            </div>
          </div>
        </Modal>
      )}
      {showImport && <ExcelImport kind="auditors" title="Import auditors from Excel" intro="One row per auditor with skills (Track A: infrastructure and fire, Track B: electrical and thermography) and supported regions. Each is created ready for training; send the login from the auditor's page when they should start." onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
