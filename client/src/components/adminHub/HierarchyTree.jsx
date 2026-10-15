import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, MapPin, Network, Store, Users } from "lucide-react";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass } from "../siteOnboarding/ui";

const ICON = { COMPANY: Building2, ZONE: Network, REGIONAL_OFFICE: MapPin, SITE: Store };
const LEVEL = { COMPANY: "Company", ZONE: "Zone", REGIONAL_OFFICE: "Regional office", SITE: "Site" };
const scoreColor = (v) => (v === null || v === undefined ? "text-gray-400" : v >= 85 ? "text-[#287a37]" : v >= 70 ? "text-[#9a5200]" : "text-[#b42318]");

function Node({ node, depth, open, toggle, onSite }) {
  const Icon = ICON[node.level]; const hasKids = node.children.length > 0; const isOpen = open[`${node.level}:${node.key}`] ?? depth < 1;
  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl py-2 pr-2 hover:bg-[#f7f8fa]" style={{ paddingLeft: depth * 24 + 8 }}>
        <button type="button" className="flex h-6 w-6 items-center justify-center text-gray-500" onClick={() => hasKids && toggle(`${node.level}:${node.key}`, isOpen)} aria-label={isOpen ? "Collapse" : "Expand"}>{hasKids ? (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</button>
        <Icon size={16} className="shrink-0 text-gray-500" />
        <button type="button" disabled={node.level !== "SITE"} onClick={() => node.level === "SITE" && onSite(node)} className="min-w-0 flex-1 truncate text-left text-sm font-medium disabled:cursor-default">{node.name}{node.sub ? <span className="ml-2 text-xs font-normal text-gray-500">{node.sub}</span> : null}</button>
        <span className="hidden w-24 text-xs text-gray-500 md:block">{LEVEL[node.level]}</span>
        <span className="w-20 text-xs text-gray-500">{node.level === "SITE" ? (node.auditedCount ? "Audited" : "Not audited") : `${node.siteCount} site${node.siteCount === 1 ? "" : "s"}`}</span>
        <span className="hidden w-14 items-center gap-1 text-xs text-gray-500 md:flex"><Users size={12} />{node.users}</span>
        <span className={`w-16 text-right text-sm font-semibold ${scoreColor(node.overall)}`}>{node.overall === null ? "—" : `${node.overall}%`}</span>
        <span className="hidden w-16 text-right text-xs md:block">{node.openCritical ? <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-[#b42318]">{node.openCritical} crit</span> : null}</span>
      </div>
      {hasKids && isOpen && <ul>{node.children.map((c) => <Node key={`${c.level}:${c.key}`} node={c} depth={depth + 1} open={open} toggle={toggle} onSite={onSite} />)}</ul>}
    </li>
  );
}

// The network as one tree: company, zone, regional office, site. It is built from each site's own zone and regional office,
// and every user's access is one node of this tree and everything below it.
export default function HierarchyTree() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});
  useEffect(() => { axios.get(`${domain}/admin-hub/hierarchy`).then(({ data: d }) => setData(d)); }, []);
  if (!data) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  const toggle = (key, isOpen) => setOpen((o) => ({ ...o, [key]: !isOpen }));
  const base = window.location.pathname.startsWith("/admin-dashboard") ? "/admin-dashboard" : "/user-dashboard";

  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Site Onboarding" }, { label: "Hierarchy" }]} title="Network hierarchy" subtitle={`${data.totals.siteCount} sites, ${data.totals.auditedCount} audited. Each user sees one node and everything below it.`} />
      <section className={cardClass}>
        <div className="mb-2 flex items-center gap-3 px-2 text-xs uppercase tracking-wide text-gray-500"><span className="flex-1 pl-9">Node</span><span className="hidden w-24 md:block">Level</span><span className="w-20">Sites</span><span className="hidden w-14 md:block">Users</span><span className="w-16 text-right">Score</span><span className="hidden w-16 md:block" /></div>
        {data.tree.length === 0 ? <p className="text-sm text-gray-500">No sites yet.</p> : <ul>{data.tree.map((n) => <Node key={n.key} node={n} depth={0} open={open} toggle={toggle} onSite={(s) => navigate(`${base}/site/${s.locationId}`)} />)}</ul>}
      </section>
    </div>
  );
}
