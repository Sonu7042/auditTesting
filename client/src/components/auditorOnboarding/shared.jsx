export function Pill({ meta }) {
  if (!meta) return null;
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>{meta.label}</span>;
}

export function ScoreRing({ value, size = 56 }) {
  const has = value !== null && value !== undefined;
  const r = (size - 8) / 2; const c = 2 * Math.PI * r;
  const color = !has ? "#cecece" : value >= 80 ? "#63C174" : value >= 60 ? "#f0a030" : "#e5484d";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e8eb" strokeWidth="6" />
        {has && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, value)) / 100} />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">{has ? `${Math.round(value)}%` : "—"}</div>
    </div>
  );
}
