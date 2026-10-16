import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Plus, Save, Search, Send, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { useConfirm } from "../common/confirmContext";
import { Field, Modal, PageTitle, ProgressBar, Skeleton, StatusPill, cardClass, darkBtn, inputClass, lightBtn } from "./ui";

const FACILITIES = {
  SHOWROOM: { label: "Showroom", tiers: ["MADB", "CUBE", "SMART"] },
  WORKSHOP: { label: "Workshop", tiers: ["Main Dealer Workshop", "Stand-Alone Accidental Workshop", "SMART Workshop"] },
  STOCKYARD: { label: "Stockyard", tiers: ["Standard"] },
};
const DISCIPLINES = [["INFRA", "Infrastructure"], ["FIRE", "Fire & Life Safety"], ["ELECTRICAL", "Electrical"], ["THERMOGRAPHY", "Thermography"]];
const SHARED = [["GATE", "Entry gate & perimeter"], ["PARK", "Customer parking"], ["ACC", "Accessibility route"], ["IT", "DMS / Wi-Fi / CCTV"], ["WASH", "Washing bay"]];
const VOLUMES = [["showroomAreaSqFt", "Showroom area (sq ft)"], ["monthlyPvRetail", "Avg monthly PV retail"], ["testDrivesPerDay", "Test drives per day"], ["mechanicalRos", "Mechanical ROs (3 months)"], ["bodyshopRos", "Bodyshop ROs (3 months)"], ["mechanicalBays", "Mechanical bays"], ["vehiclesWashedPerDay", "Vehicles washed per day"]];
const STEPS = [
  { key: "identity", label: "Identity & territory" },
  { key: "location", label: "Location & contacts" },
  { key: "facilities", label: "Facilities & profile" },
  { key: "scope", label: "Audit scope" },
  { key: "checklist", label: "Checklist" },
  { key: "tools", label: "Tools register" },
  { key: "volumes", label: "Manpower & volumes" },
  { key: "access", label: "Access (users)" },
  { key: "review", label: "Review & submit" },
];
const ROLE_LABEL = { CORPORATE_MANAGER: "Corporate manager (whole company)", ZONAL_MANAGER: "Zonal manager (this zone)", REGIONAL_MANAGER: "Regional manager (this office)", SITE_INCHARGE: "Site in-charge (this site)", SITE_USER: "Site user (this site)" };

const blank = {
  identity: {}, location: { geofenceRadiusM: 200 },
  facilities: { items: [], electricalSupplyType: "LT supply", sharedMappings: [] },
  scope: {}, volumes: {}, manpower: [], tools: [], access: [], checklist: null,
};

export default function SiteSetupWizard() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [data, setData] = useState(blank);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { confirm, ask } = useConfirm();
  const [remarks, setRemarks] = useState("");
  const [versions, setVersions] = useState([]);
  const [pickerText, setPickerText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creds, setCreds] = useState(null);
  const [upName, setUpName] = useState({ name: "", version: "" });

  const apply = useCallback((req) => {
    setRequest(req);
    setData({ ...blank, ...req.data, facilities: { ...blank.facilities, ...req.data?.facilities } });
  }, []);

  useEffect(() => {
    axios.get(`${domain}/client-audit-setup/site-requests/${requestId}`).then(({ data: res }) => {
      apply(res.request);
      if (res.request.status === "SUBMITTED") setStep(STEPS.length);
    });
  }, [requestId, apply]);

  useEffect(() => {
    if (!request?.companyId) return;
    axios.get(`${domain}/client-audit-setup/companies/${request.companyId}/checklists`).then(({ data: res }) => setVersions(res.versions || []));
  }, [request?.companyId]);

  const editable = request && ["DRAFT", "RETURNED"].includes(request.status);
  const sections = request?.readinessSections || [];
  const done = (key) => sections.find((s) => s.key === key)?.complete;
  const hasWorkshop = data.facilities.items.some((i) => i.facilityType === "WORKSHOP");
  const visibleSteps = STEPS.filter((s) => s.key !== "tools" || hasWorkshop);
  const current = visibleSteps[Math.min(step, visibleSteps.length - 1)];
  const backPath = request ? `/admin-dashboard/site-onboarding/${request.companyId}` : "/admin-dashboard/site-onboarding";

  const setIn = (group, field, value) => setData((d) => ({ ...d, [group]: { ...d[group], [field]: value } }));
  const setFac = (field, value) => setData((d) => ({ ...d, facilities: { ...d.facilities, [field]: value } }));

  const save = async (quiet = false) => {
    if (!editable) return true;
    setSaving(true);
    try {
      const { data: res } = await axios.put(`${domain}/client-audit-setup/site-requests/${requestId}`, { data });
      setRequest((r) => ({ ...r, ...res.request, company: r.company }));
      if (!quiet) toast.success("Saved");
      return true;
    } catch { return false; } finally { setSaving(false); }
  };

  const go = async (next) => { if (await save(true)) setStep(Math.max(0, Math.min(next, visibleSteps.length - 1))); };

  const act = async (action, body = {}) => {
    const site = data.identity.locationName || "this site";
    const chosen = versions.find((v) => v.id === data.checklist?.versionId);
    if (action === "submit") {
      const ok = await confirm({ title: "Submit this site for review?", message: `${site} will be sent to Back-Admin and locked for editing while it is reviewed.`,
        points: ["Back-Admin checks every section", "They can approve it, return it with remarks, or reject it", "Only an approved site goes live and can be scheduled"], confirmLabel: "Submit for review" });
      if (!ok) return;
      if (!(await save(true))) return;
    }
    if (action === "approve") {
      const n = (data.access || []).length;
      const ok = await confirm({ title: "Approve and create this site?", message: `${site} will go live in the network. This cannot be undone from this screen.`,
        points: ["The site and its facilities are created", chosen ? `Checklist ${chosen.name} v${chosen.version} is frozen for this site` : "No checklist is attached yet", n ? `${n} user(s) get access and their login details are shown once` : "No users are added; add them later in Access & Roles", "The site becomes available for scheduling"], confirmLabel: "Approve & create site" });
      if (!ok) return;
    }
    if (action === "return") {
      const reason = await ask({ title: "Return this site for changes?", message: "It goes back to draft so the details can be corrected, then submitted again.", input: { label: "What needs to change?", required: true, defaultValue: body.remarks || "" }, confirmLabel: "Return for changes" });
      if (!reason) return;
      body = { ...body, remarks: reason };
    }
    if (action === "reject") {
      const reason = await ask({ title: "Reject this site?", tone: "danger", message: "Rejecting closes this request. The submitter would have to start a new one.", input: { label: "Reason for rejecting", required: true, defaultValue: body.remarks || "" }, confirmLabel: "Reject site" });
      if (!reason) return;
      body = { ...body, remarks: reason };
    }
    setSaving(true);
    try {
      const { data: res } = await axios.post(`${domain}/client-audit-setup/site-requests/${requestId}/${action}`, body, { showSuccessToast: true });
      if (action === "approve" && res.credentials?.length) setCreds(res.credentials);
      else if (action === "submit" || action === "approve" || action === "return" || action === "reject") navigate(backPath);
      else apply(res.request);
    } finally { setSaving(false); }
  };

  const discard = async () => {
    if (!(await confirm({ title: "Discard this draft?", tone: "danger", message: "Everything entered for this site will be deleted.", points: ["This cannot be undone", "Uploaded workbooks are not kept"], confirmLabel: "Discard draft", cancelLabel: "Keep editing" }))) return;
    await axios.delete(`${domain}/client-audit-setup/site-requests/${requestId}`);
    navigate(backPath);
  };

  const toggleFacility = (type) => {
    const exists = data.facilities.items.some((i) => i.facilityType === type);
    const items = exists
      ? data.facilities.items.filter((i) => i.facilityType !== type)
      : [...data.facilities.items, { facilityType: type, tier: "", ciLevel: "CI 2024-25", format: "", workshopType: type === "WORKSHOP" ? "Mechanical + Bodyshop" : "", stockyardType: type === "STOCKYARD" ? "Standard" : "", sellsPv: true, sellsBev: false, sellsCv: false, isActive: true }];
    const scope = { ...data.scope };
    if (exists) delete scope[type];
    setData((d) => ({ ...d, facilities: { ...d.facilities, items }, scope }));
  };
  const setItem = (type, field, value) => setFac("items", data.facilities.items.map((i) => (i.facilityType === type ? { ...i, [field]: value } : i)));
  const mapping = (code) => data.facilities.sharedMappings.find((m) => m.facilityCode === code) || { facilityCode: code, enabled: false, arrangement: "SHARED", usedBy: data.facilities.items.map((i) => i.facilityType), quantity: 1, auditAtSite: true };
  const setMapping = (code, patch) => {
    const next = { ...mapping(code), ...patch, description: SHARED.find(([c]) => c === code)[1] };
    setFac("sharedMappings", [...data.facilities.sharedMappings.filter((m) => m.facilityCode !== code), next]);
  };
  const toggleScope = (type, d) => setData((x) => ({ ...x, scope: { ...x.scope, [type]: { ...x.scope[type], [d]: !x.scope[type]?.[d] } } }));
  const rowSet = (group, index, field, value) => setData((x) => ({ ...x, [group]: x[group].map((r, i) => (i === index ? { ...r, [field]: value } : r)) }));
  const rowAdd = (group, row) => setData((x) => ({ ...x, [group]: [...x[group], row] }));
  const rowDel = (group, index) => setData((x) => ({ ...x, [group]: x[group].filter((_, i) => i !== index) }));

  const fillFromExcel = async (file) => {
    if (!file) return;
    if (!(await confirm({ title: "Fill every step from this workbook?", message: `${file.name} will replace what is already entered in this site's steps.`, points: ["Site details, facilities, scope, tools, manpower and users come from the workbook", "The checklist version in the workbook is used when it names one", "You can still edit each step afterwards"], confirmLabel: "Replace with workbook" }))) return;
    const f = new FormData(); f.append("file", file);
    setSaving(true);
    try { const { data: res } = await axios.post(`${domain}/client-audit-setup/site-requests/${requestId}/fill-from-excel`, f, { showSuccessToast: true }); apply(res.request); } finally { setSaving(false); }
  };
  const uploadRegisters = async (file, mode) => {
    if (!file) return;
    if (mode === "replace" && !(await confirm({ title: "Replace the existing rows?", tone: "danger", message: "All current tools and manpower rows will be removed and replaced by the workbook.", confirmLabel: "Replace rows" }))) return;
    const f = new FormData(); f.append("file", file); f.append("mode", mode);
    setSaving(true);
    try { const { data: res } = await axios.post(`${domain}/client-audit-setup/site-requests/${requestId}/registers`, f, { showSuccessToast: true }); apply(res.request); } finally { setSaving(false); }
  };
  const downloadFile = async (path, name) => {
    const res = await axios.get(`${domain}/client-audit-setup/${path}`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const uploadChecklist = async (file) => {
    if (!file) return;
    if (!upName.name.trim() || !upName.version.trim()) return toast.error("Give the uploaded checklist a name and version first.");
    if (!(await confirm({ title: "Publish this checklist to the library?", message: `${upName.name} v${upName.version} will be published and locked, then used for this site.`, points: ["Other sites can pick it from the library", "Published checklists cannot be edited; changes need a new version", "Questions with errors are skipped"], confirmLabel: "Upload & publish" }))) return;
    const f = new FormData(); f.append("file", file); f.append("name", upName.name); f.append("version", upName.version);
    setSaving(true);
    try {
      const { data: res } = await axios.post(`${domain}/client-audit-setup/companies/${request.companyId}/checklists/upload`, f, { showSuccessToast: true });
      setVersions((v) => [{ ...res.version, publishedAt: new Date().toISOString() }, ...v]);
      setData((d) => ({ ...d, checklist: { versionId: res.version.id } }));
    } finally { setSaving(false); }
  };
  const readiness = request?.readiness ?? 0;
  const facilityTypes = useMemo(() => data.facilities.items.map((i) => i.facilityType), [data.facilities.items]);
  if (!request) {
    return (
      <div>
        <Header />
        <div className={`mb-6 ${cardClass}`}>
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-72 mb-2" />
          <Skeleton className="h-4 w-60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`${cardClass} space-y-4`}>
            <Skeleton className="h-6 w-1/3 mb-4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className={`${cardClass} space-y-4`}>
            <Skeleton className="h-6 w-1/3 mb-4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const id = data.identity; const loc = data.location;
  const text = (group, field, label, extra = {}) => (
    <Field label={label} span={extra.span}>
      <input type={extra.type || "text"} disabled={!editable} className={inputClass} value={data[group][field] ?? ""} onChange={(e) => setIn(group, field, e.target.value)} placeholder={extra.placeholder} />
    </Field>
  );

  return (
    <div>
      <Header />
      <PageTitle
        crumbs={[{ label: "Site Onboarding", to: "/admin-dashboard/site-onboarding" }, { label: request.company?.companyName || "Company", to: backPath }, { label: id.locationName || "New site" }]}
        title={id.locationName || "New site set-up"}
        subtitle={request.status === "SUBMITTED" ? "Submitted — Back-Admin review" : "Complete each section. You can save and return at any time."}
        actions={<StatusPill status={request.status} />}
      />
      {editable && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-[#9bc9a3] bg-[#f5fcf6] p-4 text-sm">
          <FileSpreadsheet size={20} className="text-[#287a37]" />
          <div className="min-w-[220px] flex-1">Have everything in one workbook? Upload it to fill every step at once: site details, facilities, scope, checklist, tools, manpower and users.</div>
          <button className={lightBtn} onClick={() => downloadFile("site-requests/template", "site-setup-template.xlsx")}><Download size={15} /> Template</button>
          <label className={`${darkBtn} cursor-pointer`}><Upload size={15} /> Fill from Excel<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { fillFromExcel(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </div>
      )}
      {request.status === "RETURNED" && request.reviewRemarks && (
        <div className="mb-5 rounded-2xl border border-[#f5d9a8] bg-[#fff8ec] p-4 text-sm text-[#7a4f00]"><b>Returned by reviewer:</b> {request.reviewRemarks}</div>
      )}
      {request.status === "REJECTED" && request.reviewRemarks && (
        <div className="mb-5 rounded-2xl border border-[#f3c3c0] bg-[#fdecec] p-4 text-sm text-[#b42318]"><b>Rejected:</b> {request.reviewRemarks}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className={`${cardClass} h-fit`}>
          <div className="mb-1 flex items-baseline justify-between gap-3"><span className="text-sm font-semibold">Ready for audit</span><span className="text-lg font-semibold text-[#287a37]">{readiness}%</span></div>
          <ProgressBar value={readiness} />
          <ol className="mt-5 space-y-1">
            {visibleSteps.map((s, index) => {
              const complete = s.key === "review" ? readiness === 100 : done(s.key);
              const active = current.key === s.key;
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => go(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-[#f0f6f1] font-semibold" : "hover:bg-[#f7f7f7]"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${complete ? "border-[#63C174] bg-[#63C174] text-white" : active ? "border-[#181919]" : "border-gray-300 text-gray-500"}`}>
                      {complete ? <Check size={14} /> : index + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className={cardClass}>
          <h2 className="mb-5 text-lg font-semibold">{visibleSteps.indexOf(current) + 1}. {current.label}</h2>

          {current.key === "identity" && (
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
              {text("identity", "dealerName", "Dealership name *")}
              {text("identity", "dealerCode", "Dealer code *")}
              {text("identity", "category", "Dealer category (A/B/C)")}
              {text("identity", "locationName", "Location name *")}
              {text("identity", "locationCode", "Location code *")}
              {text("identity", "sapCode", "SAP code")}
              {text("identity", "parentCode", "Parent code")}
              {text("identity", "madbCode", "MADB code")}
              {text("identity", "retailFormat", "Retail format")}
              {text("identity", "zone", "Zone *")}
              {text("identity", "regionalOffice", "Regional office *")}
              {text("identity", "state", "State *")}
              {text("identity", "district", "District")}
              {text("identity", "city", "City / town *")}
              {text("identity", "cityClassification", "City classification")}
            </div>
          )}

          {current.key === "location" && (
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
              <Field label="Full address *" span="md:col-span-3"><textarea rows="2" disabled={!editable} className={inputClass} value={loc.address ?? ""} onChange={(e) => setIn("location", "address", e.target.value)} /></Field>
              {text("location", "latitude", "Latitude *", { type: "number" })}
              {text("location", "longitude", "Longitude *", { type: "number" })}
              {text("location", "geofenceRadiusM", "Geofence radius (m) *", { type: "number" })}
              {text("location", "contactName", "Dealer principal / GM *")}
              {text("location", "contactPhone", "Scheduling contact phone *")}
              {text("location", "contactEmail", "Scheduling contact email *")}
              <p className="text-xs text-gray-500 md:col-span-3">The contact receives the dealer notices at scheduling, T-7, T-3 and T-1. Auditor check-in is only allowed inside the geofence.</p>
            </div>
          )}

          {current.key === "facilities" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
                {Object.entries(FACILITIES).map(([type, cfg]) => {
                  const item = data.facilities.items.find((i) => i.facilityType === type);
                  return (
                    <div key={type} className={`rounded-2xl border p-4 ${item ? "border-[#63C174] bg-[#f5fcf6]" : "border-[#d8dee8]"}`}>
                      <button type="button" disabled={!editable} onClick={() => toggleFacility(type)} className="flex w-full items-center justify-between text-left font-semibold gap-3">
                        {cfg.label}
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${item ? "border-[#63C174] bg-[#63C174] text-white" : "border-gray-300"}`}>{item && <Check size={14} />}</span>
                      </button>
                      {item && (
                        <div className="mt-3 space-y-3">
                          <Field label="Tier *"><select disabled={!editable} className={inputClass} value={item.tier} onChange={(e) => setItem(type, "tier", e.target.value)}><option value="">Select tier</option>{cfg.tiers.map((t) => <option key={t}>{t}</option>)}</select></Field>
                          <Field label="CI level"><select disabled={!editable} className={inputClass} value={item.ciLevel} onChange={(e) => setItem(type, "ciLevel", e.target.value)}><option>CI 2024-25</option><option>CI Legacy</option></select></Field>
                          {type === "WORKSHOP" && <Field label="Workshop type"><select disabled={!editable} className={inputClass} value={item.workshopType} onChange={(e) => setItem(type, "workshopType", e.target.value)}><option>Mechanical + Bodyshop</option><option>Mechanical only</option><option>Bodyshop only</option></select></Field>}
                          <div className="flex gap-3 text-xs">{[["sellsPv", "PV"], ["sellsBev", "BEV"], ["sellsCv", "CV"]].map(([f, t]) => <label key={f} className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={Boolean(item[f])} onChange={(e) => setItem(type, f, e.target.checked)} />{t}</label>)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <Field label="Electrical supply *"><select disabled={!editable} className={`${inputClass} max-w-xs`} value={data.facilities.electricalSupplyType} onChange={(e) => setFac("electricalSupplyType", e.target.value)}><option>LT supply</option><option>HT supply</option><option>HT + LT supply</option></select></Field>
              {facilityTypes.length > 1 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Shared facilities on this premises</h3>
                  <div className="overflow-x-auto rounded-xl border border-[#d9e0e8]">
                    {SHARED.map(([code, label]) => {
                      const m = mapping(code);
                      return (
                        <div key={code} className="flex items-center gap-4 border-b border-[#e4e8ed] p-3 text-sm last:border-b-0">
                          <input type="checkbox" disabled={!editable} checked={Boolean(m.enabled)} onChange={(e) => setMapping(code, { enabled: e.target.checked, usedBy: facilityTypes })} />
                          <span className="flex-1">{label}</span>
                          <select disabled={!editable || !m.enabled} className="rounded-lg border p-2 text-xs" value={m.arrangement} onChange={(e) => setMapping(code, { arrangement: e.target.value, auditAtSite: e.target.value === "SHARED" })}><option value="SHARED">Shared</option><option value="SEPARATE">Separate per facility</option></select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {current.key === "scope" && (
            <div className="space-y-4">
              {facilityTypes.length === 0 && <p className="text-sm text-gray-500">Select facilities in the previous step first.</p>}
              {facilityTypes.map((type) => (
                <div key={type} className="rounded-2xl border border-[#e1e5ea] p-4">
                  <div className="mb-3 font-semibold">{FACILITIES[type].label} <span className="text-xs font-normal text-gray-500">{data.facilities.items.find((i) => i.facilityType === type)?.tier}</span></div>
                  <div className="flex flex-wrap gap-3">
                    {DISCIPLINES.map(([d, label]) => (
                      <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm ${data.scope[type]?.[d] ? "border-[#63C174] bg-[#f5fcf6]" : "border-[#d8dee8]"}`}>
                        <input type="checkbox" disabled={!editable} checked={Boolean(data.scope[type]?.[d])} onChange={() => toggleScope(type, d)} />{label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500">Infrastructure and Fire go to Auditor A; Electrical and Thermography go to Auditor B. Which audits apply depends on the tier.</p>
            </div>
          )}

          {current.key === "volumes" && (
            <div className="space-y-6">
              {editable && <RegisterBar onUpload={uploadRegisters} onTemplate={() => downloadFile("registers-template", "tools-manpower-template.xlsx")} />}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {VOLUMES.map(([f, label]) => <Field key={f} label={label}><input type="number" disabled={!editable} className={inputClass} value={data.volumes[f] ?? ""} onChange={(e) => setIn("volumes", f, e.target.value)} /></Field>)}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Manpower by role</h3>{editable && <button className={lightBtn} onClick={() => rowAdd("manpower", { facilityType: facilityTypes[0] || "SHOWROOM", role: "", required: "", onRoll: "" })}><Plus size={14} /> Add role</button>}</div>
                <RowTable cols={["Facility", "Role", "Required", "On roll"]} empty="No manpower rows yet." rows={data.manpower} onDel={editable ? (i) => rowDel("manpower", i) : null}
                  render={(r, i) => (<>
                    <td><select disabled={!editable} className="rounded-lg border p-2" value={r.facilityType} onChange={(e) => rowSet("manpower", i, "facilityType", e.target.value)}>{Object.keys(FACILITIES).map((t) => <option key={t} value={t}>{FACILITIES[t].label}</option>)}</select></td>
                    <td><input disabled={!editable} className="w-full rounded-lg border p-2" value={r.role} onChange={(e) => rowSet("manpower", i, "role", e.target.value)} /></td>
                    <td><input type="number" disabled={!editable} className="w-24 rounded-lg border p-2" value={r.required} onChange={(e) => rowSet("manpower", i, "required", e.target.value)} /></td>
                    <td><input type="number" disabled={!editable} className="w-24 rounded-lg border p-2" value={r.onRoll} onChange={(e) => rowSet("manpower", i, "onRoll", e.target.value)} /></td>
                  </>)} />
              </div>
            </div>
          )}

          {current.key === "tools" && (
            <div>
              {editable && <RegisterBar onUpload={uploadRegisters} onTemplate={() => downloadFile("registers-template", "tools-manpower-template.xlsx")} />}
              <div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm text-gray-500">Workshop tools with certificate or calibration validity. The auditor verifies each one with a photo.</p>{editable && <button className={lightBtn} onClick={() => rowAdd("tools", { name: "", category: "Must Have", required: "", available: "", validTill: "" })}><Plus size={14} /> Add tool</button>}</div>
              <RowTable cols={["Tool", "Category", "Required", "Available", "Valid till"]} empty="No tools added yet." rows={data.tools} onDel={editable ? (i) => rowDel("tools", i) : null}
                render={(r, i) => (<>
                  <td><input disabled={!editable} className="w-full rounded-lg border p-2" value={r.name} onChange={(e) => rowSet("tools", i, "name", e.target.value)} /></td>
                  <td><select disabled={!editable} className="rounded-lg border p-2" value={r.category} onChange={(e) => rowSet("tools", i, "category", e.target.value)}><option>Must Have-Fast</option><option>Must Have</option><option>Critical</option></select></td>
                  <td><input type="number" disabled={!editable} className="w-20 rounded-lg border p-2" value={r.required} onChange={(e) => rowSet("tools", i, "required", e.target.value)} /></td>
                  <td><input type="number" disabled={!editable} className="w-20 rounded-lg border p-2" value={r.available} onChange={(e) => rowSet("tools", i, "available", e.target.value)} /></td>
                  <td><input type="date" disabled={!editable} className="rounded-lg border p-2" value={r.validTill} onChange={(e) => rowSet("tools", i, "validTill", e.target.value)} /></td>
                </>)} />
            </div>
          )}

          {current.key === "checklist" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Choose a checklist from the library, or upload a new one. The questions that apply to this site (by facility, tier and state) are frozen for it when the site goes live.</p>
              <div className="relative max-w-xl">
                <span className="text-sm font-medium text-[#374151]">Checklist from the library</span>
                <div className="relative mt-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input disabled={!editable} className={`${inputClass} !mt-0 pl-9`} placeholder="Search by name or version" value={pickerOpen ? pickerText : (versions.find((v) => v.id === data.checklist?.versionId) ? `${versions.find((v) => v.id === data.checklist?.versionId).name} · v${versions.find((v) => v.id === data.checklist?.versionId).version}` : "")}
                    onFocus={() => { setPickerText(""); setPickerOpen(true); }} onChange={(e) => setPickerText(e.target.value)} onBlur={() => setTimeout(() => setPickerOpen(false), 150)} />
                </div>
                {pickerOpen && (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[#d8dee8] bg-white shadow-lg">
                    {versions.filter((v) => `${v.name} ${v.version}`.toLowerCase().includes(pickerText.toLowerCase())).map((v) => (
                      <button key={v.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#f3f5f7] gap-3" onMouseDown={() => { setData((d) => ({ ...d, checklist: { versionId: v.id } })); setPickerOpen(false); }}>
                        <span>{v.name} <span className="text-gray-500">· v{v.version}</span></span><span className="text-xs text-gray-500">{v.itemCount} questions</span>
                      </button>
                    ))}
                    {!versions.length && <div className="p-3 text-sm text-gray-500">No published checklist yet. Upload one below or publish one in Checklist Configuration.</div>}
                  </div>
                )}
              </div>
              {editable && (
                <div className="max-w-xl rounded-2xl border border-[#e1e5ea] p-4">
                  <div className="mb-2 text-sm font-semibold">Or upload a new checklist (Excel)</div>
                  <div className="grid grid-cols-2 gap-3"><Field label="Name"><input className={inputClass} value={upName.name} onChange={(e) => setUpName({ ...upName, name: e.target.value })} placeholder="Integrated audit checklist" /></Field><Field label="Version"><input className={inputClass} value={upName.version} onChange={(e) => setUpName({ ...upName, version: e.target.value })} placeholder="2.0" /></Field></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={lightBtn} onClick={() => downloadFile("checklists/template", "checklist-template.xlsx")}><Download size={15} /> Template</button>
                    <label className={`${lightBtn} cursor-pointer`}><Upload size={15} /> Upload & use<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { uploadChecklist(e.target.files?.[0]); e.target.value = ""; }} /></label>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">The upload is published to the library, so other sites can pick it too. Edit it later in Checklist Configuration.</p>
                </div>
              )}
            </div>
          )}

          {current.key === "access" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Who should see this site? Users are created when the site is approved. A manager role also gives access to the site's zone, regional office or company. You can skip this and add users later.</p>
              {editable && <button className={lightBtn} onClick={() => rowAdd("access", { fullName: "", email: "", role: "SITE_USER" })}><Plus size={14} /> Add user</button>}
              <RowTable cols={["Name", "Email", "Role"]} empty="No users added." rows={data.access || []} onDel={editable ? (i) => rowDel("access", i) : null}
                render={(r, i) => (<>
                  <td><input disabled={!editable} className="w-full rounded-lg border p-2" value={r.fullName} onChange={(e) => rowSet("access", i, "fullName", e.target.value)} /></td>
                  <td><input disabled={!editable} className="w-full rounded-lg border p-2" value={r.email} onChange={(e) => rowSet("access", i, "email", e.target.value)} /></td>
                  <td><select disabled={!editable} className="rounded-lg border p-2" value={r.role} onChange={(e) => rowSet("access", i, "role", e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                </>)} />
            </div>
          )}

          {current.key === "review" && (
            <div className="space-y-3">
              {sections.filter((s) => s.applies).map((s) => (
                <div key={s.key} className="flex items-start gap-3 rounded-xl border border-[#e1e5ea] p-3 text-sm">
                  <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${s.complete ? "bg-[#63C174] text-white" : s.optional ? "bg-[#f1f1f1] text-gray-500" : "bg-[#fff3e0] text-[#9a5200]"}`}>{s.complete ? <Check size={14} /> : s.optional ? "–" : "!"}</span>
                  <div className="flex-1"><div className="font-medium">{s.label}</div>{!s.complete && <div className={`text-xs ${s.optional ? "text-gray-500" : "text-[#9a5200]"}`}>{s.optional ? "Optional: " : "Missing: "}{s.missing.join(", ")}</div>}</div>
                  <button className="text-xs underline" onClick={() => setStep(visibleSteps.findIndex((v) => v.key === s.key))}>{editable ? "Edit" : "View"}</button>
                </div>
              ))}
              {request.status === "SUBMITTED" && (
                <div className="rounded-2xl border border-[#cfe0f7] bg-[#f4f8fe] p-4">
                  <div className="mb-2 text-sm font-semibold">Back-Admin review</div>
                  <textarea rows="2" className={inputClass} placeholder="Remarks (required to return or reject)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={darkBtn} disabled={saving} onClick={() => act("approve", { remarks })}><Check size={16} /> Approve & create site</button>
                    <button className={lightBtn} disabled={saving} onClick={() => act("return", { remarks })}>Return for changes</button>
                    <button className={`${lightBtn} !text-[#b42318]`} disabled={saving} onClick={() => act("reject", { remarks })}>Reject</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ebef] pt-5">
            <div className="flex gap-2">
              <button className={lightBtn} disabled={step === 0} onClick={() => go(step - 1)}><ChevronLeft size={16} /> Back</button>
              {editable && <button className={lightBtn} disabled={saving} onClick={() => save()}><Save size={16} /> Save draft</button>}
              {editable && <button className={`${lightBtn} !text-[#b42318]`} onClick={discard}><Trash2 size={16} /> Discard</button>}
            </div>
            <div className="flex gap-2">
              {current.key !== "review" && <button className={darkBtn} disabled={saving} onClick={() => go(step + 1)}>Save & next <ChevronRight size={16} /></button>}
              {current.key === "review" && editable && <button className={darkBtn} disabled={saving || readiness < 100} onClick={() => act("submit")}><Send size={16} /> Submit for review</button>}
            </div>
          </div>
        </section>
      </div>
      {creds && (
        <Modal title="Site approved" onClose={() => { setCreds(null); navigate(backPath); }}>
          <div className="space-y-3 text-sm">
            <p>The site is live. These users now have access. Share their login details; passwords are shown only now.</p>
            <div className="space-y-2">{creds.map((c, i) => <div key={i} className="rounded-xl bg-[#f3f5f7] p-3"><div className="font-medium">{c.fullName} <span className="text-xs text-gray-500">{ROLE_LABEL[c.role] || c.role}</span></div>{c.password ? <div className="font-mono text-xs">{c.username} / {c.password}</div> : <div className="text-xs text-gray-500">{c.note}</div>}</div>)}</div>
            <div className="flex justify-end"><button className={darkBtn} onClick={() => { setCreds(null); navigate(backPath); }}>Done</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RegisterBar({ onUpload, onTemplate }) {
  const [mode, setMode] = useState("append");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#f7f8fa] p-3 text-sm">
      <span className="font-medium">Tools and manpower from Excel</span>
      <button type="button" className={lightBtn} onClick={onTemplate}><Download size={15} /> Template</button>
      <label className={`${lightBtn} cursor-pointer`}><Upload size={15} /> Upload<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { onUpload(e.target.files?.[0], mode); e.target.value = ""; }} /></label>
      <select className="rounded-lg border border-[#CECECE] bg-white px-2 py-1.5 text-xs" value={mode} onChange={(e) => setMode(e.target.value)}><option value="append">Add to existing rows</option><option value="replace">Replace existing rows</option></select>
    </div>
  );
}

function RowTable({ cols, rows, render, empty, onDel }) {
  if (!rows.length) return <p className="rounded-xl bg-[#f7f7f7] p-6 text-center text-sm text-gray-500">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#d9e0e8]">
      <table className="w-full text-sm">
        <thead className="bg-[#f3f5f7] text-left text-xs uppercase text-gray-500"><tr>{cols.map((c) => <th key={c} className="p-2">{c}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[#e4e8ed]">{render(r, i)}<td className="p-1">{onDel && <button className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => onDel(i)} aria-label="Remove row"><Trash2 size={14} /></button>}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
