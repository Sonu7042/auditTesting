import { useEffect, useState } from "react";
import { Monitor, Moon, Square, Sun } from "lucide-react";
import { changeTheme, getStoredTheme } from "../../utils/theme";

const OPTIONS = [
  { key: "warm", label: "Warm", icon: Sun, hint: "Warm light" },
  { key: "dark", label: "Dark", icon: Moon, hint: "Dark" },
  { key: "classic", label: "Classic", icon: Square, hint: "Classic Bexex on white" },
  { key: "system", label: "Auto", icon: Monitor, hint: "Follow this device" },
];

// Four-way theme choice. `compact` shows icons only (sidebar); otherwise icon and label (menus).
export default function ThemeSwitcher({ compact = false, className = "" }) {
  const [pref, setPref] = useState(getStoredTheme);

  useEffect(() => {
    const onChange = (e) => setPref(e.detail?.theme || getStoredTheme());
    window.addEventListener("themeChanged", onChange);
    return () => window.removeEventListener("themeChanged", onChange);
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className={`flex items-center gap-0.5 rounded-full border border-[#CECECE] bg-white p-0.5 ${className}`}>
      {OPTIONS.map(({ key, label, icon, hint }) => {
        const Icon = icon;
        const on = pref === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            title={hint}
            onClick={() => changeTheme(key)}
            className={`flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-medium transition ${compact ? "w-8 px-0" : "px-2.5"} ${on ? "bg-[#181919] text-white shadow-sm" : "text-[#6b7280] hover:bg-[#f3f5f7]"}`}
          >
            <Icon size={14} strokeWidth={1.9} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
