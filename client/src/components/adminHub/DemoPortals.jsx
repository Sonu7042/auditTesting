import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import Header from "../adminDashboard/Header";
import domain from "../../api/domain";
import { PageTitle, cardClass, darkBtn } from "../siteOnboarding/ui";

// Back-Admin opens any role's portal in its own window to show the client how it looks and what each person can see.
// The preview is a real, read-only "view as" session: the same screens and data, no passwords shared, no changes possible.
export default function DemoPortals() {
  const [personas, setPersonas] = useState(null);
  const [busy, setBusy] = useState("");
  const pending = useRef(null);

  useEffect(() => { axios.get(`${domain}/admin-hub/demo-personas`).then(({ data }) => setPersonas(data.personas)); }, []);

  useEffect(() => {
    const onMessage = (e) => {
      const p = pending.current;
      if (!p || e.origin !== window.location.origin || e.source !== p.win || e.data?.type !== "demo-ready") return;
      p.ready = true; if (p.session) p.win.postMessage({ type: "demo-session", ...p.session }, window.location.origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const open = async (role) => {
    // Open the window first, inside the click, so the browser does not block it.
    const win = window.open("/demo-launch", `bexex-demo:${role}`, "width=1440,height=900");
    if (!win) return toast.error("Allow pop-ups for this site to open the demo window.");
    pending.current = { win, ready: false, session: null };
    setBusy(role);
    try {
      const { data } = await axios.post(`${domain}/admin-hub/demo-session`, { role });
      pending.current.session = { token: data.token, user: data.user };
      if (pending.current.ready) win.postMessage({ type: "demo-session", ...pending.current.session }, window.location.origin);
    } catch { win.close(); } finally { setBusy(""); }
  };

  if (!personas) return <div><Header /><p className="text-sm text-gray-500">Loading...</p></div>;
  return (
    <div>
      <Header />
      <PageTitle title="Demo portals" subtitle="Open any role's portal in a new window, exactly as that person sees it, for client demos and training. The preview is read-only and your own login stays untouched." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {personas.map((p) => (
          <section key={p.role} className={cardClass}>
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="mt-1 min-h-[60px] text-sm text-gray-500">{p.description}</p>
            <p className="mt-3 text-xs text-gray-500">{p.available ? <>Shown as <b>{p.user.fullName}</b> ({p.user.username})</> : "No active user with this role yet. Add one in Access & Roles or import users from Excel."}</p>
            <button className={`${darkBtn} mt-4`} disabled={!p.available || busy === p.role} onClick={() => open(p.role)}><ExternalLink size={16} /> {busy === p.role ? "Opening..." : "Open in new window"}</button>
          </section>
        ))}
      </div>
    </div>
  );
}
