import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { useConfirm } from "../common/confirmContext";
import domain from "../../api/domain";
import { ROLE_LABEL } from "./roles";
import { Field, Modal, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";

const NEEDS = { CORPORATE_MANAGER: "company", ZONAL_MANAGER: "zone", REGIONAL_MANAGER: "ro", SITE_INCHARGE: "site", SITE_USER: "site" };

// One-time login details, shown once after a user is created or a password is reset.
export function CredentialsModal({ creds, title = "Login details", onClose }) {
  const text = `Username: ${creds.username}\nOne-time password: ${creds.password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); } catch { toast.error("Copy failed - select the text instead"); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>Share these with the user. They sign in with the username (or their email) and must choose their own password at first login. This password is not shown again.</p>
        <div className="rounded-xl bg-[#f3f5f7] p-4 font-mono leading-7">
          <div>Username: <b className="tracking-wider">{creds.username}</b></div>
          <div>One-time password: <b>{creds.password}</b></div>
        </div>
        <div className="flex justify-end gap-2"><button className={lightBtn} onClick={copy}><Copy size={14} /> Copy</button><button className={darkBtn} onClick={onClose}>Done</button></div>
      </div>
    </Modal>
  );
}

// `lock` fixes what the new user can cover: { companyId } for a company page, { companyId, locationId } for a site page.
export default function AddUserModal({ lock = {}, roles = Object.keys(ROLE_LABEL), onClose, onCreated }) {
  const { confirm } = useConfirm();
  const [opts, setOpts] = useState({ companies: [], locations: [] });
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", role: roles[0], companyId: lock.companyId || "", zone: "", ro: "", locationId: lock.locationId || "" });

  useEffect(() => { axios.get(`${domain}/governance/access/options`).then(({ data }) => setOpts(data)); }, []);

  const inCompany = (l) => !form.companyId || l.companyId === form.companyId;
  const zones = useMemo(() => [...new Set(opts.locations.filter(inCompany).map((l) => l.zone))], [opts, form.companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const ros = useMemo(() => [...new Set(opts.locations.filter((l) => inCompany(l) && (!form.zone || l.zone === form.zone)).map((l) => l.regionalOffice))], [opts, form.companyId, form.zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const sites = opts.locations.filter((l) => inCompany(l) && (!form.zone || l.zone === form.zone) && (!form.ro || l.regionalOffice === form.ro));
  const need = NEEDS[form.role];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    const site = opts.locations.find((l) => l.id === form.locationId);
    const scope = { companyId: form.companyId || site?.companyId || "", zone: need === "company" ? "" : form.zone || site?.zone || "", regionalOffice: need === "ro" || need === "site" ? form.ro || site?.regionalOffice || "" : "", locationId: need === "site" ? form.locationId : "" };
    const where = site?.name || (need === "ro" ? `regional office ${form.ro}` : need === "zone" ? `zone ${form.zone}` : opts.companies.find((c) => c.id === form.companyId)?.companyName || "the company");
    if (!(await confirm({ title: "Create this user?", message: `${form.fullName} will be able to see ${where} and everything beneath it.`, points: ["A username and one-time password are generated and shown once", "They must set their own password at first login", "Access can be disabled at any time"], confirmLabel: "Create user" }))) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/governance/access/users`, { fullName: form.fullName, email: form.email, role: form.role, scope });
      setCreds(data.credentials);
      onCreated?.();
    } finally { setBusy(false); }
  };

  if (creds) return <CredentialsModal creds={creds} title="User created" onClose={onClose} />;

  return (
    <Modal title="Add user" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Full name *"><input className={inputClass} value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field><Field label="Email *"><input className={inputClass} value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field></div>
        <Field label="Role"><select className={inputClass} value={form.role} onChange={(e) => set({ role: e.target.value, zone: "", ro: "", locationId: lock.locationId || "" })}>{roles.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}</select></Field>
        {!lock.companyId && <Field label="Company"><select className={inputClass} value={form.companyId} onChange={(e) => set({ companyId: e.target.value, zone: "", ro: "", locationId: "" })}><option value="">Select company</option>{opts.companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}</select></Field>}
        {!lock.locationId && need !== "company" && <Field label="Zone"><select className={inputClass} value={form.zone} onChange={(e) => set({ zone: e.target.value, ro: "", locationId: "" })}><option value="">Select zone</option>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>}
        {!lock.locationId && (need === "ro" || need === "site") && <Field label="Regional office"><select className={inputClass} value={form.ro} onChange={(e) => set({ ro: e.target.value, locationId: "" })}><option value="">Select regional office</option>{ros.map((r) => <option key={r}>{r}</option>)}</select></Field>}
        {!lock.locationId && need === "site" && <Field label="Site"><select className={inputClass} value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}><option value="">Select site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {lock.locationId && <p className="rounded-xl bg-[#f3f5f7] p-3 text-xs text-gray-600">This user will cover {opts.locations.find((l) => l.id === lock.locationId)?.name || "this site"} only.</p>}
        <p className="text-xs text-gray-500">The username is generated automatically (10 characters, like a PAN: five letters, four digits, one letter). The first password is one-time.</p>
        <div className="flex justify-end gap-2"><button className={lightBtn} onClick={onClose}>Cancel</button><button className={darkBtn} disabled={busy || !form.fullName || !form.email} onClick={save}>Create user</button></div>
      </div>
    </Modal>
  );
}
