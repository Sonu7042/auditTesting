// Development-only layout audit: run window.__audit() on any screen to list clipped text,
// content off screen, overlaps, tiny text, small tap targets and low contrast.
const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.95) return c; n = n.parentElement; } return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; };
const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05; };
const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : ""} "${(el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
const insideScroller = (el) => { let n = el.parentElement; while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX)) return true; n = n.parentElement; } return false; };

export function installAudit() {
  window.__audit = () => {
    const issues = []; const add = (type, el, extra = "") => issues.push({ type, el: label(el), extra });
    const vw = document.documentElement.clientWidth;
    const all = [...document.querySelectorAll("body *")].filter((el) => !el.closest("svg") && !el.closest("[data-audit-skip]"));
    const docOverflow = document.documentElement.scrollWidth - vw;
    for (const el of all) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(s.overflowX) && el.clientWidth > 0 && (hasText || el.children.length)) add(s.textOverflow === "ellipsis" ? "ellipsis" : "clipped-x", el, `${el.scrollWidth}>${el.clientWidth}`);
      else if (hasText && s.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) add("ellipsis", el, `${el.scrollWidth}>${el.clientWidth}`);
      if (el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(s.overflowY) && s.display !== "inline" && hasText) add("clipped-y", el, `${el.scrollHeight}>${el.clientHeight}`);
      if ((r.right > vw + 1 || r.left < -1) && !insideScroller(el) && r.width < vw * 3 && s.position !== "fixed") add("offscreen", el, `left ${Math.round(r.left)} right ${Math.round(r.right)} of ${vw}`);
      if (hasText) {
        const fs = parseFloat(s.fontSize);
        if (fs < 12) add("small-text", el, `${fs}px`);
        const fg = parse(s.color); const bg = bgOf(el);
        if (fg && fg.a > 0.5) { const l1 = lum(fg); const l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); const large = fs >= 18 || (fs >= 14 && parseInt(s.fontWeight, 10) >= 700); if (ratio < (large ? 3 : 4.5) && !(el.disabled || el.closest("[disabled]") || el.closest(".opacity-50, .opacity-40"))) add("contrast", el, `${ratio.toFixed(1)}:1 ${s.color} on rgb(${bg.r},${bg.g},${bg.b})`); }
      }
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !el.disabled && el.type !== "hidden" && el.type !== "checkbox" && el.type !== "radio" && el.type !== "file") {
        const inlineLink = el.tagName === "A" && getComputedStyle(el).display.startsWith("inline");
        if (inlineLink ? r.height < 24 : (r.height < 32 || r.width < 32)) add("small-target", el, `${Math.round(r.width)}x${Math.round(r.height)}`);
        if (el.tagName === "BUTTON" && !el.innerText.trim() && !el.getAttribute("aria-label") && !el.title) add("no-label", el);
      }
    }
    // overlaps between siblings that are both in normal flow
    for (const p of document.querySelectorAll("body *")) {
      if (p.closest("svg") || !visible(p)) continue;
      const kids = [...p.children].filter((k) => visible(k) && ["static", "relative"].includes(getComputedStyle(k).position) && (k.innerText || "").trim());
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(); const b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left); const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 4 && h > 4) add("overlap", kids[i], `with ${label(kids[j])} (${Math.round(w)}x${Math.round(h)})`);
      }
    }
    const seen = new Set(); const out = issues.filter((i) => { const k = `${i.type}|${i.el}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const counts = out.reduce((a, i) => ({ ...a, [i.type]: (a[i.type] || 0) + 1 }), {});
    return { path: location.pathname + location.search, vw, docOverflow, counts, issues: out.slice(0, 40) };
  };
}
