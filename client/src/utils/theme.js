// Four preferences: warm (the default light look), dark, classic (the original Bexex look on a white page) and system (follows the device).
// The preference is stored; `data-theme` on <html> always holds what is actually shown: warm, dark or classic.
export const THEME_PREFS = ["warm", "dark", "classic", "system"];
export const DEFAULT_THEME = "warm";

const getThemeStorageKey = () => (localStorage.getItem("role") === "AUDITOR" ? "auditorTheme" : "theme");
const prefersDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const getStoredTheme = () => {
  const stored = localStorage.getItem(getThemeStorageKey());
  if (stored === "light") return "warm"; // older saved values
  if (stored === "white") return "classic";
  return THEME_PREFS.includes(stored) ? stored : DEFAULT_THEME;
};

export const resolveTheme = (pref) => (pref === "system" ? (prefersDark() ? "dark" : "warm") : pref);

export const applyTheme = (pref, { notify = false } = {}) => {
  const next = THEME_PREFS.includes(pref) ? pref : DEFAULT_THEME;
  const shown = resolveTheme(next);
  const root = document.documentElement;
  root.dataset.theme = shown;
  root.dataset.themePref = next;
  root.style.colorScheme = shown === "dark" ? "dark" : "light";
  localStorage.setItem(getThemeStorageKey(), next);
  localStorage.setItem("theme", next);
  if (notify) window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme: next, shown } }));
  return next;
};

export const changeTheme = (pref) => applyTheme(pref, { notify: true });

// With "system" selected, follow the device when it switches between light and dark.
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getStoredTheme() === "system") applyTheme("system", { notify: true });
  });
}
