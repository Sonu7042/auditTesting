import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { Download, FileSpreadsheet, MapPin, Plus, Search, Upload } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { useConfirm } from "../common/confirmContext";
import UsersPanel from "../governance/UsersPanel";
import { SiteLink } from "../auditFlow/SiteTrail";
import { CompanyLogo, Modal, PageTitle, ProgressBar, StatusPill, cardClass, darkBtn, inputClass, lightBtn } from "./ui";

const FACILITY_LABELS = { SHOWROOM: "Showroom", WORKSHOP: "Workshop", STOCKYARD: "Stockyard" };

export default function CompanySites() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [sites, setSites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data } = await axios.get(`${domain}/client-audit-setup/companies/${companyId}/sites`);
    setCompany(data.company); setSites(data.sites || []); setRequests(data.requests || []);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const addSite = async () => {
    setCreating(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/site-requests`, { companyId });
      navigate(`/admin-dashboard/site-onboarding/request/${data.request.id}`);
    } finally { setCreating(false); }
  };

  const q = search.trim().toLowerCase();
  const match = (...values) => !q || values.some((v) => String(v || "").toLowerCase().includes(q));
  const shownSites = sites.filter((s) => match(s.locationName, s.locationCode, s.dealerName, s.zone, s.regionalOffice, s.sapCode));
  const shownRequests = requests.filter((r) => match(r.locationName, r.locationCode, r.dealerName, r.zone));

  if (!company) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Site Onboarding", to: "/admin-dashboard/site-onboarding" }, { label: company.companyName }]}
        title={company.companyName}
        subtitle={`${sites.length} live sites • ${requests.length} in set-up`}
        actions={
          <>
            <button className={lightBtn} onClick={() => setShowImport(true)}><FileSpreadsheet size={16} /> Import from Excel</button>
            <button className={darkBtn} disabled={creating} onClick={addSite}><Plus size={16} /> Add Site</button>
          </>
        }
      />
      <div className="mb-5 flex items-center gap-3">
        <CompanyLogo company={company} size="h-10 w-10" />
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className={`${inputClass} !mt-0 pl-9`} placeholder="Search by name, code, zone or RO" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {shownRequests.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Site set-up in progress</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shownRequests.map((r) => (
              <button key={r.id} type="button" onClick={() => navigate(`/admin-dashboard/site-onboarding/request/${r.id}`)} className="rounded-2xl bg-white p-4 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.locationName || "Untitled site"}</div>
                    <div className="text-xs text-gray-500">{r.locationCode || "No code yet"}{r.regionalOffice ? ` • ${r.regionalOffice}` : ""}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
                <div className="mt-3"><ProgressBar value={r.readiness} /></div>
                <div className="mt-1 flex justify-between text-xs text-gray-500 gap-3"><span>Ready for audit {r.readiness}%</span>{r.source === "EXCEL" && <span>Excel</span>}</div>
                {r.status === "RETURNED" && r.reviewRemarks && <p className="mt-2 rounded-lg bg-[#fff3e0] p-2 text-xs text-[#9a5200]">{r.reviewRemarks}</p>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Live sites</h2>
        {shownSites.length === 0 ? (
          <div className={`${cardClass} text-center text-sm text-gray-500`}>
            {sites.length === 0 ? "No live sites yet. Add a site or import an Excel file; Back-Admin review makes it live." : "No sites match your search."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
            <table className="w-full text-sm">
              <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500">
                <tr><th className="min-w-[220px] p-3">Site</th><th className="min-w-[130px]">Code</th><th className="min-w-[110px]">Zone / RO</th><th className="min-w-[200px]">Facilities</th><th className="min-w-[110px]">Ready</th></tr>
              </thead>
              <tbody>
                {shownSites.map((s) => (
                  <tr key={s.id} className="border-t border-[#e4e8ed]">
                    <td className="p-3"><SiteLink site={{ ...s, companyId: company.id, company: company.companyName }} /><div className="flex items-center gap-1 text-xs text-gray-500"><MapPin size={12} />{s.city || s.state || "—"}</div></td>
                    <td className="whitespace-nowrap text-xs">{s.locationCode}{s.sapCode ? <div className="text-gray-500">SAP {s.sapCode}</div> : null}</td>
                    <td className="text-xs">{s.zone}<div className="text-gray-500">{s.regionalOffice}</div></td>
                    <td><div className="flex flex-wrap gap-1">{s.facilities.map((f) => <span key={f.id} className="whitespace-nowrap rounded-full bg-[#eaf8ed] px-2 py-0.5 text-xs text-[#287a37]">{FACILITY_LABELS[f.facilityType]}{f.tier ? ` · ${f.tier}` : ""}</span>)}</div></td>
                    <td className="w-32 pr-3"><ProgressBar value={100} /><div className="mt-1 text-xs text-gray-500">100%</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6">
        <UsersPanel
          title="Company users"
          subtitle={`People at ${company.companyName} who sign in to this portal. Pick the level when adding: corporate for the whole company, or a zone, regional office or single site. Each gets a generated username and a one-time password.`}
          url={`/governance/access/users?companyId=${companyId}`}
          lock={{ companyId }}
          emptyText="No users for this company yet."
        />
      </div>

      {showImport && <ImportModal companyId={companyId} onClose={() => { setShowImport(false); load(); }} />}
    </div>
  );
}

function ImportModal({ companyId, onClose }) {
  const { confirm } = useConfirm();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [update, setUpdate] = useState(false);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = async () => {
    const res = await axios.get(`${domain}/client-audit-setup/site-requests/template`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = "site-setup-template.xlsx"; a.click();
    URL.revokeObjectURL(url);
  };

  const send = async (dryRun) => {
    const form = new FormData();
    if (!dryRun && !(await confirm({ title: "Import these sites?", message: `${preview.totals.ready} complete and ${preview.totals.incomplete} incomplete row(s) will be added.`, points: [`${preview.totals.ready} go straight to Back-Admin review`, `${preview.totals.incomplete} become drafts to finish`, `${preview.totals.skipped} existing site(s) are skipped, never overwritten`], confirmLabel: "Import now" }))) return;
    form.append("file", file); form.append("companyId", companyId); form.append("dryRun", String(dryRun)); form.append("mode", update ? "UPDATE" : "ADD");
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/site-requests/import`, form);
      if (dryRun) setPreview(data);
      else { toast.success(`${data.totals.ready + data.totals.incomplete} site(s) added for review${data.totals.updated ? `, ${data.totals.updated} updated` : ""}.`); onClose(); }
    } finally { setBusy(false); }
  };

  const colors = { UPDATED: "text-[#1e61ad]", UNCHANGED: "text-gray-500", READY: "text-[#287a37]", INCOMPLETE: "text-[#9a5200]", SKIPPED: "text-gray-500", ERROR: "text-[#b42318]" };
  const saveable = preview && preview.totals.ready + preview.totals.incomplete + (preview.totals.updated || 0) > 0;

  return (
    <Modal title="Import sites from Excel" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">One workbook can hold everything: a row per site (details, facilities, scope, checklist version) plus the Manpower, Tools and Users sheets. Download the template, fill it, and upload it. Existing location codes are skipped, never overwritten. Complete rows go to Back-Admin review; incomplete rows become drafts.</p>
        <button className={lightBtn} onClick={downloadTemplate}><Download size={16} /> Download template</button>
        <div>
          <label className={`${lightBtn} cursor-pointer`}>
            <Upload size={16} /> {file ? file.name : "Choose Excel file"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={update} onChange={(e) => { setUpdate(e.target.checked); setPreview(null); }} /> Update live sites that already exist (matched by Location Code). Blank cells never erase data.
        </label>
        {preview && (
          <div className="rounded-2xl border border-[#e1e5ea] p-4">
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full bg-[#eaf8ed] px-3 py-1">Ready {preview.totals.ready}</span>
              {update && <span className="rounded-full bg-[#e8f1fd] px-3 py-1">To update {preview.totals.updated}</span>}
              <span className="rounded-full bg-[#fff6e8] px-3 py-1">Incomplete {preview.totals.incomplete}</span>
              <span className="rounded-full bg-[#f1f1f1] px-3 py-1">Skipped {preview.totals.skipped}</span>
              <span className="rounded-full bg-[#fdecec] px-3 py-1">Errors {preview.totals.errors}</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {preview.results.map((r) => (
                <div key={r.line} className="flex gap-3 border-t border-[#eef0f3] py-1.5 text-xs">
                  <span className="w-12 text-gray-500">Row {r.line}</span>
                  <span className="w-28 truncate font-medium">{r.code || "—"}</span>
                  <span className={`w-20 ${colors[r.status]}`}>{r.status}</span>
                  <span className="flex-1 text-gray-600">{r.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className={lightBtn} onClick={onClose}>Cancel</button>
          {!preview ? (
            <button className={darkBtn} disabled={!file || busy} onClick={() => send(true)}>{busy ? "Checking..." : "Check file"}</button>
          ) : (
            <button className={darkBtn} disabled={!saveable || busy} onClick={() => send(false)}>{busy ? "Importing..." : "Import now"}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
