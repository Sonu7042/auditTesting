import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { networkLinks, siteShape } from "./siteTrailUtils";

const part = (label, to) => (to ? <Link to={to} onClick={(e) => e.stopPropagation()} className="inline-block py-1 hover:text-[#287a37] hover:underline">{label}</Link> : <span>{label}</span>);

export function SiteTrail({ site, className = "" }) {
  const s = siteShape(site); const l = networkLinks(s);
  const items = [s.company && part(s.company, l.company), s.zone && part(`${s.zone}`, l.zone), s.regionalOffice && part(s.regionalOffice, l.ro)].filter(Boolean);
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-xs text-gray-500 ${className}`}>
      {items.map((el, i) => <span key={i} className="inline-flex items-center gap-1">{i > 0 && <ChevronRight size={11} className="text-gray-300" />}{el}</span>)}
    </span>
  );
}

// Site name as a link to the site page, with its trail underneath.
export function SiteLink({ site, showDealer = true }) {
  const s = siteShape(site); const l = networkLinks(s);
  return (
    <div>
      {l.site ? <Link to={l.site} onClick={(e) => e.stopPropagation()} className="inline-block py-0.5 font-medium text-[#20242c] hover:text-[#287a37] hover:underline">{s.locationName}</Link> : <span className="font-medium">{s.locationName}</span>}
      {showDealer && s.dealerName && <div className="text-xs text-gray-500">{s.dealerName}{s.locationCode ? ` · ${s.locationCode}` : ""}</div>}
      <SiteTrail site={s} />
    </div>
  );
}
