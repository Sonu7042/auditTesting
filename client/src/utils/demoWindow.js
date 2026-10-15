// A demo window is opened by Back-Admin to preview another role. It is named "bexex-demo:<role>", and its login is kept
// in this window's own session storage, so it never replaces (or logs out) the admin's login in the other window.
export const isDemoWindow = () => typeof window !== "undefined" && window.name.startsWith("bexex-demo:");

if (isDemoWindow()) {
  try { Object.defineProperty(window, "localStorage", { value: window.sessionStorage, configurable: true }); } catch { /* fall back to shared storage */ }
}
