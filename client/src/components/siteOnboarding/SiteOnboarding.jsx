import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import ExcelImport, { ImportButton } from "../common/ExcelImport";
import { CompanyLogo, Field, Modal, PageTitle, cardClass, darkBtn, inputClass, lightBtn } from "./ui";

const emptyCompany = { companyName: "", email: "", address: "", contactName: "", contactPhone: "", logoUrl: "" };

export default function SiteOnboarding() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyCompany);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    try {
      const { data } = await axios.get(`${domain}/client-audit-setup/companies/overview`);
      setCompanies(data.companies || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 200 * 1024) {
      toast.error("Choose an image smaller than 200 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logoUrl: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.companyName.trim()) return toast.error("Company name is required.");
    setSaving(true);
    try {
      await axios.post(`${domain}/company/create-company`, form, { showSuccessToast: true });
      setShowAdd(false);
      setForm(emptyCompany);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Site Onboarding" }]}
        title="Companies"
        subtitle="Select a company to see its sites, add sites, or import them from Excel."
        actions={<><ImportButton label="Import companies" onClick={() => setShowImport(true)} /><button className={darkBtn} onClick={() => setShowAdd(true)}><Plus size={16} /> Add Company</button></>}
      />

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : companies.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <Building2 className="mx-auto mb-2 text-gray-500" />
          <p className="text-sm text-gray-500">No companies yet. Add the first one to start onboarding sites.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => navigate(`/admin-dashboard/site-onboarding/${company.id}`)}
              className="group rounded-3xl bg-white p-5 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
            >
              <CompanyLogo company={company} />
              <h3 className="mt-4 text-base font-semibold text-[#20242c]">{company.companyName}</h3>
              <p className="mt-1 truncate text-xs text-gray-500">{company.address || company.email || "No address added"}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-[#f3f5f7] py-2"><div className="text-base font-semibold">{company.siteCount}</div>Sites</div>
                <div className="rounded-xl bg-[#fff6e8] py-2"><div className="text-base font-semibold">{company.draftCount}</div>Drafts</div>
                <div className="rounded-xl bg-[#e8f1fd] py-2"><div className="text-base font-semibold">{company.submittedCount}</div>In review</div>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex min-h-[200px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#CECECE] text-sm text-gray-500 hover:border-[#63C174] hover:text-[#287a37]"
          >
            <Plus size={28} /> Add company
          </button>
        </div>
      )}

      {showAdd && (
        <Modal  title="Add company" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <CompanyLogo company={{ companyName: form.companyName || "?", logoUrl: form.logoUrl }} />
              <label className={`${lightBtn} cursor-pointer`}>
                Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
              </label>
            </div>
            <Field label="Company name *"><input className={inputClass} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="M&M - NORTH" /></Field>
            <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Address"><textarea rows="2" className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact name"><input className={inputClass} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
              <Field label="Contact phone"><input className={inputClass} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className={lightBtn} onClick={() => setShowAdd(false)}>Cancel</button>
              <button className={darkBtn} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save company"}</button>
            </div>
          </div>
        </Modal>
      )}
      {showImport && <ExcelImport kind="companies" title="Import companies from Excel" intro="One row per company (name, contact, address, PO number). Companies that already exist are skipped, or updated if you tick the option. Add each company's sites afterwards from its own page." allowUpdate onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
