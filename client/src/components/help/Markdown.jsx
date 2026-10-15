// Tiny renderer for the policy and training text: "## heading", "- bullet", "1. step", **bold**, and paragraphs.
const inline = (text) => text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <b key={i} className="font-semibold">{part.slice(2, -2)}</b> : part));

export default function Markdown({ text, className = "" }) {
  const blocks = []; let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  String(text || "").split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); return; }
    if (line.startsWith("## ")) { flush(); blocks.push({ type: "h", key: i, text: line.slice(3) }); return; }
    const bullet = /^- (.*)/.exec(line); const num = /^\d+\.\s+(.*)/.exec(line);
    if (bullet || num) {
      const kind = bullet ? "ul" : "ol";
      if (!list || list.type !== kind) { flush(); list = { type: kind, key: i, items: [] }; }
      list.items.push((bullet || num)[1]); return;
    }
    flush(); blocks.push({ type: "p", key: i, text: line });
  });
  flush();
  return (
    <div className={`space-y-2.5 text-[14px] leading-relaxed text-[#2b2b2b] ${className}`}>
      {blocks.map((b) => b.type === "h" ? <h3 key={b.key} className="pt-2 text-[15px] font-semibold text-[#181919]">{b.text}</h3>
        : b.type === "p" ? <p key={b.key}>{inline(b.text)}</p>
        : b.type === "ul" ? <ul key={b.key} className="list-disc space-y-1 pl-5">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
        : <ol key={b.key} className="list-decimal space-y-1 pl-5">{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>)}
    </div>
  );
}
