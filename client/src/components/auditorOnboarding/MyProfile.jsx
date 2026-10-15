import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Camera, PencilLine } from "lucide-react";
import toast from "react-hot-toast";
import domain from "../../api/domain";
import Header from "../adminDashboard/Header";
import { useConfirm } from "../common/confirmContext";
import { Field, Modal, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import AuditorIdCard from "./AuditorIdCard";
import { SKILL_LABELS } from "./meta";
import { resizePhoto } from "./photoResize";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set");
const fmtTime = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const EVENT_LABELS = {
  CREATED: "Account created", TRAINING_STARTED: "Training started", SUBMITTED_FOR_REVIEW: "Submitted for review", REVIEW_PASS: "Review passed",
  APPROVED: "Approved as field auditor", RETRAINING: "Sent for retraining", REJECTED: "Not approved", CHANGE_REQUESTED: "Card change requested",
  CHANGE_APPROVED: "Card change approved", CHANGE_DECLINED: "Card change declined",
};
const FIELD_LABELS = { fullName: "Name", phone: "Phone", emergencyContact: "Emergency contact", dateOfBirth: "Date of birth", baseLocation: "Base location", photo: "Photo" };
const REQUEST_STYLE = { PENDING: "bg-[#fff6e8] text-[#9a5200]", APPROVED: "bg-[#eaf8ed] text-[#287a37]", REJECTED: "bg-[#fdecec] text-[#b42318]" };

// Fields an auditor may ask to change. Everything else (ID, validity, authority letter) is set by Back-Admin.
const FIELD_ORDER = ["fullName", "phone", "emergencyContact", "dateOfBirth", "baseLocation", "photo"];

function ChangeRequestModal({ card, onClose, onSent }) {
  const { confirm } = useConfirm();
  const current = { fullName: card.fullName, phone: card.phone || "", emergencyContact: card.emergencyContact || "", dateOfBirth: card.dateOfBirth ? card.dateOfBirth.slice(0, 10) : "", baseLocation: card.baseLocation || "", photo: "" };
  const [picked, setPicked] = useState({});
  const [values, setValues] = useState(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (key) => setPicked((p) => ({ ...p, [key]: !p[key] }));
  const chosen = FIELD_ORDER.filter((k) => picked[k]);

  const pickPhoto = async (file) => {
    if (!file) return;
    try { setValues((v) => ({ ...v, photo: "" })); const photo = await resizePhoto(file); setValues((v) => ({ ...v, photo })); } catch (e) { toast.error(e.message); }
  };

  const send = async () => {
    const changes = Object.fromEntries(chosen.map((k) => [k, values[k]]));
    if (!(await confirm({ title: "Send this change request?", message: "Back-Admin reviews it before your ID card is updated. Until then the card stays as it is.", points: [`You are asking to change: ${chosen.map((k) => FIELD_LABELS[k]).join(", ")}`, "You can send another request after this one is decided"], confirmLabel: "Send request" }))) return;
    setBusy(true);
    try {
      await axios.post(`${domain}/auditor-onboarding/me/change-requests`, { changes, reason }, { showSuccessToast: true });
      onSent();
      onClose();
    } finally { setBusy(false); }
  };

  const ready = chosen.length > 0 && reason.trim().length >= 5 && chosen.every((k) => String(values[k] || "").trim() && values[k] !== current[k]);

  return (
    <Modal title="Request a change to your ID card" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">Tick what needs to change and enter the correct detail. Back-Admin will review it.</p>
        <div className="space-y-3">
          {FIELD_ORDER.map((key) => (
            <div key={key} className="rounded-2xl border border-[#e1e5ea] p-3">
              <label className="flex min-h-10 items-center gap-3 font-medium">
                <input type="checkbox" className="h-5 w-5" checked={Boolean(picked[key])} onChange={() => toggle(key)} />
                {FIELD_LABELS[key]}
                {key !== "photo" && <span className="ml-auto truncate text-xs font-normal text-gray-500">now: {key === "dateOfBirth" ? fmt(card.dateOfBirth) : current[key] || "not set"}</span>}
              </label>
              {picked[key] && (key === "photo" ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className={`${lightBtn} cursor-pointer`}><Camera size={16} /> Choose a new photo<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>
                  {values.photo && <img src={values.photo} alt="New" className="h-16 w-12 rounded-lg border object-cover" />}
                </div>
              ) : (
                <input className={inputClass} type={key === "dateOfBirth" ? "date" : key === "phone" || key === "emergencyContact" ? "tel" : "text"} max={key === "dateOfBirth" ? new Date().toISOString().slice(0, 10) : undefined} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
              ))}
            </div>
          ))}
        </div>
        <Field label="Why is this change needed? *"><textarea className={`${inputClass} min-h-20`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: I changed my mobile number" /></Field>
        <div className="flex justify-end gap-2"><button className={lightBtn} onClick={onClose}>Cancel</button><button className={darkBtn} disabled={!ready || busy} onClick={send}>Send request</button></div>
      </div>
    </Modal>
  );
}

export default function MyProfile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => axios.get(`${domain}/auditor-onboarding/me/profile`, { showErrorToast: false }).then(({ data: d }) => setData(d)).catch((e) => setError(e.userMessage || "Your profile is not available.")), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div><Header /><PageTitle title="My profile" subtitle={error} /></div>;
  if (!data) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const { card: c, requests, history } = data;
  const approved = c.status === "APPROVED" && c.auditorCode;
  const pending = requests.some((r) => r.status === "PENDING");

  const details = [["Name", c.fullName], ["Username", data.username], ["Email", c.email], ["Phone", c.phone], ["Emergency contact", c.emergencyContact], ["Date of birth", c.dateOfBirth ? fmt(c.dateOfBirth) : null], ["Base location", c.baseLocation], ["Regions", (c.regions || []).join(", ")], ["Skills", (c.skills || []).map((s) => SKILL_LABELS[s] || s).join(", ")]];

  return (
    <div>
      <Header />
      <PageTitle title="Something not right?" subtitle="Your ID card, authority letter and details are below. Ask Back-Admin to correct anything that is wrong." actions={approved && <button className={darkBtn} disabled={pending} onClick={() => setAsking(true)}><PencilLine size={16} /> {pending ? "Request pending" : "Request a change"}</button>} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className={cardClass}>
            <h2 className="mb-1 text-lg font-semibold">My ID card</h2>
            {approved ? (
              <>
                <p className="mb-4 text-sm text-gray-500">Carry this card and the authority letter on every visit. Tap the card to see the other side.</p>
                <AuditorIdCard allowPhoto={false} />
              </>
            ) : <p className="text-sm text-gray-600">Your ID card is issued once Back-Admin approves your onboarding. Finish the training, quiz and demo first.</p>}
          </section>

          <section className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold">Change requests</h2>
            {requests.length === 0 ? <p className="text-sm text-gray-500">No requests yet.</p> : (
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-[#e1e5ea] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.fields.map((f) => FIELD_LABELS[f] || f).join(", ")}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STYLE[r.status]}`}>{r.status === "PENDING" ? "Waiting for Back-Admin" : r.status === "APPROVED" ? "Approved" : "Declined"}</span></div>
                    <div className="mt-1 text-xs text-gray-500">Sent {fmtTime(r.createdAt)}{r.reason ? ` · ${r.reason}` : ""}</div>
                    {r.status === "REJECTED" && r.remarks && <p className="mt-2 rounded-lg bg-[#fdecec] p-2 text-xs text-[#b42318]">{r.remarks}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold">My details</h2>
            <dl className="space-y-2.5 text-sm">{details.map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl>
          </section>
          <section className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold">History</h2>
            <ul className="space-y-2 text-xs">{history.map((e, i) => <li key={i} className="border-l-2 border-[#d8dee8] pl-3"><div className="font-medium">{EVENT_LABELS[e.action] || e.action.replaceAll("_", " ").toLowerCase()}</div><div className="text-gray-500">{fmtTime(e.at)}</div></li>)}</ul>
          </section>
        </aside>
      </div>
      {asking && <ChangeRequestModal card={c} onClose={() => setAsking(false)} onSent={load} />}
    </div>
  );
}
