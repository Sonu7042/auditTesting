import { isDemoWindow } from "../../utils/demoWindow";

// Shown in every demo window so nobody mistakes the preview for a real login.
export default function DemoBanner() {
  if (!isDemoWindow()) return null;
  let user = null; try { user = JSON.parse(localStorage.getItem("user") || "null"); } catch { /* ignore */ }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#181919] px-4 py-2 text-xs text-white">
      <span><b>DEMO VIEW</b> · You are seeing the portal as {user?.fullName || "a user"} ({(user?.role || "").replaceAll("_", " ").toLowerCase()}). It is read-only: nothing you do here changes data.</span>
      <button className="rounded-lg border border-white/40 px-3 py-1" onClick={() => window.close()}>Close demo</button>
    </div>
  );
}
