import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Building2, Pencil, Plus } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import ExcelImport, { ImportButton } from "../common/ExcelImport";
import { CompanyLogo, Field, Modal, PageTitle, SkeletonCard, cardClass, darkBtn, inputClass, lightBtn } from "./ui";

const emptyCompany = { companyName: "", email: "", address: "", contactName: "", contactPhone: "", logoUrl: "" };

export default function SiteOnboarding() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [form, setForm] = useState(emptyCompany);
  const [errors, setErrors] = useState({});
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

  const closeModal = () => {
    setShowModal(false);
    setEditingCompany(null);
    setForm(emptyCompany);
    setErrors({});
  };

  const openAdd = () => {
    setEditingCompany(null);
    setForm(emptyCompany);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (company) => {
    setEditingCompany(company);
    setForm({
      companyName: company.companyName || "",
      email: company.email || "",
      address: company.address || "",
      contactName: company.contactName || "",
      contactPhone: company.contactPhone || "",
      logoUrl: company.logoUrl || "",
    });
    setErrors({});
    setShowModal(true);
  };

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
    if (!form.companyName?.trim()) {
      setErrors({ companyName: "Company name is required." });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (editingCompany) {
        await axios.put(`${domain}/company/updateCompany/${editingCompany.id}`, form, { showSuccessToast: true });
      } else {
        await axios.post(`${domain}/company/create-company`, form, { showSuccessToast: true });
      }
      closeModal();
      await load();
    } catch (error) {
      const msg = error.response?.data?.message || (editingCompany ? "Failed to update company" : "Failed to create company");
      setErrors({ companyName: msg });
      toast.error(msg);
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
        actions={<><ImportButton label="Import companies" onClick={() => setShowImport(true)} /><button className={darkBtn} onClick={openAdd}><Plus size={16} /> Add Company</button></>}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <Building2 className="mx-auto mb-2 text-gray-500" />
          <p className="text-sm text-gray-500">No companies yet. Add the first one to start onboarding sites.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {companies.map((company) => (
            <div
              key={company.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/admin-dashboard/site-onboarding/${company.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/admin-dashboard/site-onboarding/${company.id}`);
                }
              }}
              className="group relative flex flex-col justify-between rounded-3xl bg-white p-5 text-left shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#30733b]/30"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <CompanyLogo company={company} />
                  <button
                    type="button"
                    title="Edit company"
                    aria-label={`Edit ${company.companyName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(company);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 hover:shadow-sm"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#20242c]">{company.companyName}</h3>
                <p className="mt-1 truncate text-xs text-gray-500">{company.address || company.email || "No address added"}</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-[#f3f5f7] py-2"><div className="text-base font-semibold">{company.siteCount}</div>Sites</div>
                <div className="rounded-xl bg-[#fff6e8] py-2"><div className="text-base font-semibold">{company.draftCount}</div>Drafts</div>
                <div className="rounded-xl bg-[#e8f1fd] py-2"><div className="text-base font-semibold">{company.submittedCount}</div>In review</div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={openAdd}
            className="flex min-h-[200px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#CECECE] text-sm text-gray-500 hover:border-[#63C174] hover:text-[#287a37]"
          >
            <Plus size={28} /> Add company
          </button>
        </div>
      )}

      {showModal && (
        <Modal title={editingCompany ? "Edit company" : "Add company"} onClose={closeModal}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <CompanyLogo company={{ companyName: form.companyName || "?", logoUrl: form.logoUrl }} />
              <div className="flex flex-col gap-1">
                <label className={`${lightBtn} cursor-pointer`}>
                  {form.logoUrl ? "Change logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
                {form.logoUrl && (
                  <button
                    type="button"
                    className="text-left text-xs text-red-500 hover:text-red-700 hover:underline"
                    onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
            <Field label="Company name *" error={errors.companyName}>
              <input
                className={`${inputClass} ${errors.companyName ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500/20" : ""}`}
                value={form.companyName}
                onChange={(e) => {
                  setForm({ ...form, companyName: e.target.value });
                  if (errors.companyName) setErrors((prev) => ({ ...prev, companyName: "" }));
                }}
                placeholder="M&M - NORTH"
              />
            </Field>
            <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Address"><textarea rows="2" className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact name"><input className={inputClass} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
              <Field label="Contact phone"><input className={inputClass} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className={lightBtn} onClick={closeModal}>Cancel</button>
              <button className={darkBtn} disabled={saving} onClick={save}>
                {saving ? "Saving..." : (editingCompany ? "Save changes" : "Save company")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showImport && <ExcelImport kind="companies" title="Import companies from Excel" intro="One row per company (name, contact, address, PO number). Companies that already exist are skipped, or updated if you tick the option. Add each company's sites afterwards from its own page." allowUpdate onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
