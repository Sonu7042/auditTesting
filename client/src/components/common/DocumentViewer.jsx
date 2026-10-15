import { useEffect, useState } from "react";
import axios from "axios";
import { Download, ExternalLink, X } from "lucide-react";

// In-app preview of a PDF the server generates. The file is fetched with the user's login, shown in
// the page, and can be downloaded or opened in its own tab.
export default function DocumentViewer({ title, subtitle, url, filename, onClose }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let revoke = "";
    axios.get(url, { responseType: "blob", showErrorToast: false })
      .then((res) => { revoke = URL.createObjectURL(res.data); setBlobUrl(revoke); })
      .catch(async (e) => {
        let message = e.userMessage || "The document could not be loaded.";
        try { const text = await e.response?.data?.text?.(); if (text) message = JSON.parse(text).message || message; } catch { /* keep default */ }
        setError(message);
      });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [url]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const download = () => { const a = document.createElement("a"); a.href = blobUrl; a.download = filename || "document.pdf"; a.click(); };
  const btn = "inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#CECECE] bg-white px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="anim-fade fixed inset-0 z-[900] flex items-center justify-center bg-[#141413]/55 p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="anim-rise modal-surface flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e4e8ed] px-5 py-3">
          <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold text-[#20242c]">{title}</h2>{subtitle && <p className="break-words text-xs text-gray-500">{subtitle}</p>}</div>
          <button type="button" className={btn} disabled={!blobUrl} onClick={download}><Download size={16} /> Download</button>
          <a className={`${btn} ${blobUrl ? "" : "pointer-events-none opacity-50"}`} href={blobUrl || undefined} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open in new tab</a>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Close preview" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 bg-[#eef0f3]">
          {error ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#b42318]">{error}</div>
            : !blobUrl ? <div className="flex h-full items-center justify-center text-sm text-gray-500">Preparing the document...</div>
            : <iframe title={title} src={blobUrl} className="h-full w-full border-0" />}
        </div>
      </div>
    </div>
  );
}
