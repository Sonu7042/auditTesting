import { useEffect, useState } from "react";
import axios from "axios";
import { ChevronDown, ShieldCheck } from "lucide-react";
import domain from "../../api/domain";
import { darkBtn } from "../siteOnboarding/ui";
import GuideTour from "./GuideTour";
import Markdown from "./Markdown";

// After login: first the policies that need accepting (cannot be dismissed), then the quick guide.
export default function FirstRunGate({ basePath }) {
  const [state, setState] = useState(null);
  const [steps, setSteps] = useState(null);
  const [open, setOpen] = useState(null);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [tour, setTour] = useState(false);

  useEffect(() => {
    let alive = true;
    axios.get(`${domain}/help/bootstrap`, { showErrorToast: false }).then(async ({ data }) => {
      if (!alive) return;
      setState(data);
      if (data.pendingPolicies.length === 0 && data.showGuide) { const g = await axios.get(`${domain}/help/guide`, { showErrorToast: false }); if (alive) { setSteps(g.data.steps); setTour(true); } }
    }).catch(() => null);
    return () => { alive = false; };
  }, []);

  const policies = state?.pendingPolicies || [];
  const allChecked = policies.length > 0 && policies.every((p) => checked[p.id]);

  const accept = async () => {
    setBusy(true);
    try {
      await axios.post(`${domain}/help/policies/acknowledge`, { ids: policies.map((p) => p.id) });
      setState((s) => ({ ...s, pendingPolicies: [] }));
      if (state.showGuide) { const g = await axios.get(`${domain}/help/guide`); setSteps(g.data.steps); setTour(true); }
    } finally { setBusy(false); }
  };

  if (tour && steps) return <GuideTour steps={steps} basePath={basePath} onClose={() => setTour(false)} />;
  if (!policies.length) return null;

  return (
    <div className="anim-fade fixed inset-0 z-[1100] flex items-center justify-center bg-[#141413]/55 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="policy-title" className="anim-rise modal-surface flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-[0_24px_60px_rgba(20,20,19,0.22)]">
        <div className="flex items-start gap-3 border-b border-[#e4e8ed] px-6 pb-4 pt-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eaf8ed] text-[#287a37]"><ShieldCheck size={22} /></span>
          <div>
            <h2 id="policy-title" className="text-xl font-semibold text-[#181919]">Before you start</h2>
            <p className="mt-1 text-sm text-gray-600">Please read and accept {policies.length === 1 ? "this policy" : "these policies"}. Your acceptance is recorded with the date and version. You will be asked again only when a policy changes.</p>
          </div>
        </div>
        <div className="space-y-3 overflow-y-auto px-6 py-4">
          {policies.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[#e1e5ea]">
              <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span><span className="block text-[15px] font-semibold">{p.title}</span><span className="text-xs text-gray-500">Version {p.version} · tap to read</span></span>
                <ChevronDown size={18} className={`shrink-0 transition-transform ${open === p.id ? "rotate-180" : ""}`} />
              </button>
              {open === p.id && <div className="anim-fade max-h-64 overflow-y-auto border-t border-[#e1e5ea] px-4 py-3"><Markdown text={p.body} /></div>}
              <label className="flex min-h-12 cursor-pointer items-center gap-3 border-t border-[#e1e5ea] px-4 py-2.5 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={Boolean(checked[p.id])} onChange={(e) => setChecked({ ...checked, [p.id]: e.target.checked })} />
                I have read and accept the {p.title.toLowerCase()}
              </label>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#e4e8ed] px-6 py-4">
          <span className="text-xs text-gray-500">{policies.filter((p) => checked[p.id]).length} of {policies.length} accepted</span>
          <button type="button" className={darkBtn} disabled={!allChecked || busy} onClick={accept}>{busy ? "Saving..." : "Accept and continue"}</button>
        </div>
      </div>
    </div>
  );
}
