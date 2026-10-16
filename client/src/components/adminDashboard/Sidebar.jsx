import { useMemo, useState } from "react";
import { FiMoon } from "react-icons/fi";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { buildMenu } from "./menuConfig";
import ThemeSwitcher from "../common/ThemeSwitcher";
import { THEME_PREFS, changeTheme, getStoredTheme } from "../../utils/theme";

import collapsed from "../../assets/navbarIcons/collapsed.svg";
import logo from "../../assets/navbarIcons/audit_icon.svg";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAdmin = role === "ADMIN";
  const isAuditor = role === "AUDITOR";
  const basePath = isAdmin
    ? "/admin-dashboard"
    : isAuditor
      ? "/auditor-dashboard"
      : "/user-dashboard";

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [hoverGroup, setHoverGroup] = useState(null);
  const [activeMenu, setActiveMenu] = useState(
    localStorage.getItem("activeMenu") || null,
  );

  const menuItems = useMemo(
    () => buildMenu({ basePath, isAdmin, isAuditor }),
    [basePath, isAdmin, isAuditor],
  );


  const routeActiveItem = useMemo(() => {
    let current = menuItems.find((item) => item.link === location.pathname);

    if (!current) {
      for (const item of menuItems) {
        if (!item.children) continue;

        const childMatch = item.children.find(
          (child) => child.link === location.pathname,
        );

        if (childMatch) {
          current = childMatch;
          break;
        }
      }
    }
    return current;
  }, [location.pathname, menuItems]);

  const handleMenuClick = (label) => {
    setActiveMenu(label);
    localStorage.setItem("activeMenu", label);
  };

  const isGroupOpen = (item) =>
    isCollapsed
      ? hoverGroup === item.label
      : (openGroups[item.label] ??
        ((item.landing && location.pathname.startsWith(item.landing)) ||
          item.children.some((child) => child.link === location.pathname)));
  const activeLabel = routeActiveItem?.label || activeMenu;

  return (
    <aside
      className={`h-screen transition-all duration-300 bg-[#FFFFFF] ${
        isCollapsed ? "w-[80px]" : "w-[250px]"
      } flex flex-col p-4`}
    >
      <div
        className={`flex items-center mb-4 ${
          isCollapsed ? "justify-center" : "justify-between"
        }`}
      >
        <img
          src={logo}
          alt="Audit portal"
          className={`${isCollapsed ? "cursor-w-resize" : "cursor-pointer"} ${
            isCollapsed ? "w-12" : "w-26"
          }`}
          onClick={() => setIsCollapsed(!isCollapsed)}
        />

        {!isCollapsed && (
          <button
            type="button"
            className="w-10 h-10 rounded-full hover:bg-[#e6e6e6] flex justify-center items-center"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <img
              src={collapsed}
              className="w-6 h-6 cursor-w-resize invert-dark"
              alt=""
            />
          </button>
        )}
      </div>

      <div
        className={`flex-1 ${
          isCollapsed ? "overflow-visible" : "overflow-y-auto"
        } pr-1 no-scrollbar`}
      >
        <nav className="space-y-2 mt-3">
          {menuItems.map((item, index) => {
            const isActive = activeLabel === item.label;
            const hasActiveChild = Boolean(item.children?.some((child) => child.label === activeLabel));

            const baseClass = `flex items-center rounded-[8px] text-[14px] font-medium py-3 cursor-pointer transition-all relative group ${
              isCollapsed ? "justify-center px-2" : "gap-3 px-4"
            } ${
              isActive || hasActiveChild
                ? "bg-white shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)]"
                : "hover:bg-white/70"
            }`;

            if (item.isDropdown) {
              return (
                <div
                  key={index}
                  className="relative"
                  onMouseEnter={() => isCollapsed && setHoverGroup(item.label)}
                  onMouseLeave={() => isCollapsed && setHoverGroup(null)}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isGroupOpen(item)}
                    className={baseClass}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleMenuClick(item.label);
                      if (item.landing) {
                        const here = location.pathname.startsWith(item.landing) && isGroupOpen(item);
                        setOpenGroups((prev) => ({ ...prev, [item.label]: !here }));
                        if (!here) navigate(item.landing);
                      } else if (!isCollapsed) {
                        setOpenGroups((prev) => ({
                          ...prev,
                          [item.label]: !isGroupOpen(item),
                        }));
                      }
                    }}
                  >
                    <img
                      src={item.icon}
                      className="w-5 invert-dark h-5"
                      alt=""
                    />

                    {isCollapsed && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap shadow-lg">
                        {item.label}
                      </div>
                    )}

                    {!isCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        <span
                          aria-hidden="true"
                          className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-all duration-300 ${
                            isGroupOpen(item) ? "scale-110 border-[#63C174] bg-[#63C174]" : "border-[#b4bcc6] bg-transparent"
                          }`}
                        />
                      </>
                    )}
                  </div>

                  {isGroupOpen(item) && (
                    <div
                      className={
                        isCollapsed
                          ? "flex flex-col items-center gap-2 mt-2"
                          : "relative ml-[26px] mt-1.5 space-y-1 border-l-2 border-[#b4bcc6] pl-3"
                      }
                    >
                      {item.children.map((child, childIndex) => {
                        const isChildActive = activeLabel === child.label;

                        if (child.soon) {
                          return (
                            <div
                              key={childIndex}
                              title="Coming soon"
                              className={`flex items-center relative group cursor-not-allowed opacity-50 ${
                                isCollapsed
                                  ? "justify-center w-10 h-10 rounded-full"
                                  : "gap-2 text-sm px-3 py-2 rounded-[8px]"
                              }`}
                            >
                              {!isCollapsed && <span aria-hidden="true" className="absolute -left-[19px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#f1f1f1] bg-[#d3d8de]" />}
                              <img
                                src={child.icon}
                                className={isCollapsed ? "w-5 h-5 invert-dark" : "w-4 h-4 invert-dark"}
                                alt=""
                              />
                              {!isCollapsed && (
                                <>
                                  <span className="flex-1">{child.label}</span>
                                  <span className="text-xs uppercase tracking-wide rounded bg-gray-200 px-1.5 py-0.5 text-gray-600">
                                    Soon
                                  </span>
                                </>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link
                            key={childIndex}
                            to={child.link}
                            onClick={() => handleMenuClick(child.label)}
                            className={`flex items-center cursor-pointer transition-all relative group ${
                              isCollapsed
                                ? `justify-center w-10 h-10 rounded-full shadow-sm ${
                                    isChildActive
                                      ? "bg-white"
                                      : "hover:bg-white"
                                  }`
                                : `gap-2 text-sm px-3 py-2 rounded-[8px] ${
                                    isChildActive
                                      ? "bg-white font-medium shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)]"
                                      : "hover:bg-white/70"
                                  }`
                            }`}
                          >
                            <img
                              src={child.icon}
                              className={
                                isCollapsed
                                  ? "w-5 h-5 invert-dark"
                                  : "w-4 h-4 invert-dark"
                              }
                              alt=""
                            />

                            {!isCollapsed && (
                              <span aria-hidden="true" className={`absolute -left-[19px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-[#f1f1f1] transition-colors ${isChildActive ? "bg-[#63C174]" : "bg-[#aeb6c0]"}`} />
                            )}

                            {isCollapsed && (
                              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap shadow-lg">
                                {child.label}
                              </div>
                            )}

                            {!isCollapsed && <span>{child.label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={index}
                to={item.link || "#"}
                onClick={() => handleMenuClick(item.label)}
                className={baseClass}
              >
                <img src={item.icon} className="w-5 h-5 invert-dark" alt="" />
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] whitespace-nowrap shadow-lg">
                    {item.label}
                  </div>
                )}
                {!isCollapsed && item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div
        className={`mt-4 flex ${
          isCollapsed ? "justify-center" : "justify-start"
        }`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => { const order = THEME_PREFS; const now = getStoredTheme(); changeTheme(order[(order.indexOf(now) + 1) % order.length]); }}
            title="Change theme"
            aria-label="Change theme"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)]"
          >
            <FiMoon size={16} />
          </button>
        ) : (
          <ThemeSwitcher compact className="w-full shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)]" />
        )}
      </div>
    </aside>
  );
}
