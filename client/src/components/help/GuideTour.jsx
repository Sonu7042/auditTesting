import { useState } from "react";
import axios from "axios";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import domain from "../../api/domain";
import { darkBtn, lightBtn } from "../siteOnboarding/ui";

// Step-by-step guide to the flow, shown after the first login and from Help & Training.
export default function GuideTour({ steps, basePath, onClose }) {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const step = steps[i]; const last = i === steps.length - 1;
  const save = (body) => axios.post(`${domain}/help/guide/progress`, body, { showErrorToast: false }).catch(() => null);

  const go = (n) => { setI(n); save({ stepIndex: n }); };
  const finish = (skipped) => { save({ stepIndex: i, completed: !skipped, skipped }); onClose(); };

  return (
    <div className="anim-fade fixed inset-0 z-[1100] flex items-center justify-center bg-[#141413]/50 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label="Guide" className="anim-rise modal-surface w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(20,20,19,0.22)] sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Quick guide · {i + 1} of {steps.length}</span>
          <button type="button" onClick={() => finish(true)} aria-label="Skip the guide" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <h2 className="text-[22px] font-semibold leading-tight text-[#181919]">{step.title}</h2>
        <p className="mt-3 min-h-[84px] text-[15px] leading-relaxed text-gray-700">{step.text}</p>
        {step.link && <button type="button" className="mt-2 text-sm font-medium text-[#1e61ad] underline underline-offset-2" onClick={() => { finish(false); navigate(`${basePath}/${step.link}`); }}>Open this page</button>}
        <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">{steps.map((_, n) => <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${n <= i ? "bg-[#181919]" : "bg-[#e1e5ea]"}`} />)}</div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" className="text-sm text-gray-500 underline underline-offset-2" onClick={() => finish(true)}>Skip</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" className={lightBtn} onClick={() => go(i - 1)}><ArrowLeft size={16} /> Back</button>}
            <button type="button" className={darkBtn} onClick={() => (last ? finish(false) : go(i + 1))}>{last ? "Finish" : "Next"} {!last && <ArrowRight size={16} />}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
