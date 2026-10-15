import { useEffect, useRef, useState } from "react";
import { lightBtn } from "../siteOnboarding/ui";

export default function SignaturePad({ onChange, height = 140 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    canvas.width = canvas.offsetWidth; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
  }, [height]);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { drawing.current = true; const ctx = ref.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(...pos(e)); ref.current.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!drawing.current) return; const ctx = ref.current.getContext("2d"); ctx.lineTo(...pos(e)); ctx.stroke(); setEmpty(false); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange?.(ref.current.toDataURL("image/png")); };
  const clear = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setEmpty(true); onChange?.(""); };

  return (
    <div>
      <canvas ref={ref} style={{ height, touchAction: "none" }} className="w-full rounded-xl border border-dashed border-[#9aa4b2] bg-white" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500 gap-3"><span>{empty ? "Sign in the box" : "Signature captured"}</span><button type="button" className={`${lightBtn} !px-3 !py-1.5`} onClick={clear}>Clear</button></div>
    </div>
  );
}
