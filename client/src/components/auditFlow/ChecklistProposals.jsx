import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useConfirm } from "../common/confirmContext";
import Header from "../adminDashboard/Header";
import { SiteTrail } from "./SiteTrail";
import domain from "../../api/domain";
import { Field, PageTitle, SkeletonTable, cardClass, darkBtn, inputClass, lightBtn } from "../siteOnboarding/ui";
import { DISCIPLINE_LABELS, SEVERITY_STYLES, fmtDate } from "./helpers";

const STATUS = { PENDING_ADMIN: ["Back-Admin review", "bg-[#fff6e8] text-[#9a5200]"], PENDING_SGS: ["SGS sign-off", "bg-[#f1ebfd] text-[#6b3fc4]"], APPROVED: ["Approved", "bg-[#eaf8ed] text-[#287a37]"], REJECTED: ["Rejected", "bg-[#fdecec] text-[#b42318]"] };
const REACH = { TIER_FACILITY: "Same tier and facility type (recommended)", SITE: "This site only", SELECTED: "Selected states or sites" };

export default function ChecklistProposals({ embedded = false, locationCode = "" }) {
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState("OPEN");
  const [open, setOpen] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [reach, setReach] = useState("TIER_FACILITY");
  const [states, setStates] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm } = useConfirm();

  const load = useCallback(() => axios.get(`${domain}/client-audit-proposals`, { params: locationCode ? { locationCode } : {} }).then(({ data }) => setList(data.proposals || [])), [locationCode]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, body) => {
    const reject = body.decision === "REJECT";
    if (reject && !remarks.trim()) return window.alert("Add the reason for rejecting.");
    const forward = path === "admin-review" && !reject;
    const cfg = reject
      ? { title: "Reject this proposed point?", tone: "danger", message: "The auditor will see your reason. The point is not added to any checklist.", confirmLabel: "Reject point" }
      : forward
        ? { title: "Forward to SGS for sign-off?", message: "Back-Admin has judged the point clear and worthwhile.", points: ["SGS decides whether it is added and how widely it applies", "Nothing changes on any checklist yet"], confirmLabel: "Forward to SGS" }
        : { title: "Approve and create a new checklist version?", message: `The point will apply ${({ TIER_FACILITY: "to every site of the same tier and facility type", SITE: "to this site only", SELECTED: "to the selected states or sites" })[reach]}.`,
            points: ["A new checklist version is published with this point added", "Only audits scheduled on the new version include it; past reports are unchanged", "Sites keep their current checklist until they choose the new version"], confirmLabel: "Approve & publish version" };
    if (!(await confirm(cfg))) return;
    setBusy(true);
    try { await axios.post(`${domain}/client-audit-proposals/${open.id}/${path}`, body, { showSuccessToast: true }); setOpen(null); setRemarks(""); await load(); } finally { setBusy(false); }
  };
  const shown = (list || []).filter((p) => (filter === "OPEN" ? ["PENDING_ADMIN", "PENDING_SGS"].includes(p.status) : filter === "ALL" || p.status === filter));

  return (
    <div>
      {!embedded && <Header />}
      {!embedded && <PageTitle crumbs={[{ label: "Site Onboarding", to: "/admin-dashboard/site-onboarding" }, { label: "Proposed points" }]} title="Proposed checklist points"
        subtitle="Points auditors suggest from site conditions. Back-Admin reviews first, then SGS signs off and chooses how widely the point applies. An approved point creates a new checklist version for upcoming audits only." />}
      <div className="mb-4 flex gap-2">{[["OPEN", "Awaiting action"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]].map(([k, t]) => <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-2 text-sm ${filter === k ? "bg-[#181919] text-white" : "bg-white shadow-sm"}`}>{t}</button>)}</div>
      {list === null ? <SkeletonTable rows={4} /> : shown.length === 0 ? <div className={`${cardClass} text-center text-sm text-gray-500`}>Nothing here.</div> : (
        <div className="space-y-3">
          {shown.map((p) => (
            <button key={p.id} onClick={() => { setOpen(p); setRemarks(""); setReach("TIER_FACILITY"); setStates(""); }} className="w-full rounded-2xl bg-white p-4 text-left shadow-[0_2px_6px_rgba(0,0,0,0.06)] hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{p.questionText}</div>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">{!embedded && p.site && <SiteTrail site={p.site} />}{!embedded && p.site && <Link to={`/admin-dashboard/site/${p.site.id}?tab=proposals`} onClick={(e) => e.stopPropagation()} className="font-medium underline">{p.site.locationName}</Link>}<span>{DISCIPLINE_LABELS[p.discipline]}</span><span className={`rounded-full px-2 py-0.5 ${SEVERITY_STYLES[p.severity]}`}>{p.severity}</span><span>by {p.proposedByName}</span><span>{fmtDate(p.createdAt)}</span></div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6">
            <div className="mb-3 flex justify-between gap-3"><h2 className="text-lg font-semibold">Proposed point</h2><button onClick={() => setOpen(null)} aria-label="Close">✕</button></div>
            <div className="space-y-3 text-sm">
              <p className="rounded-xl bg-[#f3f5f7] p-3">{open.questionText}</p>
              <p><b>Why:</b> {open.reason}</p>
              <p className="text-xs text-gray-500">{DISCIPLINE_LABELS[open.discipline]} · {open.sectionName} · severity {open.severity} · proposed by {open.proposedByName}</p>
              {open.adminRemarks && <p className="text-xs"><b>Back-Admin:</b> {open.adminRemarks}</p>}
              {open.sgsRemarks && <p className="text-xs"><b>SGS:</b> {open.sgsRemarks}</p>}
              {["PENDING_ADMIN", "PENDING_SGS"].includes(open.status) && (
                <>
                  {open.status === "PENDING_SGS" && (
                    <div className="space-y-2 rounded-xl border border-[#e1e5ea] p-3">
                      <Field label="Where does this point apply?"><select className={inputClass} value={reach} onChange={(e) => setReach(e.target.value)}>{Object.entries(REACH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                      {reach === "SELECTED" && <Field label="States or site codes (comma separated)"><input className={inputClass} value={states} onChange={(e) => setStates(e.target.value)} /></Field>}
                    </div>
                  )}
                  <Field label="Remarks (required to reject)"><textarea rows="2" className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
                  <div className="flex flex-wrap justify-end gap-2">
                    {open.status === "PENDING_ADMIN" ? (<>
                      <button className={lightBtn} disabled={busy} onClick={() => act("admin-review", { decision: "REJECT", remarks })}>Reject</button>
                      <button className={darkBtn} disabled={busy} onClick={() => act("admin-review", { decision: "FORWARD", remarks })}>Forward to SGS</button>
                    </>) : (<>
                      <button className={lightBtn} disabled={busy} onClick={() => act("sgs-review", { decision: "REJECT", remarks })}>Reject</button>
                      <button className={darkBtn} disabled={busy} onClick={() => act("sgs-review", { decision: "APPROVE", remarks, reach, states, locationCodes: states })}>Approve & create new version</button>
                    </>)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
