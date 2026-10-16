import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Camera, FileText, IdCard } from "lucide-react";
import toast from "react-hot-toast";
import domain from "../../api/domain";
import DocumentViewer from "../common/DocumentViewer";
import { useConfirm } from "../common/confirmContext";
import { Skeleton, lightBtn } from "../siteOnboarding/ui";
import { SKILL_LABELS } from "./meta";
import { resizePhoto } from "./photoResize";

// ISO/IEC 7810 ID-1 (the standard bank-card / ID size) is 85.6 x 54 mm; the card is drawn on a fixed canvas of that ratio and scaled to fit.
const CARD_W = 428;
const CARD_H = 270;

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set");

// Photo upload used on the auditor's page and on their own screen.
export function PhotoUpload({ userId, onSaved, hasPhoto }) {
  const { confirm } = useConfirm();
  const base = userId ? `${domain}/auditor-onboarding/${userId}` : `${domain}/auditor-onboarding/me`;
  const pick = async (file) => {
    if (!file) return;
    try {
      const photo = await resizePhoto(file);
      if (!(await confirm({ title: hasPhoto ? "Replace the photo?" : "Use this photo for the ID card?", message: "The photo appears on the ID card, the authority letter and the public verification page.", points: ["It is cropped to a portrait and kept small", "Use a clear, front-facing photo"], confirmLabel: "Save photo" }))) return;
      await axios.post(`${base}/photo`, { photo }, { showSuccessToast: true });
      onSaved?.();
    } catch (e) { if (!e.response) toast.error(e.message); }
  };
  return (
    <label className={`${lightBtn} cursor-pointer`}>
      <Camera size={16} /> {hasPhoto ? "Change photo" : "Upload photo"}
      <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
}

// The issued ID card (front and back) with the actions to view the PDF and the authority letter.
export default function AuditorIdCard({ userId = null, onChanged, allowPhoto = true }) {
  const base = userId ? `${domain}/auditor-onboarding/${userId}` : `${domain}/auditor-onboarding/me`;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);
  const hasCard = Boolean(data);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1.2, el.clientWidth / CARD_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasCard]);

  const load = useCallback(() => axios.get(`${base}/id-card`, { showErrorToast: false }).then(({ data: d }) => setData(d)).catch((e) => setError(e.userMessage || "The ID card is not available yet.")), [base]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="rounded-xl bg-[#f3f5f7] p-3 text-sm text-gray-600">{error}</p>;
  if (!data) {
    return (
      <div className="w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.08)] space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }
  const c = data.card;
  const initials = c.fullName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div>
      <div ref={boxRef} className="w-full max-w-[520px]" style={{ height: CARD_H * scale }}>
        <button
          type="button"
          onClick={() => setFlipped((v) => !v)}
          aria-label={flipped ? "Showing the back of the ID card. Click to show the front." : "Showing the front of the ID card. Click to show the back."}
          className="block cursor-pointer text-left [perspective:1400px]"
          style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flipped ? "rotateY(180deg)" : "none" }}>
            {/* Front: identity details only */}
            <div className="absolute inset-0 overflow-hidden rounded-[14px] border border-[#d8dee8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] [backface-visibility:hidden]">
              <div className="absolute inset-x-0 top-0 h-[70px] bg-[#1F3A5F] px-[22px] pt-[14px] text-white">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-[13px] font-bold uppercase leading-none tracking-[0.1em]">Bexex Global Pvt. Ltd.</div><div className="mt-[5px] text-[8px] tracking-[0.25em] text-white/80">BEXEX AUDIT PORTAL</div></div>
                  <div className="text-[8px] font-semibold tracking-[0.1em]">AUTHORISED FIELD AUDITOR</div>
                </div>
              </div>
              <svg className="absolute inset-x-0 top-[56px] h-[22px] w-full" viewBox="0 0 428 22" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 H428 V8 C340 28 300 -4 210 10 C120 24 60 6 0 14 Z" fill="#1F3A5F" /><path d="M0 14 C60 6 120 24 210 10 C300 -4 340 28 428 8 V14 C340 34 300 2 210 16 C120 30 60 12 0 20 Z" fill="#287a37" /></svg>
              <div className="absolute left-[22px] top-[88px] flex gap-[16px]">
                {c.photoUrl ? <img src={c.photoUrl} alt={c.fullName} className="h-[108px] w-[86px] shrink-0 rounded-[12px] border-2 border-[#1F3A5F] object-cover" />
                  : <div className="flex h-[108px] w-[86px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[#1F3A5F] bg-[#e6e8eb] text-[22px] font-semibold text-gray-500">{initials}</div>}
                <div className="w-[270px]">
                  <div className="truncate text-[19px] font-bold leading-[22px] text-[#111]">{c.fullName}</div>
                  <div className="text-[11px] font-semibold leading-[16px] text-[#287a37]">Field Auditor</div>
                  <dl className="mt-[8px] grid grid-cols-[102px_1fr] gap-x-[10px] gap-y-[8px]">
                    {[["ID No", c.auditorCode], ["D.O.B", fmt(c.dateOfBirth)], ["Phone", c.phone], ["Emergency contact", c.emergencyContact], ["Base location", c.baseLocation], ["Email", c.email]].map(([label, value]) => (
                      <div key={label} className="min-w-0"><dt className="text-[7.5px] uppercase leading-[9px] tracking-wide text-gray-500">{label}</dt><dd className="truncate text-[10.5px] font-semibold leading-[13px] text-[#111]">{value || "—"}</dd></div>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="absolute inset-x-[22px] bottom-[14px] flex gap-[84px] text-[8px] text-gray-500"><div className="flex-1 border-t border-gray-400 pt-[2px]">Auditor signature</div><div className="flex-1 border-t border-gray-400 pt-[2px]">Authorised signatory</div></div>
              <div className="absolute inset-x-0 bottom-0 h-[6px] bg-[#287a37]" />
            </div>

            {/* Back: verification, authority and scope */}
            <div className="absolute inset-0 overflow-hidden rounded-[14px] border border-[#d8dee8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] [backface-visibility:hidden]" style={{ transform: "rotateY(180deg)" }}>
              <div className="flex h-[34px] items-center justify-between bg-[#1F3A5F] px-[22px] text-white"><span className="text-[11px] font-bold tracking-[0.2em]">BEXEX AUDIT PORTAL</span><span className="text-[8px] tracking-[0.15em] text-white/80">VERIFICATION & AUTHORITY</span></div>
              <div className="absolute left-[22px] top-[48px] w-[104px] text-center"><img src={data.qr} alt="Verification code" className="h-[104px] w-[104px]" /><div className="mt-[2px] text-[7.5px] tracking-wide text-gray-500">SCAN TO VERIFY</div></div>
              <div className="absolute left-[146px] right-[22px] top-[48px]">
                <div className="text-[12px] font-semibold leading-[15px] text-[#111]">Verify this ID</div>
                <p className="mt-[2px] text-[9px] leading-[12px] text-gray-600">Scan the code, or enter the ID number on the verification page, before allowing access to your premises.</p>
                <dl className="mt-[9px] grid grid-cols-2 gap-x-[12px] gap-y-[7px]">
                  {[["Authority letter", c.authorityLetterNumber || "Pending"], ["Regions", (c.regions || []).join(", ") || "As assigned"], ["Skills", (c.skills || []).map((x) => SKILL_LABELS[x] || x).join(", "), true]].map(([label, value, wide]) => (
                    <div key={label} className={`min-w-0 ${wide ? "col-span-2" : ""}`}><dt className="text-[8px] uppercase leading-[10px] tracking-wide text-gray-500">{label}</dt><dd className="line-clamp-2 break-words text-[10.5px] font-semibold leading-[13px] text-[#111]">{value || "—"}</dd></div>
                  ))}
                </dl>
              </div>
              <div className="absolute inset-x-[22px] top-[164px] grid grid-cols-3 gap-[10px] rounded-[8px] bg-[#f3f5f7] px-[12px] py-[7px]">
                {[["Auditor ID", c.auditorCode], ["Issued", fmt(c.idIssuedAt || c.approvedAt)], ["Valid till", fmt(c.certificationExpiresAt)]].map(([label, value]) => (
                  <div key={label} className="min-w-0"><div className="text-[8px] uppercase leading-[10px] tracking-wide text-gray-500">{label}</div><div className="truncate text-[11px] font-bold leading-[15px] text-[#111]">{value || "—"}</div></div>
                ))}
              </div>
              <p className="absolute inset-x-[22px] bottom-[14px] text-[7.5px] leading-[10px] text-gray-500"><b className="font-semibold text-gray-700">DECLARATION</b> This card is issued by Bexex Global Pvt. Ltd. for the Bexex Audit Portal. It is valid only with the authority letter and until the date shown. The holder is authorised to carry out audits at the sites assigned to them and must show this card on every visit. If found, please return it to Bexex Global Pvt. Ltd.</p>
              <div className="absolute inset-x-0 bottom-0 h-[6px] bg-[#287a37]" />
            </div>
          </div>
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">Click the card to flip it.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={lightBtn} onClick={() => setViewer({ title: "Auditor ID card", subtitle: `${c.fullName} · ${c.auditorCode}`, url: `${base}/id-card/pdf`, filename: `${c.auditorCode}-id-card.pdf` })}><IdCard size={16} /> View ID card PDF</button>
        <button type="button" className={lightBtn} onClick={() => setViewer({ title: "Authority letter", subtitle: `${c.fullName} · ${c.authorityLetterNumber || "reference pending"}`, url: `${base}/authority-letter/pdf`, filename: `${c.auditorCode}-authority-letter.pdf` })}><FileText size={16} /> View authority letter</button>
        <button type="button" className={lightBtn} onClick={() => setViewer({ title: "Training certificate", subtitle: `${c.fullName} · ${c.auditorCode}`, url: `${base}/certificate/pdf`, filename: `${c.auditorCode}-certificate.pdf` })}><FileText size={16} /> View training certificate</button>
        {allowPhoto && <PhotoUpload userId={userId} hasPhoto={Boolean(c.photoUrl)} onSaved={() => { load(); onChanged?.(); }} />}
      </div>
      {!c.authorityLetterNumber && <p className="mt-2 text-xs text-[#7a4f00]">The authority letter number and certificate validity are set under Field readiness. Until then the card shows them as pending.</p>}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
