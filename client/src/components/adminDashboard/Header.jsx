import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiKey, FiLogOut, FiMoon } from "react-icons/fi";
import useNotifications from "../../hooks/useNotifications";
import { resolveNotificationLink } from "../../utils/notificationRoutes";
import bell from "../../assets/header/Bell_icon.svg";
import helpSupport from "../../assets/header/help_icon.svg";
import InitialAvatar from "../InitialAvatar";
import ThemeSwitcher from "../common/ThemeSwitcher";

const formatRole = (role) => (role ? role.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "User");

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    localStorage.removeItem("user");
    return null;
  }
};

const formatTime = (date) => (date ? new Date(date).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

// First match wins; titles follow the sidebar wording.
const TITLES = [
  ["training-content", "Training Content"],
  ["site-change-requests", "Change Requests"],
  ["hierarchy", "Hierarchy"],
  ["approvals", "Reviews & Approvals"],
  ["instruments", "Instruments"],
  ["performance", "Performance"],
  ["demo-portals", "Demo Portals"],
  ["site-onboarding/review", "Review Queue"],
  ["site-onboarding", "Companies & Sites"],
  ["checklist-proposals", "Proposed Points"],
  ["client-checklist-designer", "Checklist Library"],
  ["auditor-onboarding", "Auditor Onboarding"],
  ["training", "Training & Quiz"],
  ["profile", "My Profile & ID Card"],
  ["client-audit-scheduling", "Scheduling"],
  ["client-calendar", "Calendar"],
  ["calendar", "Calendar"],
  ["client-notices", "Notifications & Escalations"],
  ["new-report", "New Report"],
  ["audits-in-progress", "Audits In Progress"],
  ["audit/", "Audit"],
  ["qc/anomalies", "Anomaly Flags"],
  ["qc", "QC Queue"],
  ["reports-hub", "Reports"],
  ["client-audit-reports", "Corrections"],
  ["client-nc-capa", "NC & CAPA"],
  ["risk-register", "Risk Register"],
  ["rankings", "Leaderboard"],
  ["awards", "Awards & Certificates"],
  ["access", "Access & Roles"],
  ["change-password", "Change Password"],
  ["help-admin", "Help Content"],
  ["help", "Help & Training"],
  ["notifications", "Notifications"],
  ["site/", "Site Dashboard"],
  ["stage/", "Process Stage"],
];

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(false);
  const [openNotification, setOpenNotification] = useState(false);
  const user = getStoredUser();
  const role = localStorage.getItem("role");
  const base = role === "ADMIN" ? "/admin-dashboard" : role === "AUDITOR" ? "/auditor-dashboard" : "/user-dashboard";
  const displayName = user?.fullName || user?.username || "User";
  const menuRef = useRef(null);
  const bellRef = useRef(null);
  const { notifications, loading, error, fetchNotifications, markAsRead } = useNotifications();

  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpenNotification(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const logout = () => {
    ["token", "role", "user", "devicePin", "auditorTheme"].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("devicePin");
    setOpenMenu(false);
    navigate("/", { replace: true });
  };

  const openTarget = (n) => {
    const link = resolveNotificationLink(n);
    markAsRead(n.id);
    setOpenNotification(false);
    if (link) navigate(link);
  };

  const path = location.pathname.toLowerCase().replace(`${base}/`, "");
  const title = path === base || location.pathname.toLowerCase() === base ? "Dashboard" : TITLES.find(([k]) => path.startsWith(k) || path.includes(k))?.[1] || "Dashboard";

  const menuButton = "group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition hover:bg-white";
  const menuIcon = "flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition group-hover:border-[#181919] group-hover:bg-[#181919] group-hover:text-white";

  return (
    <div className="mb-4 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="min-w-0 text-2xl font-semibold text-gray-800 md:text-3xl">{title}</h1>

      {/* Auditors have the bell and profile menu in their own top bar. */}
      <div className={`items-center gap-3 md:gap-4 ${role === "AUDITOR" ? "hidden" : "flex"}`}>
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => setOpenNotification((v) => !v)}
            aria-label="Notifications"
            className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
          >
            <img src={bell} className="w-5 invert-dark" alt="" />
            {notifications.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">{notifications.length}</span>
            )}
          </button>

          {openNotification && (
            <div className="anim-pop absolute right-0 top-14 z-50 w-[min(620px,calc(100vw-2rem))] overflow-hidden rounded-[16px] border border-[#d6d6d6] bg-[#f8f8f8] shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
              <div className="flex items-center justify-between border-b border-[#d8d8d8] px-4 py-3">
                <h2 className="text-[20px] font-semibold text-[#181919]">Notifications</h2>
                <button type="button" onClick={fetchNotifications} disabled={loading} className="text-[14px] font-medium text-[#111] underline underline-offset-2 disabled:opacity-50">
                  {loading ? "Refreshing" : "Refresh"}
                </button>
              </div>
              <div className="max-h-[430px] overflow-y-auto p-3">
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                ) : notifications.length === 0 ? (
                  <div className="rounded-lg bg-white px-4 py-8 text-center text-sm text-[#666]">{loading ? "Loading notifications..." : "No new notifications."}</div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <button type="button" key={n.id} onClick={() => openTarget(n)} className="w-full rounded-xl border border-[#e1e1e1] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#bdbdbd]">
                        <h3 className="text-[15px] font-semibold text-[#181919]">{n.title}</h3>
                        <p className="mt-1 text-[13px] leading-5 text-[#555]">{n.message}</p>
                        <p className="mt-2 text-xs text-[#888]">{formatTime(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => setOpenMenu((v) => !v)} aria-label="Open profile menu" className="h-10 w-10 cursor-pointer overflow-hidden rounded-full border-[3px] border-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
            <InitialAvatar name={displayName} className="h-full w-full" textClassName="text-[16px]" />
          </button>

          {openMenu && (
            <div className="anim-pop absolute right-0 top-14 z-50 w-[310px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[30px] border border-[#e5e5e5] bg-[#f8f8f8]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur-xl">
              <div className="flex flex-col items-center border-b border-[#e6e6e6] px-6 pb-6 pt-6">
                <InitialAvatar name={displayName} className="mb-4 h-24 w-24 bg-[#181919] shadow-lg" textClassName="text-[34px]" />
                <h2 className="text-center text-[22px] font-semibold leading-tight text-[#181919]">{displayName}</h2>
                <p className="mt-2 text-[14px] font-medium text-[#6d6d6d]">{formatRole(user?.role || role)}</p>
                {user?.username && <p className="mt-1 font-mono text-[12px] tracking-wider text-[#6d6d6d]">{user.username}</p>}
              </div>
              <div className="py-3">
                <button type="button" onClick={() => { setOpenMenu(false); navigate(`${base}/change-password`); }} className={menuButton}>
                  <span className={menuIcon}><FiKey size={16} /></span>
                  <span className="text-[15px] font-medium text-[#1f1f1f]">Change password</span>
                </button>
                <button type="button" onClick={() => { setOpenMenu(false); navigate(`${base}/help`); }} className={menuButton}>
                  <span className={menuIcon}><img src={helpSupport} className="w-4 invert-dark group-hover:brightness-0 group-hover:invert" alt="" /></span>
                  <span className="text-[15px] font-medium text-[#1f1f1f]">Help & Support</span>
                </button>
                <div className="px-4 py-3">
                  <div className="mb-2 text-[12px] font-medium text-[#6b7280]">Theme</div>
                  <ThemeSwitcher />
                </div>
                <button type="button" onClick={logout} className={menuButton}>
                  <span className={menuIcon}><FiLogOut size={16} /></span>
                  <span className="text-[15px] font-medium text-[#1f1f1f]">Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
