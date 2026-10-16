import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { KeyRound, Plus } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import domain from "../../api/domain";
import { SkeletonTable, cardClass, darkBtn } from "../siteOnboarding/ui";
import ExcelImport, { ImportButton } from "../common/ExcelImport";
import AddUserModal, { CredentialsModal } from "./AddUserModal";
import { ROLE_LABEL } from "./roles";

// Users with access to a company or a site: list, add (generated username + one-time password), reset password, disable.
export default function UsersPanel({ title, subtitle, url, lock, roles, emptyText = "No users yet." }) {
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState(null);
  const [importing, setImporting] = useState(false);
  const { confirm } = useConfirm();

  const load = useCallback(() => axios.get(`${domain}${url}`).then(({ data }) => setUsers(data.users || [])), [url]);
  useEffect(() => { axios.get(`${domain}${url}`).then(({ data }) => setUsers(data.users || [])); }, [url]);

  const reset = async (u) => {
    if (!(await confirm({ title: `Reset ${u.fullName}'s password?`, message: "A new one-time password is generated. The old password stops working and they must choose a new one at next login.", confirmLabel: "Reset password" }))) return;
    const { data } = await axios.post(`${domain}/governance/access/users/${u.id}/reset-password`);
    setCreds(data.credentials);
  };
  const toggle = async (u) => {
    if (!(await confirm({ title: u.status ? `Disable ${u.fullName}?` : `Re-enable ${u.fullName}?`, tone: u.status ? "danger" : "primary", message: u.status ? "They can no longer log in. Their records stay." : "They can log in again and see the same part of the network.", confirmLabel: u.status ? "Disable user" : "Enable user" }))) return;
    await axios.patch(`${domain}/governance/access/users/${u.id}/status`, { status: !u.status });
    load();
  };

  return (
    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2"><ImportButton label="Import users" onClick={() => setImporting(true)} /><button className={darkBtn} onClick={() => setAdding(true)}><Plus size={16} /> Add user</button></div>
      </div>
      {users === null ? <SkeletonTable rows={4} /> : users.length === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="min-w-[200px] py-2">Name</th><th className="min-w-[130px]">Role</th><th className="min-w-[110px]">Username</th><th>Status</th><th /></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id} className="border-t border-[#eef0f3]">
                <td className="py-2"><div className="font-medium">{u.fullName}</div><div className="text-xs text-gray-500">{u.email}{u.level ? ` · via ${u.level.toLowerCase()}` : ""}</div></td>
                <td className="text-xs">{ROLE_LABEL[u.role] || u.role}</td>
                <td className="font-mono text-xs tracking-wider">{u.username}</td>
                <td><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${u.status ? "bg-[#eaf8ed] text-[#287a37]" : "bg-[#f1f1f1]"}`}>{u.status ? "Active" : "Disabled"}</span></td>
                <td className="whitespace-nowrap pr-1 text-right text-xs"><button className="mr-3 inline-flex items-center gap-1 underline" onClick={() => reset(u)}><KeyRound size={12} /> Reset password</button><button className="underline" onClick={() => toggle(u)}>{u.status ? "Disable" : "Enable"}</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {importing && <ExcelImport kind="users" title="Import users from Excel" intro="One row per person: role, name, email, company, and the zone, regional office or site code that decides what they can see. Each gets a generated username and one-time password, shown once after the import." onClose={() => setImporting(false)} onDone={load} />}
      {adding && <AddUserModal lock={lock} roles={roles} onClose={() => setAdding(false)} onCreated={load} />}
      {creds && <CredentialsModal creds={creds} title="New one-time password" onClose={() => setCreds(null)} />}
    </section>
  );
}
