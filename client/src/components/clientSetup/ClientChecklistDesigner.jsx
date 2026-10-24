import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CheckCircle2, Eye, FileLock2, ListChecks, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";

const MODULE_LABELS = {
  SITE_SHARED: "Site & Shared", EFS_SAFETY: "Electrical & Fire Safety",
  SR_SHOWROOM: "Showroom", WS_WORKSHOP: "Workshop", SY_STOCKYARD: "Stockyard",
  TOOLS_REGISTER: "Tools Register", MANPOWER_SALES: "Sales Manpower",
  MANPOWER_SERVICE: "Service Manpower", MANPOWER_YARD: "Yard Manpower",
  THERMOGRAPHY: "Thermography",
};
const inputClass = "mt-1 w-full rounded-xl border border-[#ced5df] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#63C174] focus:ring-2 focus:ring-[#63C174]/20 disabled:bg-gray-100";
const emptyVersion = { programmeId: "", name: "Mahindra Integrated Facility Checklist", version: "1.0", effectiveDate: "" };
const emptyItem = {
  moduleCode: "SITE_SHARED", discipline: "INFRASTRUCTURE", sectionName: "", questionCode: "", questionText: "",
  expectedCondition: "", responseType: "COMPLIANCE", severityOnFail: "MEDIUM",
  mahindraPriority: "IMPORTANT", weight: 1, evidenceRequired: false, minimumEvidence: 1,
  naAllowed: true, naReasonRequired: true, measurementUnit: "", minimumValue: "",
  maximumValue: "", regulationRef: "", sortOrder: 0, isActive: true,
  applicabilityRule: { facilityTypes: [], ciLevels: [], workshopTypes: [], electricalSupplyTypes: [], requiresBev: false, requiresPv: false, requiresCv: false, sharedFacilityCode: "", sharedArrangement: "", tiers: [], states: [] },
};

export default function ClientChecklistDesigner() {
  const [programmes, setProgrammes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [versions, setVersions] = useState([]);
  const [constants, setConstants] = useState({ modules: [], responseTypes: [], severities: [], priorities: [] });
  const [versionForm, setVersionForm] = useState(emptyVersion);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingItemId, setEditingItemId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [busy, setBusy] = useState(false);
  const { confirm } = useConfirm();

  const selectedVersion = versions.find((item) => item.id === selectedVersionId);
  const selectedProgrammeId = selectedVersion?.programmeId || versionForm.programmeId;
  const programmeLocations = locations.filter((item) => item.programmeId === selectedProgrammeId);

  const loadBase = async () => {
    const [programmeRes, locationRes, constantsRes, versionRes] = await Promise.all([
      axios.get(`${domain}/client-audit-setup/programmes`),
      axios.get(`${domain}/client-audit-setup/locations`),
      axios.get(`${domain}/client-audit-setup/checklists/constants`),
      axios.get(`${domain}/client-audit-setup/checklists/versions`),
    ]);
    setProgrammes(programmeRes.data.programmes || []);
    setLocations(locationRes.data.locations || []);
    setConstants(constantsRes.data);
    setVersions(versionRes.data.versions || []);
  };

  useEffect(() => { loadBase(); }, []);

  const refreshVersions = async (preferredId = selectedVersionId) => {
    const { data } = await axios.get(`${domain}/client-audit-setup/checklists/versions`);
    setVersions(data.versions || []);
    if (preferredId) setSelectedVersionId(preferredId);
  };

  const itemsByModule = useMemo(() => {
    const groups = {};
    for (const item of selectedVersion?.items || []) (groups[item.moduleCode] ||= []).push(item);
    return groups;
  }, [selectedVersion]);

  const createVersion = async () => {
    if (!versionForm.programmeId || !versionForm.name.trim() || !versionForm.version.trim()) return window.alert("Programme, checklist name and version are required.");
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/checklists/versions`, versionForm, { showSuccessToast: true });
      await refreshVersions(data.version.id);
      setVersionForm((prev) => ({ ...prev, version: "" }));
    } finally { setBusy(false); }
  };

  const saveItem = async () => {
    if (!selectedVersionId) return window.alert("Select a checklist version first.");
    if (!itemForm.sectionName.trim() || !itemForm.questionCode.trim() || !itemForm.questionText.trim()) return window.alert("Section, question code and question text are required.");
    setBusy(true);
    try {
      const url = `${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/items${editingItemId ? `/${editingItemId}` : ""}`;
      if (editingItemId) await axios.put(url, itemForm, { showSuccessToast: true });
      else await axios.post(url, itemForm, { showSuccessToast: true });
      setEditingItemId(null); setItemForm(emptyItem); await refreshVersions(selectedVersionId);
    } finally { setBusy(false); }
  };

  const editItem = (item) => {
    setEditingItemId(item.id);
    setItemForm({ ...emptyItem, ...item, applicabilityRule: { ...emptyItem.applicabilityRule, ...(item.applicabilityRule || {}) } });
    window.scrollTo({ top: 260, behavior: "smooth" });
  };

  const deleteItem = async (itemId) => {
    if (!(await confirm({ title: "Remove this question?", tone: "danger", message: "It is deleted from this draft checklist.", confirmLabel: "Remove question" }))) return;
    await axios.delete(`${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/items/${itemId}`, { showSuccessToast: true });
    await refreshVersions(selectedVersionId);
  };

  const addStarterItems = async () => {
    if (!selectedVersionId) return window.alert("Select a draft checklist version first.");
    setBusy(true);
    try {
      await axios.post(`${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/starter-items`, {}, { showSuccessToast: true });
      await refreshVersions(selectedVersionId);
    } finally { setBusy(false); }
  };

  const addDemoPack = async () => {
    if (!selectedVersionId) return window.alert("Select a draft checklist version first.");
    setBusy(true);
    try {
      await axios.post(`${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/demo-pack`, {}, { showSuccessToast: true });
      await refreshVersions(selectedVersionId);
    } finally { setBusy(false); }
  };

  const importExcel = async (file) => {
    if (!file || !selectedVersionId) return;
    if (!(await confirm({ title: "Import questions from this workbook?", message: `${file.name} will add its questions to this draft.`, points: ["Question codes that already exist are skipped", "Rows with errors are reported and skipped", "Nothing is published yet"], confirmLabel: "Import questions" }))) return;
    const f = new FormData(); f.append("file", file);
    setBusy(true);
    try {
      const { data } = await axios.post(`${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/import`, f);
      window.alert(`${data.totals.added} question(s) added, ${data.totals.skipped} skipped, ${data.totals.errors} with errors.${data.results.filter((r) => r.status === "ERROR").slice(0, 5).map((r) => `\nRow ${r.line}: ${r.message}`).join("")}`);
      await refreshVersions(selectedVersionId);
    } finally { setBusy(false); }
  };
  const downloadTemplate = async () => {
    const res = await axios.get(`${domain}/client-audit-setup/checklists/template`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = url; a.download = "checklist-template.xlsx"; a.click(); URL.revokeObjectURL(url);
  };

  const publishVersion = async () => {
    if (!(await confirm({ title: "Publish and lock this checklist?", message: `${selectedVersion?.name} v${selectedVersion?.version} will be published with ${selectedVersion?.items.length} question(s).`, points: ["It can no longer be edited; changes need a new version", "Sites can choose it from the library", "Audits already scheduled keep their own frozen checklist"], confirmLabel: "Publish & lock" }))) return;
    setBusy(true);
    try {
      await axios.post(`${domain}/client-audit-setup/checklists/versions/${selectedVersionId}/publish`, {}, { showSuccessToast: true });
      await refreshVersions(selectedVersionId);
    } finally { setBusy(false); }
  };

  const loadPreview = async () => {
    if (!selectedLocationId || !selectedVersionId) return window.alert("Select a checklist version and dealer location.");
    const { data } = await axios.get(`${domain}/client-audit-setup/locations/${selectedLocationId}/checklist-preview`, { params: { versionId: selectedVersionId } });
    setPreview(data.preview);
    const snapshotRes = await axios.get(`${domain}/client-audit-setup/locations/${selectedLocationId}/checklist-snapshots`);
    setSnapshots(snapshotRes.data.snapshots || []);
  };

  const generateSnapshot = async () => {
    setBusy(true);
    try {
      await axios.post(`${domain}/client-audit-setup/locations/${selectedLocationId}/checklist-snapshots`, { versionId: selectedVersionId }, { showSuccessToast: true });
      await loadPreview();
    } finally { setBusy(false); }
  };

  const setItem = (field, value) => setItemForm((prev) => ({ ...prev, [field]: value }));
  const setRule = (field, value) => setItemForm((prev) => ({ ...prev, applicabilityRule: { ...prev.applicabilityRule, [field]: value } }));
  const toggleRuleArray = (field, value) => {
    const current = itemForm.applicabilityRule[field] || [];
    setRule(field, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  return <div>
    <Header />
    <div className="mb-6 rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]"><div className="flex items-center gap-3"><ListChecks className="text-[#3b9c4c]"/><div><h1 className="text-xl font-semibold">Client Checklist Designer</h1><p className="text-sm text-gray-500">Version, publish and resolve location-specific checklists.</p></div></div></div>

    <section className="mb-6 rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]">
      <h2 className="mb-4 font-semibold">1. Create checklist version</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Audit programme"><select className={inputClass} value={versionForm.programmeId} onChange={(e) => setVersionForm((p) => ({ ...p, programmeId: e.target.value }))}><option value="">Select programme</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="Checklist name"><input className={inputClass} value={versionForm.name} onChange={(e) => setVersionForm((p) => ({ ...p, name: e.target.value }))}/></Field></div>
        <Field label="Version"><input className={inputClass} placeholder="1.0" value={versionForm.version} onChange={(e) => setVersionForm((p) => ({ ...p, version: e.target.value }))}/></Field>
        <div className="flex items-end"><button disabled={busy} onClick={createVersion} className="w-full rounded-xl bg-[#181919] py-2.5 text-sm font-medium text-white disabled:opacity-50">Create Draft</button></div>
      </div>
    </section>

    <section className="mb-6 rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1"><Field label="2. Select checklist version"><select className={inputClass} value={selectedVersionId} onChange={(e) => { setSelectedVersionId(e.target.value); setPreview(null); setSelectedLocationId(""); setEditingItemId(null); setItemForm(emptyItem); }}><option value="">Select version</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.programme.name} • {v.name} v{v.version} • {v.status}</option>)}</select></Field></div>
        {/* <button disabled={!selectedVersionId || selectedVersion?.status !== "DRAFT" || busy} onClick={addStarterItems} className="flex items-center gap-2 rounded-xl border border-[#89c993] bg-[#f1fbf3] px-4 py-2.5 text-sm font-medium text-[#287a37] disabled:opacity-40"><Sparkles size={16}/>Load starter questions</button>
        <button disabled={!selectedVersionId || selectedVersion?.status !== "DRAFT" || busy} onClick={addDemoPack} className="flex items-center gap-2 rounded-xl border border-[#89c993] bg-[#f1fbf3] px-4 py-2.5 text-sm font-medium text-[#287a37] disabled:opacity-40"><Sparkles size={16}/>Load sample checklist (46)</button> */}
        <div className="flex gap-2"><button type="button" onClick={downloadTemplate} className="rounded-xl border border-[#ced5df] bg-white px-3 py-2.5 text-sm">Excel template</button><label className={`rounded-xl border border-[#89c993] bg-[#f1fbf3] px-4 py-2.5 text-sm font-medium text-[#287a37] ${!selectedVersionId || selectedVersion?.status !== "DRAFT" || busy ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>Import from Excel<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { importExcel(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        <button disabled={!selectedVersionId || selectedVersion?.status !== "DRAFT" || busy} onClick={publishVersion} className="flex items-center gap-2 rounded-xl bg-[#166534] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"><FileLock2 size={16}/>Publish & Lock</button>
      </div>
      {selectedVersion && <div className="mt-4 flex gap-3 text-xs"><Badge>{selectedVersion.status}</Badge><Badge>{selectedVersion.items.length} questions</Badge><Badge>{selectedVersion._count?.snapshots || 0} snapshots</Badge>{selectedVersion.publishedAt && <Badge>Published {new Date(selectedVersion.publishedAt).toLocaleDateString("en-IN")}</Badge>}</div>}
    </section>

    {selectedVersion?.status === "DRAFT" && <section className="mb-6 rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">3. {editingItemId ? "Edit question" : "Add question"}</h2>{editingItemId && <button className="text-sm underline" onClick={() => { setEditingItemId(null); setItemForm(emptyItem); }}>Cancel edit</button>}</div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Field label="Module"><select className={inputClass} value={itemForm.moduleCode} onChange={(e) => setItem("moduleCode",e.target.value)}>{constants.modules.map((m) => <option key={m} value={m}>{MODULE_LABELS[m]}</option>)}</select></Field>
        <Field label="Discipline"><select className={inputClass} value={itemForm.discipline || "INFRASTRUCTURE"} onChange={(e) => setItem("discipline",e.target.value)}>{(constants.disciplines || ["INFRASTRUCTURE","FIRE","ELECTRICAL","THERMOGRAPHY"]).map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Section"><input className={inputClass} value={itemForm.sectionName} onChange={(e) => setItem("sectionName",e.target.value)}/></Field>
        <Field label="Question code"><input className={inputClass} placeholder="EFS-001" value={itemForm.questionCode} onChange={(e) => setItem("questionCode",e.target.value.toUpperCase())}/></Field>
        <Field label="Sort order"><input type="number" className={inputClass} value={itemForm.sortOrder} onChange={(e) => setItem("sortOrder",Number(e.target.value))}/></Field>
        <div className="col-span-2"><Field label="Question"><textarea rows="3" className={inputClass} value={itemForm.questionText} onChange={(e) => setItem("questionText",e.target.value)}/></Field></div>
        <div className="col-span-2"><Field label="Expected condition"><textarea rows="3" className={inputClass} value={itemForm.expectedCondition || ""} onChange={(e) => setItem("expectedCondition",e.target.value)}/></Field></div>
        <Field label="Response type"><select className={inputClass} value={itemForm.responseType} onChange={(e) => setItem("responseType",e.target.value)}>{constants.responseTypes.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Failure severity"><select className={inputClass} value={itemForm.severityOnFail} onChange={(e) => setItem("severityOnFail",e.target.value)}>{constants.severities.map((v) => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Mahindra priority"><select className={inputClass} value={itemForm.mahindraPriority} onChange={(e) => setItem("mahindraPriority",e.target.value)}>{constants.priorities.map((v) => <option key={v}>{v.replaceAll("_"," & ")}</option>)}</select></Field>
        <Field label="Weight"><input type="number" min="0.1" step="0.1" className={inputClass} value={itemForm.weight} onChange={(e) => setItem("weight",e.target.value)}/></Field>
        <Field label="Measurement unit"><input className={inputClass} placeholder="ohm / ms / lux" value={itemForm.measurementUnit || ""} onChange={(e) => setItem("measurementUnit",e.target.value)}/></Field>
        <Field label="Minimum value"><input type="number" step="any" className={inputClass} value={itemForm.minimumValue ?? ""} onChange={(e) => setItem("minimumValue",e.target.value)}/></Field>
        <Field label="Maximum value"><input type="number" step="any" className={inputClass} value={itemForm.maximumValue ?? ""} onChange={(e) => setItem("maximumValue",e.target.value)}/></Field>
        <Field label="Regulation / reference"><input className={inputClass} value={itemForm.regulationRef || ""} onChange={(e) => setItem("regulationRef",e.target.value)}/></Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-[#f6f7f8] p-4 text-sm"><Check label="Evidence required" checked={itemForm.evidenceRequired} onChange={(v) => setItem("evidenceRequired",v)}/>{itemForm.evidenceRequired && <Field label="Minimum photos"><input type="number" min="1" max="10" className="ml-2 w-16 rounded border p-1" value={itemForm.minimumEvidence} onChange={(e) => setItem("minimumEvidence",Number(e.target.value))}/></Field>}<Check label="N/A allowed" checked={itemForm.naAllowed} onChange={(v) => setItem("naAllowed",v)}/><Check label="N/A reason required" checked={itemForm.naReasonRequired} onChange={(v) => setItem("naReasonRequired",v)}/></div>

      <div className="mt-4 rounded-2xl border border-[#dce3eb] p-4"><h3 className="mb-3 text-sm font-semibold">Applicability rules (all configured rules must match)</h3><div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
        <RuleChecks title="Facility type" values={["SHOWROOM","WORKSHOP","STOCKYARD"]} selected={itemForm.applicabilityRule.facilityTypes} toggle={(v) => toggleRuleArray("facilityTypes",v)}/>
        <RuleChecks title="Tier" values={["MADB","CUBE","SMART","Main Dealer Workshop","Stand-Alone Accidental Workshop","SMART Workshop"]} selected={itemForm.applicabilityRule.tiers || []} toggle={(v) => toggleRuleArray("tiers",v)}/>
        <Field label="States (local-law pack, comma separated)"><input className={inputClass} placeholder="Bihar, Maharashtra" value={(itemForm.applicabilityRule.states || []).join(", ")} onChange={(e) => setRule("states", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}/></Field>
        <RuleChecks title="Vehicle applicability" values={["requiresPv","requiresBev","requiresCv"]} labels={["PV required","BEV required","CV required"]} selected={Object.keys(itemForm.applicabilityRule).filter((k) => itemForm.applicabilityRule[k] === true)} toggle={(v) => setRule(v,!itemForm.applicabilityRule[v])}/>
        <div className="grid grid-cols-2 gap-2"><Field label="Shared element"><select className={inputClass} value={itemForm.applicabilityRule.sharedFacilityCode} onChange={(e) => setRule("sharedFacilityCode",e.target.value)}><option value="">Any</option>{["GATE","PARK","ACC","IT","WASH"].map((v)=><option key={v}>{v}</option>)}</select></Field><Field label="Arrangement"><select className={inputClass} value={itemForm.applicabilityRule.sharedArrangement} onChange={(e)=>setRule("sharedArrangement",e.target.value)}><option value="">Any</option><option>SHARED</option><option>SEPARATE</option></select></Field></div>
      </div></div>
      <div className="mt-5 flex justify-end"><button disabled={busy} onClick={saveItem} className="flex items-center gap-2 rounded-xl bg-[#181919] px-6 py-3 text-sm font-medium text-white disabled:opacity-50"><Save size={16}/>{editingItemId ? "Update Question" : "Add Question"}</button></div>
    </section>}

    {selectedVersion && <section className="mb-6 rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]"><h2 className="mb-4 font-semibold">4. Checklist questions</h2>{selectedVersion.items.length === 0 ? <Empty text="No questions yet. Add one or load starter questions."/> : <div className="space-y-4">{Object.entries(itemsByModule).map(([module,items]) => <div key={module} className="overflow-hidden rounded-2xl border"><div className="flex justify-between bg-[#eef6ff] px-4 py-3 text-sm font-semibold"><span>{MODULE_LABELS[module]}</span><span>{items.length}</span></div>{items.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 border-t px-4 py-3"><div><div className="text-xs font-semibold text-[#30733b]">{item.questionCode} • {item.sectionName}</div><p className="mt-1 text-sm">{item.questionText}</p><div className="mt-2 flex gap-2 text-xs"><Badge>{item.severityOnFail}</Badge><Badge>{item.mahindraPriority}</Badge>{item.evidenceRequired && <Badge>{item.minimumEvidence} evidence</Badge>}{item.applicabilityRule && <Badge>conditional</Badge>}</div></div>{selectedVersion.status === "DRAFT" && <div className="flex gap-2"><button onClick={() => editItem(item)} className="rounded-lg border p-2"><Pencil size={14}/></button><button onClick={() => deleteItem(item.id)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={14}/></button></div>}</div>)}</div>)}</div>}</section>}

    {selectedVersion && <section className="rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,.08)]"><h2 className="mb-4 font-semibold">5. Location applicability preview & snapshot</h2><div className="grid grid-cols-[1fr_auto] items-end gap-4"><Field label="Dealer location"><select className={inputClass} value={selectedLocationId} onChange={(e) => { setSelectedLocationId(e.target.value); setPreview(null); }}><option value="">Select location</option>{programmeLocations.map((l) => <option key={l.id} value={l.id}>{l.dealerName} • {l.locationName} • {l.locationCode}</option>)}</select></Field><button onClick={loadPreview} className="flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium"><Eye size={16}/>Preview</button></div>
      {preview && <div className="mt-5"><div className="grid grid-cols-3 gap-4"><Stat label="Applicable questions" value={preview.applicableCount}/><Stat label="Excluded by rules" value={preview.excludedCount}/><Stat label="Applicable modules" value={preview.applicableModules.length}/></div><div className="mt-4 flex flex-wrap gap-2">{preview.applicableModules.map((m)=><Badge key={m}>{MODULE_LABELS[m]}</Badge>)}</div>
        <div className="mt-5 grid grid-cols-2 gap-4"><div className="rounded-xl border p-4"><h3 className="mb-3 text-sm font-semibold text-green-700">Applicable</h3><div className="max-h-64 space-y-2 overflow-auto">{preview.applicableItems.map((i)=><div key={i.id} className="rounded-lg bg-green-50 p-2 text-xs"><b>{i.questionCode}</b> • {i.questionText}</div>)}</div></div><div className="rounded-xl border p-4"><h3 className="mb-3 text-sm font-semibold text-orange-700">Excluded</h3><div className="max-h-64 space-y-2 overflow-auto">{preview.excludedItems.map((i)=><div key={i.id} className="rounded-lg bg-orange-50 p-2 text-xs"><b>{i.questionCode}</b> • {i.reason}</div>)}</div></div></div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-[#f6f7f8] p-4"><div className="text-sm"><b>{snapshots.length}</b> immutable snapshot(s) already generated for this location.</div><button disabled={selectedVersion.status !== "PUBLISHED" || busy || snapshots.some((s)=>s.versionId===selectedVersionId)} onClick={generateSnapshot} className="flex items-center gap-2 rounded-xl bg-[#166534] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"><CheckCircle2 size={16}/>Generate Checklist Snapshot</button></div>
      </div>}
    </section>}
  </div>;
}

function Field({ label, children }) { return <label className="block text-sm font-medium text-gray-700"><span>{label}</span>{children}</label>; }
function Check({ label, checked, onChange }) { return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e)=>onChange(e.target.checked)}/>{label}</label>; }
function RuleChecks({ title, values, labels = values, selected = [], toggle }) { return <div><div className="mb-2 font-medium">{title}</div><div className="flex flex-wrap gap-3">{values.map((v,i)=><Check key={v} label={labels[i]} checked={selected.includes(v)} onChange={()=>toggle(v)}/>)}</div></div>; }
function Badge({ children }) { return <span className="rounded-full bg-[#edf1f5] px-2.5 py-1 text-xs font-medium text-[#45576a]">{children}</span>; }
function Stat({ label, value }) { return <div className="rounded-xl border bg-[#fafcfe] p-4"><div className="text-2xl font-semibold">{value}</div><div className="text-xs text-gray-500">{label}</div></div>; }
function Empty({ text }) { return <div className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">{text}</div>; }

