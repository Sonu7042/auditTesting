import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { darkBtn, lightBtn } from "../siteOnboarding/ui";

// In-app camera only: there is deliberately no file picker. The capture is stamped
// with the time and location so it cannot be passed off as an older photo.
const stampFrame = (canvas, label) => {
  const ctx = canvas.getContext("2d");
  const h = 34;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, canvas.height - h, canvas.width, h);
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText(label, 10, canvas.height - 12);
};

export default function CameraCapture({ title = "Take photo", stampText, allowSample = false, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => null); }
        setReady(true);
      })
      .catch(() => setError("The camera is not available. Allow camera access and try again."));
    return () => { active = false; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const label = () => `${new Date().toLocaleString("en-IN")}${stampText ? `  |  ${stampText}` : ""}`;
  const finish = (canvas) => canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.85);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    stampFrame(canvas, label());
    finish(canvas);
  };

  // Demo audits only: a generated, stamped frame so the flow can be shown without a camera.
  const sample = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#cfd8e3"; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#5b6b7d"; ctx.font = "28px sans-serif"; ctx.fillText("DEMO EVIDENCE", 200, 230);
    ctx.font = "14px sans-serif"; ctx.fillText(String(Math.random()).slice(2, 10), 260, 260);
    stampFrame(canvas, label());
    finish(canvas);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {error ? <p className="rounded-xl bg-[#fdecec] p-3 text-sm text-[#b42318]">{error}</p> : <video ref={videoRef} playsInline muted className="aspect-video w-full rounded-xl bg-black" />}
        <p className="mt-2 text-xs text-gray-500">Photos can only be taken here. Gallery and file upload are disabled. Time and location are stamped on every photo.</p>
        <div className="mt-4 flex justify-end gap-2">
          {allowSample && <button className={lightBtn} onClick={sample}>Use demo image</button>}
          <button className={darkBtn} disabled={!ready} onClick={snap}><Camera size={16} /> Capture</button>
        </div>
      </div>
    </div>
  );
}
