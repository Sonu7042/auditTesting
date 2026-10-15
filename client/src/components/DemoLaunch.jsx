import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Opened by Back-Admin's Demo Portals page. It waits for the session handed over by the opening window, stores it in this
// window only, and goes to the dashboard of that role.
export default function DemoLaunch() {
  const navigate = useNavigate();
  const message = window.opener ? "Preparing the demo..." : "Open this page from Back-Admin's Demo Portals screen.";

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== "demo-session") return;
      const { token, user } = e.data;
      localStorage.setItem("token", token); localStorage.setItem("role", user.role); localStorage.setItem("user", JSON.stringify(user));
      sessionStorage.setItem("devicePin", "demo");
      const base = user.role === "AUDITOR" ? "/auditor-dashboard" : "/user-dashboard";
      navigate(base, { replace: true });
    };
    window.addEventListener("message", onMessage);
    if (window.opener) window.opener.postMessage({ type: "demo-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return <div className="flex min-h-screen items-center justify-center bg-[#f1f1f1] text-sm text-gray-600">{message}</div>;
}
