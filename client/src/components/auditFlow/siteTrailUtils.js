export const basePathFor = () => (localStorage.getItem("role") === "ADMIN" ? "/admin-dashboard" : "/user-dashboard");

// The location of a record in the network: Company › Zone › Regional office › Site.
// Each part links to that level of the network overview; the site links to its own page.
export function networkLinks(site, base = basePathFor()) {
  const q = (p) => `${base}?${new URLSearchParams(p).toString()}`;
  return {
    company: site.companyId ? q({ companyId: site.companyId }) : null,
    zone: site.companyId && site.zone ? q({ companyId: site.companyId, zone: site.zone }) : null,
    ro: site.companyId && site.zone && site.regionalOffice ? q({ companyId: site.companyId, zone: site.zone, ro: site.regionalOffice }) : null,
    site: site.id ? `${base}/site/${site.id}` : null,
  };
}

// Normalises the different shapes the API returns for a site.
export const siteShape = (l = {}) => ({
  id: l.id || l.locationId, locationName: l.locationName, dealerName: l.dealerName, locationCode: l.locationCode, zone: l.zone, regionalOffice: l.regionalOffice,
  companyId: l.companyId || l.programme?.companyId, company: l.company || l.programme?.company?.companyName,
});

