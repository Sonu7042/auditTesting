import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiLogOut, FiSettings, FiSun } from "react-icons/fi";
import {
  Bell,
  GraduationCap,
  LifeBuoy,
  IdCard,
  KeyRound,
  ClipboardList,
  Home,
  Moon,
  RefreshCw,
  SquarePen,
  Sun,
  X,
} from "lucide-react";
import helpSupport from "../../assets/header/help_icon.svg";
import logo from "../../assets/navbarIcons/audit_icon.svg";
import toggle from "../../assets/auditor/menu.svg";
import { requestAuditNavigation } from "../../utils/auditNavigation";
import InitialAvatar from "../InitialAvatar";
import ThemeSwitcher from "../common/ThemeSwitcher";
import useNotifications from "../../hooks/useNotifications";

const formatRole = (role) => {
  if (!role) return "User";

  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getStoredUser = () => {
  const savedUser = localStorage.getItem("user");

  if (!savedUser) return null;

  try {
    return JSON.parse(savedUser);
  } catch {
    localStorage.removeItem("user");
    return null;
  }
};

const menuItems = [
  { label: "Home", icon: Home, to: "/auditor-dashboard" },
  { label: "Training", icon: GraduationCap, to: "/auditor-dashboard/training" },
  { label: "My ID", icon: IdCard, to: "/auditor-dashboard/profile" },
  { label: "New Audit", icon: ClipboardList, to: "/auditor-dashboard/new-report" },
  { label: "Reports", icon: SquarePen, to: "/auditor-dashboard/reports-hub" },
  { label: "Closure", icon: RefreshCw, to: "/auditor-dashboard/client-nc-capa" },
  { label: "Help", icon: LifeBuoy, to: "/auditor-dashboard/help" },
];

export default function AuditorHeader({ isMenuOpen, setIsMenuOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openProfile, setOpenProfile] = useState(false);
  const profileRef = useRef(null);
  const user = getStoredUser();
  const displayName = user?.fullName || user?.username || "Auditor";
  const displayRole = formatRole(user?.role || localStorage.getItem("role"));
  const { unreadCount } = useNotifications();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setOpenProfile(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("auditorTheme");
    localStorage.removeItem("devicePin");
    sessionStorage.removeItem("devicePin");
    setOpenProfile(false);
    navigate("/", { replace: true });
  };

  return (
    <>
      {isMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[1100] bg-black/20"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Close auditor menu"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[1110] flex h-screen w-[74px] flex-col items-center bg-white py-10 shadow-[8px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-200 ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-1 flex-col items-center gap-11 pt-14">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === "/auditor-dashboard"
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);

            return (
              <button
                type="button"
                key={item.label}
                onClick={() => {
                  setIsMenuOpen(false);
                  requestAuditNavigation(
                    navigate,
                    item.to,
                    undefined,
                    undefined,
                  );
                }}
                className={`flex w-full flex-col items-center gap-1 text-[12px] leading-4 ${
                  isActive ? "text-[#5646ff]" : "text-black"
                }`}
              >
                <Icon
                  size={24}
                  strokeWidth={1.8}
                  className={isActive ? "fill-[#5646ff] text-[#5646ff]" : ""}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        
      </aside>

      <header
  className={`flex items-center justify-between transition-all duration-300 ${
    isMenuOpen
      ? "fixed top-0 left-0 right-0 z-[1120] bg-white px-4 py-3 shadow-sm"
      : "relative z-20"
  }`}
>
        <div className="flex items-center gap-2">
         <button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }

    setIsMenuOpen(true);
  }}
  className="relative z-[1130] flex h-10 w-10 items-center justify-center"
  aria-label={isMenuOpen ? "Close auditor menu" : "Open auditor menu"}
  aria-expanded={isMenuOpen}
>
  {isMenuOpen ? (
    <X size={24} />
  ) : (
    <img
      src={toggle}
      alt="Menu"
      className="w-6 filter brightness-0 invert-0 invert-dark 
for icon Dark"
    />
  )}
</button>
        <button
          type="button"
          onClick={() =>
            requestAuditNavigation(navigate, "/auditor-dashboard", undefined)
          }
        >
          <img src={logo} alt="Audit Portal Logo" className="w-15 filter brightness-0 invert-0 invert-dark 
for icon Dark" />
        </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() =>
              requestAuditNavigation(
                navigate,
                "/auditor-dashboard/notifications",
              )
            }
            className="relative"
            aria-label="Open notifications"
          >
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setOpenProfile((current) => !current)}
              className="h-10 w-10 overflow-hidden rounded-full border-[3px] border-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
              aria-label="Open profile menu"
            >
              <InitialAvatar
                name={displayName}
                fallback="A"
                className="h-full w-full"
                textClassName="text-[16px]"
              />
            </button>

            {openProfile && (
              <div className="absolute right-0 top-14 z-50 w-[300px] overflow-hidden rounded-[28px] border border-[#e5e5e5] bg-[#f8f8f8]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.12)] backdrop-blur-xl">
                <div className="flex flex-col items-center border-b border-[#e6e6e6] px-6 pb-7 pt-6">
                  <InitialAvatar
                    name={displayName}
                    fallback="A"
                    className="mb-4 h-24 w-24 bg-[#181919] shadow-lg"
                    textClassName="text-[34px]"
                  />

                  <h2 className="text-center text-[24px] font-semibold leading-none text-[#181919]">
                    {displayName}
                  </h2>

                  <p className="mt-2 text-[14px] font-medium text-[#6d6d6d]">
                    {displayRole}
                  </p>
                </div>

                <div className="py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenProfile(false);
                      requestAuditNavigation(navigate, "/auditor-dashboard/change-password");
                    }}
                    className="group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:scale-[0.98] hover:bg-white active:scale-[0.96]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition-all duration-300 group-hover:border-[#181919] group-hover:bg-[#181919]">
                      <KeyRound size={16} className="text-[#3b3b3b] transition-all duration-300 group-hover:text-white" />
                    </div>
                    <span className="text-[15px] font-medium text-[#1f1f1f]">Change password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenProfile(false);
                      requestAuditNavigation(
                        navigate,
                        "/auditor-dashboard/help",
                      );
                    }}
                    className="group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:scale-[0.98] hover:bg-white active:scale-[0.96]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition-all duration-300 group-hover:border-[#181919] group-hover:bg-[#181919]">
                      <img
                        src={helpSupport}
                        className="w-4 filter brightness-0 invert-0 invert-dark 
for icon Dark transition-all duration-300 group-hover:brightness-0 group-hover:invert "
                        alt="Help & Support"
                      />
                    </div>

                    <span className="text-[15px] font-medium text-[#1f1f1f]">
                      Help & Support
                    </span>
                  </button>

                  {/* <button
                    type="button"
                    className="group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:scale-[0.98] hover:bg-white active:scale-[0.96]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition-all duration-300 group-hover:border-[#181919] group-hover:bg-[#181919]">
                      <FiSettings
                        size={16}
                        className="text-[#3b3b3b] transition-all duration-300 group-hover:text-white"
                      />
                    </div>

                    <span className="text-[15px] font-medium text-[#1f1f1f]">
                      Settings
                    </span>
                  </button> */}

                  {/* <button
                    type="button"
                    onClick={() => handleThemeChange("light", true)}
                    aria-pressed={theme === "light"}
                    className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:scale-[0.98] hover:bg-white active:scale-[0.96] ${
                      theme === "light" ? "bg-white shadow-sm" : ""
                    }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition-all duration-300 group-hover:border-[#181919] group-hover:bg-[#181919]">
                      <FiSun
                        size={16}
                        className="text-[#3b3b3b] transition-all duration-300 group-hover:text-white"
                      />
                    </div>

                    <span className="text-[15px] font-medium text-[#1f1f1f]">
                      Day Mode
                    </span>
                  </button> */}

                  <div className="px-4 py-3">
                    <div className="mb-2 text-[12px] font-medium text-[#6d6d6d]">Theme</div>
                    <ThemeSwitcher />
                  </div>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="group flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:scale-[0.98] hover:bg-white active:scale-[0.96]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#cfcfcf] transition-all duration-300 group-hover:border-[#181919] group-hover:bg-[#181919]">
                      <FiLogOut
                        size={16}
                        className="text-[#3b3b3b] transition-all duration-300 group-hover:text-white"
                      />
                    </div>

                    <span className="text-[15px] font-medium text-[#1f1f1f]">
                      Logout
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
