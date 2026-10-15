import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Monitor } from "lucide-react";
import Sidebar from "./Sidebar";
import AuditorHeader from "./AuditorHeader";
import FirstRunGate from "../help/FirstRunGate";
import DemoBanner from "../common/DemoBanner";
import { isDemoWindow } from "../../utils/demoWindow";

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuditor = localStorage.getItem("role") === "AUDITOR";
  const [isAuditorMenuOpen, setIsAuditorMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const pin = sessionStorage.getItem("devicePin");

    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    if (!pin) {
      navigate("/set-pin", { replace: true });
      return;
    }

    // Accounts created by the portal start on a one-time password; make the person choose their own first.
    try {
      const mustChange = JSON.parse(localStorage.getItem("user") || "null")?.mustChangePassword;
      if (mustChange && !location.pathname.endsWith("/change-password")) {
        const role = localStorage.getItem("role");
        const base = role === "ADMIN" ? "/admin-dashboard" : role === "AUDITOR" ? "/auditor-dashboard" : "/user-dashboard";
        navigate(`${base}/change-password`, { replace: true });
      }
    } catch { /* ignore a corrupt stored user */ }
  }, [navigate, location.pathname]);

  // Auditor Panel - Works on every device
  if (isAuditor) {
    return (
      <div className="bg-[#f1f1f1] min-h-screen">
        <DemoBanner />
        <div className="mx-auto min-h-screen w-full max-w-full bg-[#F1F1F1] px-5 py-6 overflow-y-auto no-scrollbar">
          <AuditorHeader
            isMenuOpen={isAuditorMenuOpen}
            setIsMenuOpen={setIsAuditorMenuOpen}
          />
          {!isDemoWindow() && !location.pathname.endsWith("/change-password") && <FirstRunGate basePath="/auditor-dashboard" />}

          <div key={location.pathname} className="anim-page">
            <Outlet />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f1f1f1]">
      <DemoBanner />
      <div className="flex h-screen items-center justify-center p-6 lg:hidden">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f1f1] text-[#181919]">
            <Monitor size={22} />
          </div>

          <h2 className="mt-4 text-[22px] font-semibold text-[#181919]">
            Desktop access only
          </h2>

          <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
            Admin and user panels require a screen width of at least 1024px.
            Open this portal on a desktop or enlarge the browser window to
            continue.
          </p>
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 lg:flex">
        <Sidebar />
        {!isDemoWindow() && !location.pathname.endsWith("/change-password") && <FirstRunGate basePath={localStorage.getItem("role") === "ADMIN" ? "/admin-dashboard" : "/user-dashboard"} />}

        <div className="flex h-full flex-1 flex-col overflow-hidden p-6">
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div key={location.pathname} className="anim-page">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}