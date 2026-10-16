import { Link } from "react-router-dom";

export const inputClass =
  "mt-1 w-full rounded-xl border border-[#CECECE] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#63C174] focus:ring-2 focus:ring-[#63C174]/20 disabled:bg-[#f3f4f6] disabled:text-gray-500";
export const labelClass = "text-sm font-medium text-[#374151]";
export const cardClass = "rounded-3xl bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.08)]";
export const darkBtn =
  "inline-flex items-center gap-2 rounded-xl bg-[#181919] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50";
export const lightBtn =
  "inline-flex items-center gap-2 rounded-xl border border-[#CECECE] bg-white px-4 py-2.5 text-sm font-medium text-[#20242c] hover:bg-gray-50 disabled:opacity-50";

export function Field({ label, children, span }) {
  return (
    <label className={`block ${span || ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function PageTitle({ title, subtitle, actions, crumbs }) {
  return (
    <div className={`mb-6 ${cardClass}`}>
      {crumbs && (
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="flex items-center gap-1">
              {index > 0 && <span>/</span>}
              {crumb.to ? <Link to={crumb.to} className="inline-block py-1 hover:underline">{crumb.label}</Link> : <span>{crumb.label}</span>}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#20242c]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  DRAFT: "bg-[#f1f1f1] text-[#555]",
  RETURNED: "bg-[#fff3e0] text-[#9a5200]",
  SUBMITTED: "bg-[#e8f1fd] text-[#1e61ad]",
  APPROVED: "bg-[#eaf8ed] text-[#287a37]",
  REJECTED: "bg-[#fdecec] text-[#b42318]",
};
const STATUS_LABELS = { DRAFT: "Draft", RETURNED: "Returned", SUBMITTED: "In review", APPROVED: "Approved", REJECTED: "Rejected" };

export function StatusPill({ status }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function CompanyLogo({ company, size = "h-14 w-14" }) {
  if (company.logoUrl) {
    return <img src={company.logoUrl} alt="" className={`${size} rounded-2xl border border-[#e4e8ed] bg-white object-contain`} />;
  }
  const letters = (company.companyName || "?").split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`${size} flex items-center justify-center rounded-2xl bg-[#e8f5ea] text-lg font-semibold text-[#287a37]`}>
      {letters}
    </div>
  );
}

export function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6e8eb]">
      <div className="h-full rounded-full bg-[#63C174] transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Modal({ title, children, onClose, wide }) {
  return (
    <div className="anim-fade fixed inset-0 z-[200] flex items-center justify-center bg-[#141413]/45 p-4 backdrop-blur-[2px]">
      <div className={`anim-rise modal-surface max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white m-auto p-6 shadow-[0_24px_60px_rgba(20,20,19,0.22)] ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

