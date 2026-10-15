import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FileText, Layers } from "lucide-react";
import toast from "react-hot-toast";
import domain from "../../api/domain";

const ALL_TYPES = [
  { key: "ELECTRICAL", label: "Electrical Safety Audit" },
  { key: "FIRE", label: "Fire Safety Audit" },
  { key: "INFRASTRUCTURE", label: "Infrastructure Audit" },
  { key: "THERMOGRAPHY", label: "Thermography Audit" },
];

const fileName = (res, fallback) => /filename="?([^";]+)"?/i.exec(res.headers["content-disposition"] || "")?.[1] || fallback;

// Audit report in Word (format="docx", downloads) or PDF (format="pdf", opens in the viewer through onPreview).
// Each audit type on its own, or any combination, in one document.
// With no reportId it offers the blank template instead (same layout, every detail a placeholder).
export default function ReportMenu({ reportId, label, compact = false, align = "right", format = "docx", onPreview, title }) {
  const template = !reportId;
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState(template ? ALL_TYPES : null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState("");
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const hide = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", hide); window.removeEventListener("scroll", hide, true); };
  }, [open]);

  const toggleOpen = async () => {
    const next = !open; setOpen(next);
    if (next && btnRef.current) {
      // Fixed position, clamped to the viewport, so the menu is never clipped by a card or scroll area.
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const left = align === "right" ? r.right - width : r.left;
      setPos({ top: Math.min(r.bottom + 8, window.innerHeight - 280), left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), width });
    }
    if (next && !types) {
      try {
        const { data } = await axios.get(`${domain}/client-qc/reports/${reportId}/docx-options`, { showErrorToast: false });
        const list = data.disciplines.map((d) => ({ key: d.key, label: d.label }));
        setTypes(list); setPicked(Object.fromEntries(list.map((t) => [t.key, true])));
      } catch { setTypes([]); }
    }
    if (next && template) setPicked(Object.fromEntries(ALL_TYPES.map((t) => [t.key, true])));
  };

  const download = async (scope, tag) => {
    if (format === "pdf" && onPreview) {
      setOpen(false);
      onPreview({ title: title || "Audit report", url: `${domain}/client-qc/reports/${reportId}/audit-pdf?scope=${encodeURIComponent(scope)}`, filename: `Audit_Report_${scope.replace(/,/g, "-")}.pdf` });
      return;
    }
    setBusy(tag);
    try {
      const url = template ? `${domain}/client-qc/template/docx` : `${domain}/client-qc/reports/${reportId}/${format === "pdf" ? "audit-pdf" : "docx"}`;
      const res = await axios.get(url, { params: { scope }, responseType: "blob" });
      const href = URL.createObjectURL(res.data); const a = document.createElement("a");
      a.href = href; a.download = fileName(res, `Audit_Report_${scope}.docx`); a.click(); URL.revokeObjectURL(href);
      toast.success(template ? "Template downloaded" : "Word report downloaded");
      setOpen(false);
    } catch { toast.error("The Word report could not be created."); } finally { setBusy(""); }
  };

  const chosen = (types || []).filter((t) => picked[t.key]).map((t) => t.key);
  const btn = compact
    ? "inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-[#1e61ad] hover:bg-white"
    : "inline-flex items-center gap-2 rounded-xl border border-[#CECECE] bg-white px-4 py-2.5 text-sm font-medium text-[#20242c] hover:bg-gray-50";

  return (
    <div className="relative inline-block" ref={boxRef}>
      <button type="button" ref={btnRef} className={btn} onClick={toggleOpen} aria-expanded={open}>
        <FileText size={compact ? 14 : 16} /> {label || (template ? "Report template (Word)" : format === "pdf" ? "PDF report" : "Word report")}
      </button>
      {open && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="anim-pop z-50 rounded-2xl border border-[#d8dee8] bg-white p-3 text-left text-sm shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
          <div className="px-1 pb-2 text-xs text-gray-500">{template ? "Blank template: every detail is a placeholder to complete in Word." : (format === "pdf" ? "View one audit type, or tick several for a combined report." : "Download one audit type, or tick several for a combined report.")}</div>
          {types === null ? <p className="px-1 py-2 text-xs text-gray-500">Loading...</p> : types.length === 0 ? <p className="px-1 py-2 text-xs text-gray-500">No audit types found for this report.</p> : (
            <>
              <ul className="space-y-1">
                {types.map((t) => (
                  <li key={t.key} className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-[#f3f5f7]">
                    <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-2.5">
                      <input type="checkbox" className="h-4 w-4" checked={Boolean(picked[t.key])} onChange={() => setPicked((p) => ({ ...p, [t.key]: !p[t.key] }))} />
                      <span>{t.label}</span>
                    </label>
                    <button type="button" disabled={Boolean(busy)} className="min-h-8 rounded-lg px-2.5 text-xs font-medium text-[#1e61ad] hover:bg-white disabled:opacity-50" onClick={() => download(t.key, t.key)}>{busy === t.key ? "…" : "Only this"}</button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={Boolean(busy) || chosen.length < 1} onClick={() => download(chosen.length === types.length ? "ALL" : chosen.join(","), "combo")} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#181919] px-4 text-sm font-medium text-white disabled:opacity-50">
                <Layers size={15} /> {busy === "combo" ? "Preparing..." : `${format === "pdf" ? "View" : "Download"} ${chosen.length === types.length ? "combined (all)" : chosen.length > 1 ? `combined (${chosen.length} types)` : "selected"}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
