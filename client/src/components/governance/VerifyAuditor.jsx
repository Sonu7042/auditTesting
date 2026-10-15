import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, ShieldAlert } from "lucide-react";

const domain = import.meta.env.VITE_API_URL || "http://localhost:5001/api";
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not set");

export default function VerifyAuditor() {
  const { code } = useParams();
  const [res, setRes] = useState(null);
  useEffect(() => { fetch(`${domain}/auditor-onboarding/verify/${code}`).then((r) => r.json()).then(setRes).catch(() => setRes({ valid: false })); }, [code]);
  const a = res?.auditor;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f1f1] p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow">
        <div className="mb-4"><div className="text-xl font-semibold tracking-wide">bexex</div><div className="text-xs text-gray-500">Bexex Global Pvt. Ltd. · Bexex Audit Portal</div></div>
        {!res ? <p className="text-sm text-gray-500">Checking...</p> : !a ? (
          <><ShieldAlert className="mx-auto mb-2 text-[#b42318]" size={40} /><h1 className="text-lg font-semibold text-[#b42318]">ID not found</h1><p className="mt-2 text-sm text-gray-600">This ID does not match an auditor. Do not give access to your premises.</p></>
        ) : (
          <>
            {a.photoUrl && <img src={a.photoUrl} alt={a.fullName} className="mx-auto mb-3 h-28 w-[90px] rounded-xl border border-[#e4e8ed] object-cover" />}
            {res.valid ? <BadgeCheck className="mx-auto mb-1 text-[#287a37]" size={34} /> : <ShieldAlert className="mx-auto mb-1 text-[#b42318]" size={34} />}
            <h1 className={`text-lg font-semibold ${res.valid ? "text-[#287a37]" : "text-[#b42318]"}`}>{res.valid ? "Authorised auditor" : "Not currently authorised"}</h1>
            <p className="mt-2 break-words text-xl font-semibold">{a.fullName}</p>
            <p className="text-sm text-gray-600">{a.auditorCode}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-left text-sm">
              <div><dt className="text-xs text-gray-500">Valid till</dt><dd>{fmt(a.validTill)}</dd></div>
              <div><dt className="text-xs text-gray-500">Authority letter</dt><dd className="break-words">{a.authorityLetterNumber || "Pending"}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-gray-500">Regions</dt><dd className="break-words">{(a.regions || []).join(", ") || "As assigned"}</dd></div>
            </dl>
            {!res.valid && <p className="mt-4 rounded-xl bg-[#fdecec] p-3 text-sm text-[#b42318]">Ask the auditor to contact the audit team before entering your premises.</p>}
          </>
        )}
      </div>
    </div>
  );
}
