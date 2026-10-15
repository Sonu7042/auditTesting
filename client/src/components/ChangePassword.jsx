import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import domain, { getApiErrorMessage } from "../api/domain";
import Header from "./adminDashboard/Header";

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null") || {};
  } catch {
    return {};
  }
};

const rules = [
  ["At least 8 characters", (p) => p.length >= 8],
  ["Contains a letter", (p) => /[A-Za-z]/.test(p)],
  ["Contains a number", (p) => /\d/.test(p)],
];

export default function ChangePassword() {
  const navigate = useNavigate();
  const user = readUser();
  const forced = Boolean(user.mustChangePassword);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const role = localStorage.getItem("role");
  const home = role === "ADMIN" ? "/admin-dashboard" : role === "AUDITOR" ? "/auditor-dashboard" : "/user-dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!rules.every(([, ok]) => ok(form.newPassword))) return setError("The new password does not meet the rules below.");
    if (form.newPassword !== form.confirm) return setError("The new password and its confirmation do not match.");
    try {
      setBusy(true);
      await axios.post(`${domain}/auth/change-password`, { currentPassword: form.currentPassword, newPassword: form.newPassword }, { showErrorToast: false });
      localStorage.setItem("user", JSON.stringify({ ...user, mustChangePassword: false }));
      toast.success("Password changed.");
      navigate(home, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-[#cecece] bg-gray-100 px-4 py-3 outline-none focus:border-[#181919]";

  return (
    <div>
      <Header />
      <form onSubmit={submit} className="mx-auto max-w-[520px] space-y-4 rounded-3xl bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)] md:p-8">
        <div>
          <h2 className="text-xl font-semibold text-[#181919]">{forced ? "Set your own password" : "Change password"}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {forced ? "You signed in with a one-time password. Choose a password only you know to continue." : "Use a password you do not use anywhere else."}
          </p>
          {user.username && <p className="mt-3 text-xs text-gray-500">Your username <span className="ml-1 rounded bg-[#f1f1f1] px-2 py-1 font-mono tracking-wider text-[#181919]">{user.username}</span></p>}
        </div>
        <label className="block text-sm font-medium text-[#181919]">{forced ? "One-time password" : "Current password"}
          <input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} className={`${input} mt-1`} required />
        </label>
        <label className="block text-sm font-medium text-[#181919]">New password
          <input type="password" autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} className={`${input} mt-1`} required />
        </label>
        <label className="block text-sm font-medium text-[#181919]">Confirm new password
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} className={`${input} mt-1`} required />
        </label>
        <ul className="space-y-1 text-xs">
          {rules.map(([label, ok]) => (
            <li key={label} className={ok(form.newPassword) ? "text-green-700" : "text-gray-500"}>{ok(form.newPassword) ? "✓" : "○"} {label}</li>
          ))}
        </ul>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-black py-3 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400">
          {busy ? "Saving..." : forced ? "Save and continue" : "Change password"}
        </button>
      </form>
    </div>
  );
}
