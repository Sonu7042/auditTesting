import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Award, ShieldAlert } from "lucide-react";

const domain = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

export default function VerifyCertificate() {
  const { code } = useParams();
  const [res, setRes] = useState(null);
  useEffect(() => { fetch(`${domain}/governance/verify/${code}`).then((r) => r.json()).then(setRes).catch(() => setRes({ valid: false })); }, [code]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f1f1] p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow">
        <div className="mb-2 text-xl font-semibold tracking-wide">bexex</div>
        {!res ? <p className="text-sm text-gray-500">Checking...</p> : res.valid ? (
          <>
            <Award className="mx-auto mb-2 text-[#c9a227]" size={40} />
            <h1 className="text-lg font-semibold text-[#287a37]">Genuine certificate</h1>
            <p className="mt-3 text-xl font-semibold">{res.certificate.nodeName}</p>
            <p className="text-sm text-gray-600">{res.certificate.companyName}</p>
            <p className="mt-3 text-sm">Rank #{res.certificate.rank} · {res.certificate.metric === "SAFETY" ? "Safety performance" : "Overall index"} · {res.certificate.score}%</p>
            <p className="text-xs text-gray-500">{res.certificate.period}</p>
          </>
        ) : (<><ShieldAlert className="mx-auto mb-2 text-[#b42318]" size={40} /><h1 className="text-lg font-semibold text-[#b42318]">Certificate not found</h1><p className="mt-2 text-sm text-gray-600">This code does not match an issued certificate.</p></>)}
        <p className="mt-6 text-xs text-gray-500">{code}</p>
      </div>
    </div>
  );
}
