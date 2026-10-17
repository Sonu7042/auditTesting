import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ConfirmContext } from "./confirmContext";

const TONES = {
  primary: { icon: CheckCircle2, ring: "bg-[#eaf8ed] text-[#287a37]", btn: "bg-[#181919] text-white" },
  danger: { icon: AlertTriangle, ring: "bg-[#fdecec] text-[#b42318]", btn: "bg-[#b42318] text-white" },
  info: { icon: Info, ring: "bg-[#e8f1fd] text-[#1e61ad]", btn: "bg-[#181919] text-white" },
};

// A single, consistent "are you sure?" step for every consequential action. It says what will happen,
// what happens next, and asks for a reason when one is needed, instead of acting on the first click.
export default function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [text, setText] = useState("");
  const resolver = useRef(null);
  const inputRef = useRef(null);

  const open = useCallback((opts) => new Promise((resolve) => { resolver.current = resolve; setText(opts.input?.defaultValue || ""); setState(opts); }), []);
  const close = useCallback((result) => { resolver.current?.(result); resolver.current = null; setState(null); }, []);

  const api = useMemo(() => ({
    confirm: (opts) => open(opts).then((r) => Boolean(r)),
    ask: (opts) => open({ ...opts, input: opts.input || { label: "Reason", required: true } }).then((r) => (r === false || r == null ? null : r)),
  }), [open]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [state, close]);

  const tone = TONES[state?.tone || "primary"];
  const Icon = tone?.icon;
  const needsText = Boolean(state?.input?.required) && !text.trim();

  const confirmModal = state && (
    <div
      className="anim-fade fixed inset-0 z-[99999] flex h-screen w-screen items-center justify-center bg-[#141413]/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && close(false)}
    >
      
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="anim-rise modal-surface max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone.ring}`}>
            <Icon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-lg font-semibold text-[#20242c]">
              {state.title}
            </h2>
            {state.message && (
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                {state.message}
              </p>
            )}
          </div>
        </div>
        {state.points?.length > 0 && (
          <div className="mt-4 rounded-2xl bg-[#f7f8fa] p-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {state.pointsTitle || "What happens next"}
            </div>
            <ul className="space-y-1.5 text-sm text-gray-700">
              {state.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {state.input && (
          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#374151]">
              {state.input.label || "Reason"}
              {state.input.required ? " *" : ""}
            </span>
            <textarea
              ref={inputRef}
              rows="3"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={state.input.placeholder || ""}
              className="mt-1 w-full rounded-xl border border-[#CECECE] px-3 py-2.5 text-sm outline-none focus:border-[#63C174] focus:ring-2 focus:ring-[#63C174]/20"
            />
          </label>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-[#CECECE] bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
            onClick={() => close(false)}
          >
            {state.cancelLabel || "Go back"}
          </button>
          <button
            type="button"
            disabled={needsText}
            className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${tone.btn}`}
            onClick={() => close(state.input ? text.trim() : true)}
          >
            {state.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {confirmModal &&
        (typeof document !== "undefined"
          ? createPortal(confirmModal, document.body)
          : confirmModal)}
    </ConfirmContext.Provider>
  );
}
