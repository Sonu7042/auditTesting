import React, { useEffect, useState } from "react";
import building from "../assets/building.png";
import { useNavigate } from "react-router-dom";
import logo from "../assets/navbarIcons/audit_icon.svg";
import logout from "../assets/navbarIcons/logout.svg";

export default function SetPin() {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const savedPin = localStorage.getItem("devicePin");
  const isUnlockMode = Boolean(savedPin);

  const handlePinChange = (setter) => (e) => {
    setter(e.target.value.replace(/\D/g, "").slice(0, 4));
  };

  const goToDashboard = () => {
    const role = localStorage.getItem("role");
    const dashboardPath =
      role === "ADMIN"
        ? "/admin-dashboard"
        : role === "AUDITOR"
          ? "/auditor-dashboard"
          : "/user-dashboard";

    navigate(dashboardPath, { replace: true });
  };


  const handleSetPin = (e) => {
    if (e) e.preventDefault();
    setError("");

    if (pin.length !== 4) {
      setError("PIN must be 4 digits");
      return;
    }

    if (isUnlockMode) {
      if (pin !== savedPin) {
        setError("Wrong PIN");
        return;
      }

      sessionStorage.setItem("devicePin", pin);
      goToDashboard();
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN does not match");
      return;
    }

    localStorage.setItem("devicePin", pin);
    sessionStorage.setItem("devicePin", pin);
    goToDashboard();
  };



const handleLogout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
  localStorage.removeItem("devicePin");
  sessionStorage.removeItem("devicePin");
  navigate("/", { replace: true });
};



  useEffect(() => {
  const pin = localStorage.getItem("token");

  if(!pin){
    navigate("/", { replace: true });
  }
}, [navigate]);


  return (
    <div className="relative min-h-screen flex items-center justify-center">

      {/* Background */}
      <div className="absolute inset-0">
        <img
          src={building}
          alt="bg"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Card */}
      <div className="relative bg-white/90 backdrop-blur-lg w-[480px] max-w-[90%] rounded-3xl shadow-xl p-10">

        {/* Logout Icon */}
        <div className="absolute right-6 top-6 w-9 h-9 flex items-center justify-center bg-[#1E1E1E] rounded-full cursor-pointer" onClick={handleLogout}>
          <img src={logout} alt="Logout" className="w-4 h-4" />
        </div>

        {/* Logo */}
        <img src={logo} alt="Logo" className="w-25 mb-1" />
        <p className="text-sm text-gray-600 mb-6">
          {isUnlockMode ? "Enter your device security PIN." : "Set your device security PIN."}
        </p>

        <form onSubmit={handleSetPin}>
          {/* Set Pin */}
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={isUnlockMode ? "Enter Pin" : "Set Pin"}
            maxLength={4}
            value={pin}
            onChange={handlePinChange(setPin)}
            className="w-full mb-4 px-5 py-3 rounded-xl bg-gray-100 focus:outline-none shadow-[0_4px_6px_rgba(0,0,0,0.1)]
            border border-[#cecece]"
          />

          <p className="text-xs text-gray-600 mb-6">
            {isUnlockMode
              ? "Use the 4-digit PIN you set after login."
              : "Set a 4-digit PIN to protect audit data during site visits."}
          </p>

          {/* Re-enter Pin */}
          {!isUnlockMode && (
            <>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Re-Enter Pin"
                maxLength={4}
                value={confirmPin}
                onChange={handlePinChange(setConfirmPin)}
                className="w-full mb-4 px-5 py-3 rounded-xl bg-gray-100 focus:outline-none shadow-[0_4px_6px_rgba(0,0,0,0.1)]
            border border-[#cecece]"
              />

              <p className="text-xs text-gray-600 mb-6">
                Confirm your PIN to complete secure setup.
              </p>
            </>
          )}

          {error && (
            <p className="text-red-500 text-sm mb-3">{error}</p>
          )}

          {/* Button */}
          <button
            type="submit"
            className="w-full bg-[#1E1E1E] cursor-pointer text-white py-3 rounded-xl hover:bg-gray-800 transition">
            {isUnlockMode ? "Unlock" : "Log In"}
          </button>
        </form>

        {/* Bottom Text */}
        <p className="text-center text-xs text-gray-600 mt-4">
          Sign in to access your Audit Portal
        </p>

        {/* Footer */}
        <div className="flex justify-between text-xs mt-4 text-gray-600">
          <span className="underline cursor-pointer">Contact Support</span>
          <span>version 2.11.5234</span>
        </div>

      </div>
    </div>
  );
}
