import { useState } from "react";
import axios from "axios";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import toast from "react-hot-toast";
import domain from "../../api/domain";
import { Modal, darkBtn, lightBtn } from "../siteOnboarding/ui";
import { useConfirm } from "./confirmContext";

const COLORS = { CREATED: "text-[#287a37]", UPDATED: "text-[#1e61ad]", SKIPPED: "text-gray-500", ERROR: "text-[#b42318]" };

// Reusable bulk import for companies, auditors and users: download the sample sheet, check the file (nothing is saved),
// read the row-by-row result, then import. Existing rows are skipped; companies can optionally be updated.
// Imports are additive and repeatable, so a second file adds to what the first one created.
export const ImportButton = ({ onClick, label = "Import from Excel" }) => (
  <button className={lightBtn} onClick={onClick}><FileSpreadsheet size={16} /> {label}</button>
);

export default function ExcelImport({ kind, title, intro, allowUpdate = false, onClose, onDone }) {
  const { confirm } = useConfirm();
  const [file, setFile] = useState(null);
  const [update, setUpdate] = useState(false);
  const [preview, setPreview] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = async () => {
    const res = await axios.get(`${domain}/client-audit-setup/imports/${kind}/template`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-template.xlsx`; a.click(); URL.revokeObjectURL(url);
  };

  const send = async (dryRun) => {
    if (!dryRun && !(await confirm({
      title: `Import these ${kind}?`,
      message: `${preview.totals.created} will be added${allowUpdate && update ? ` and ${preview.totals.updated} updated` : ""}. ${preview.totals.skipped + preview.totals.errors} row(s) will be left out.`,
      points: ["Rows that already exist are never duplicated", "You can import another file later to add more"],
      confirmLabel: "Import now",
    }))) return;
    const form = new FormData();
    form.append("file", file); form.append("dryRun", String(dryRun)); form.append("mode", update ? "UPDATE" : "ADD");
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/imports/${kind}`, form);
      if (dryRun) { setPreview(data); return; }
      toast.success(`${data.totals.created} added${data.totals.updated ? `, ${data.totals.updated} updated` : ""}.`);
      onDone?.(data);
      if (data.credentials?.length) setCredentials(data.credentials); else onClose();
    } finally { setBusy(false); }
  };

  const downloadCredentials = () => {
    const csv = ["Email,Username,One-time password,Role", ...credentials.map((c) => [c.email, c.username, c.password, c.role].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-logins.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const importable = preview && preview.totals.created + preview.totals.updated > 0;

  if (credentials) {
    return (
      <Modal title="Users created" onClose={onClose} wide>
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">These one-time passwords are shown only now. Download them and share each login securely. Everyone must choose a new password at first login.</p>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-[#e1e5ea]">
            {credentials.map((c) => (
              <div key={c.email} className="flex gap-3 border-t border-[#eef0f3] px-3 py-1.5 text-xs first:border-t-0">
                <span className="flex-1 truncate">{c.email}</span><span className="w-32 font-mono tracking-wider">{c.username}</span><span className="w-32 font-mono">{c.password}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2"><button className={lightBtn} onClick={downloadCredentials}><Download size={16} /> Download CSV</button><button className={darkBtn} onClick={onClose}>Done</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">{intro}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={lightBtn} onClick={downloadTemplate}><Download size={16} /> Download sample sheet</button>
          <label className={`${lightBtn} cursor-pointer`}>
            <Upload size={16} /> {file ? file.name : "Choose Excel file"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </label>
        </div>
        {allowUpdate && (
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={update} onChange={(e) => { setUpdate(e.target.checked); setPreview(null); }} /> Update existing rows with the values in the file (blank cells never erase data)
          </label>
        )}
        {preview && (
          <div className="rounded-2xl border border-[#e1e5ea] p-4">
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full bg-[#eaf8ed] px-3 py-1">To add {preview.totals.created}</span>
              {allowUpdate && <span className="rounded-full bg-[#e8f1fd] px-3 py-1">To update {preview.totals.updated}</span>}
              <span className="rounded-full bg-[#f1f1f1] px-3 py-1">Skipped {preview.totals.skipped}</span>
              <span className="rounded-full bg-[#fdecec] px-3 py-1">Errors {preview.totals.errors}</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {preview.results.map((r) => (
                <div key={`${r.line}-${r.key}`} className="flex gap-3 border-t border-[#eef0f3] py-1.5 text-xs">
                  <span className="w-12 text-gray-500">Row {r.line}</span>
                  <span className="w-40 truncate font-medium">{r.key || "—"}</span>
                  <span className={`w-20 ${COLORS[r.status]}`}>{r.status}</span>
                  <span className="flex-1 text-gray-600">{r.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className={lightBtn} onClick={onClose}>Cancel</button>
          {!preview
            ? <button className={darkBtn} disabled={!file || busy} onClick={() => send(true)}>{busy ? "Checking..." : "Check file"}</button>
            : <button className={darkBtn} disabled={!importable || busy} onClick={() => send(false)}>{busy ? "Importing..." : "Import now"}</button>}
        </div>
      </div>
    </Modal>
  );
}
