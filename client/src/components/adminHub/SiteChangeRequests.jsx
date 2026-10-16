import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Camera, Plus } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { useConfirm } from "../common/confirmContext";
import { Field, Modal, PageTitle, SkeletonTable, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";

const FIELDS = [["contactName", "Contact name"], ["contactPhone", "Contact phone"], ["contactEmail", "Contact email"], ["address", "Address"], ["city", "City"], ["district", "District"], ["state", "State"], ["electricalSupplyType", "Electrical supply"], ["latitude", "Latitude"], ["longitude", "Longitude"], ["geofenceRadiusM", "Geofence radius (m)"]];
const STATUS = { PENDING: ["Waiting for Back-Admin", "bg-[#fff6e8] text-[#9a5200]"], APPROVED: ["Approved and applied", "bg-[#eaf8ed] text-[#287a37]"], REJECTED: ["Declined", "bg-[#fdecec] text-[#b42318]"] };
const label = Object.fromEntries(FIELDS);

function RequestCard({ r, admin, onDecided }) {
  const { confirm } = useConfirm();
  const decide = async (approve) => {
    let remarks = "";
    if (!approve) { remarks = window.prompt("Reason for declining this change:") || ""; if (!remarks.trim()) return; }
    else if (!(await confirm({ title: "Apply this change to the site?", message: `${r.location?.locationName} master data will be updated.`, points: ["The previous values are kept on this request", "The requester is notified"], confirmLabel: "Approve and apply" }))) return;
    await axios.post(`${domain}/site-change-requests/${r.id}/decision`, { approve, remarks }, { showSuccessToast: true });
    onDecided();
  };
  const [text, cls] = STATUS[r.status];
  return (
    <li className="rounded-2xl border border-[#e1e5ea] p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="font-semibold">{r.location?.locationName} <span className="text-xs font-normal text-gray-500">{r.location?.locationCode}</span></div><div className="text-xs text-gray-500">{r.requestedBy?.fullName} · {new Date(r.createdAt).toLocaleString("en-IN")}</div></div>
        <span className={`rounded-full px-3 py-1 text-xs ${cls}`}>{text}</span>
      </div>
      <table className="mt-3 w-full text-xs"><thead className="text-left uppercase text-gray-500"><tr><th className="py-1">Detail</th><th>Now</th><th>Requested</th></tr></thead>
        <tbody>{Object.entries(r.changes).map(([k, v]) => (<tr key={k} className="border-t border-[#eef0f3]"><td className="py-1">{label[k] || k}</td><td className="text-gray-500">{String(r.status === "APPROVED" ? (r.previousValues?.[k] ?? "—") : (r.location?.[k] ?? "—"))}</td><td className="font-medium">{String(v)}</td></tr>))}</tbody></table>
      <p className="mt-2 text-gray-600">Reason: {r.reason}</p>
      {r.photoUrl && <img src={r.photoUrl} alt="Evidence" className="mt-2 max-h-40 rounded-xl border border-[#e1e5ea]" />}
      {r.decisionRemarks && <p className="mt-2 text-xs text-gray-600">Back-Admin: {r.decisionRemarks}</p>}
      {admin && r.status === "PENDING" && <div className="mt-3 flex gap-2"><button className={darkBtn} onClick={() => decide(true)}>Approve</button><button className={lightBtn} onClick={() => decide(false)}>Decline</button></div>}
    </li>
  );
}

function RequestModal({ site, onClose, onSent }) {
  const [form, setForm] = useState({}); const [reason, setReason] = useState(""); const [photo, setPhoto] = useState(""); const [busy, setBusy] = useState(false);
  const onPhoto = (e) => { const f = e.target.files?.[0]; if (!f) return; if (!/^image\/(png|jpeg)$/.test(f.type) || f.size > 400 * 1024) return toast.error("Choose a JPEG or PNG under 400 KB."); const rd = new FileReader(); rd.onload = () => setPhoto(rd.result); rd.readAsDataURL(f); };
  const send = async () => { setBusy(true); try { await axios.post(`${domain}/site-change-requests`, { locationId: site.id, changes: form, reason, photo }, { showSuccessToast: true }); onSent(); onClose(); } finally { setBusy(false); } };
  return (
    <Modal title={`Request a change to ${site.locationName}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">Fill only the details that are wrong. Back-Admin checks the request and updates the site. Nothing changes until it is approved.</p>
        <div className="grid gap-3 md:grid-cols-2">{FIELDS.map(([k, l]) => <Field key={k} label={`${l} (now: ${site[k] ?? "—"})`}><input className={inputClass} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}</div>
        <Field label="Why does this need to change?"><textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex items-center gap-3"><label className={`${lightBtn} cursor-pointer`}><Camera size={16} /> {photo ? "Change photo" : "Add a photo (optional)"}<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onPhoto} /></label>{photo && <img src={photo} alt="" className="h-12 rounded-lg" />}</div>
        <div className="flex justify-end gap-2"><button className={lightBtn} onClick={onClose}>Cancel</button><button className={darkBtn} disabled={busy} onClick={send}>{busy ? "Sending..." : "Send request"}</button></div>
      </div>
    </Modal>
  );
}

// Used on a site's page (any role that covers the site) to raise and follow change requests for that site.
export function SiteChangesPanel({ site }) {
  const admin = localStorage.getItem("role") === "ADMIN";
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(false);
  const load = useCallback(() => axios.get(`${domain}/site-change-requests`, { params: { locationId: site.id } }).then(({ data }) => setRows(data.requests || [])), [site.id]);
  useEffect(() => { load(); }, [load]);
  const canRaise = ["AUDITOR", "SITE_USER", "SITE_INCHARGE"].includes(localStorage.getItem("role"));
  return (
    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Site detail change requests</h2><p className="mt-1 max-w-2xl text-sm text-gray-500">Contact, address, GPS and supply details are Back-Admin master data. Ask for a correction here, with a reason and an optional photo.</p></div>
        {canRaise && <button className={darkBtn} onClick={() => setOpen(true)}><Plus size={16} /> Request a change</button>}</div>
      {rows.length === 0 ? <p className="text-sm text-gray-500">No change requests for this site.</p> : <ul className="space-y-3">{rows.map((r) => <RequestCard key={r.id} r={r} admin={admin} onDecided={load} />)}</ul>}
      {open && <RequestModal site={site} onClose={() => setOpen(false)} onSent={load} />}
    </section>
  );
}

// Back-Admin queue across every site.
export default function SiteChangeRequests() {
  const [rows, setRows] = useState(null); const [status, setStatus] = useState("PENDING");
  const load = useCallback(() => axios.get(`${domain}/site-change-requests`, { params: { status } }).then(({ data }) => setRows(data.requests || [])), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Site Onboarding" }, { label: "Change Requests" }]} title="Site change requests" subtitle="Corrections to site master data raised by site users and auditors. Approve to apply, or decline with a reason." />
      <div className="mb-4 flex gap-2">{[["PENDING", "Waiting"], ["APPROVED", "Approved"], ["REJECTED", "Declined"]].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`rounded-full px-4 py-2 text-sm ${status === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{l}</button>)}</div>
      {rows === null ? <SkeletonTable rows={4} /> : rows.length === 0 ? <div className={`${cardClass} text-sm text-gray-500`}>No requests here.</div> : <ul className="space-y-3">{rows.map((r) => <RequestCard key={r.id} r={r} admin onDecided={load} />)}</ul>}
    </div>
  );
}
