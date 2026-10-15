import { useEffect, useState } from "react";
import axios from "axios";
import { Award, Eye } from "lucide-react";
import domain from "../../api/domain";
import DocumentViewer from "../common/DocumentViewer";
import { cardClass, lightBtn } from "../siteOnboarding/ui";
import { fmtDate } from "../auditFlow/helpers";

const METRIC = { OVERALL: "Overall index", SAFETY: "Safety performance" };
const LEVEL = { SITE: "This site", RO: "Regional office", ZONE: "Zone" };

// Awards belong on the site's own page: the certificates this site, its regional office and its zone have won, each with the
// signed certificate PDF. They are issued when Back-Admin closes an award period and approves the certificates.
export default function SiteAwards({ site }) {
  const [certs, setCerts] = useState(null); const [viewer, setViewer] = useState(null);
  useEffect(() => { axios.get(`${domain}/governance/certificates`).then(({ data }) => setCerts(data.certificates || [])); }, []);
  if (certs === null) return null;
  const keys = { [`SITE:${site.id}`]: "SITE", [`RO:${site.zone}|${site.regionalOffice}`]: "RO", [`ZONE:${site.zone}`]: "ZONE" };
  const mine = certs.filter((c) => keys[c.nodeKey] && c.status === "APPROVED");
  return (
    <section className={cardClass}>
      <h2 className="mb-1 text-lg font-semibold">Awards & certificates</h2>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">Recognition earned by this site, its regional office and its zone. Certificates can be verified by anyone through the QR code.</p>
      {mine.length === 0 ? <p className="text-sm text-gray-500">No awards yet. Awards are issued when an award period is closed and the certificates are approved.</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{mine.map((c) => (
          <div key={c.id} className="rounded-2xl border border-[#e1e5ea] p-4">
            <div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fff6e8] text-[#9a5200]"><Award size={20} /></span><div><div className="text-sm font-semibold">Rank {c.rank} · {LEVEL[keys[c.nodeKey]]}</div><div className="text-xs text-gray-500">{c.period?.label} · {METRIC[c.metric] || c.metric}</div></div></div>
            <div className="mt-3 text-2xl font-semibold">{c.score}%</div><div className="text-xs text-gray-500">{c.nodeName} · issued {fmtDate(c.issuedAt)}</div>
            <button className={`${lightBtn} mt-3`} onClick={() => setViewer({ title: "Certificate", subtitle: `${c.nodeName} · rank ${c.rank}`, url: `${domain}/governance/certificates/${c.id}/pdf`, filename: `${c.code}.pdf` })}><Eye size={16} /> View certificate</button>
          </div>))}</div>
      )}
      {viewer && <DocumentViewer {...viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}
