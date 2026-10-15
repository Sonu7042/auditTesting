import React, { useState } from "react";
import axios from "axios";
import building from "../assets/building.png";
import domain, { getApiErrorMessage } from "../api/domain";
import { useNavigate } from "react-router-dom";
import privacyPolicyPDF from "../assets/privacyPolocy.pdf"; // Import the PDF file
import logo from "../assets/navbarIcons/audit_icon.svg";

export default function Login() {

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate(); 


  const handleToggle = () => {
    setAccepted(!accepted);
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter your username (or email) and password");
      return;
    }

    try {
      setError("");
      setLoading(true);
      const res = await axios.post(`${domain}/auth/login`, {
        username: username.trim(),
        password
      }, {
        showErrorToast: false
      });

        localStorage.setItem("token", res.data.token);
        localStorage.setItem("role", res.data.user.role);
        localStorage.setItem("user", JSON.stringify(res.data.user));

       navigate("/set-pin", { replace: true });
    } catch (error) {
      setError(getApiErrorMessage(error, "Login failed"));
      console.error("Login Error:", error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const openPDF = () => {
    window.open(
      privacyPolicyPDF,
      "_blank"
    );
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center">

      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={building}
          alt="bg"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Login Card */}
      <div className="relative bg-white/90 backdrop-blur-lg w-[480px] max-w-[90%] rounded-3xl shadow-xl p-10">

        {/* <h1 className="text-4xl font-bold text-gray-800">bexex</h1> */}
        <img src={logo} alt="Logo" className="w-25 mb-1" />
        <p className="text-sm text-gray-600 mb-6">Audit Compliance Portal</p>

        {/* Username */}
        <input
          type="text"
          placeholder="Username or email"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="w-full mb-4 px-5 py-3 rounded-xl bg-gray-100 focus:outline-none shadow-[0_4px_6px_rgba(0,0,0,0.1)]
          border border-[#cecece]"
        />

        {/* Password */}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-5 py-3 rounded-xl bg-gray-100 focus:outline-none shadow-[0_4px_6px_rgba(0,0,0,0.1)] border border-[#cecece]"
        />
        {error && (
          <p className="text-red-500 text-sm mb-3">{error}</p>
        )}

        {/* Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <div
            onClick={handleToggle}
            className={`w-10 h-5 rounded-full relative cursor-pointer transition ${
              accepted ? "bg-green-500" : "bg-gray-500"
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition ${
                accepted ? "left-5" : "left-0.5"
              }`}
            ></div>
          </div>

          <span
            onClick={openPDF}
            className="text-[16px] text-gray-600 cursor-pointer underline"
          >
            I have read and accept the conditions
          </span>
        </div>

        {/* Info Text */}
        <p className="text-xs text-gray-600 leading-relaxed mb-6">
          The information accessed by this means is confidential and, in the
          case that it contains personal data, it will be subject to the
          security and secrecy requirements established in the personal data
          protection legislation currently in force.
        </p>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={!accepted || loading}
          className={`w-full py-3 rounded-xl transition text-white cursor-pointer ${
            accepted && !loading
              ? "bg-black hover:bg-gray-800"
              : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>

        <p className="text-center text-xs text-gray-600 mt-4">
          Sign in to access your Audit Portal
        </p>

        <div className="flex justify-between text-xs mt-4 text-gray-600">
          <span className="underline cursor-pointer">Contact Support</span>
          <span>version 1.00.0.001</span>
        </div>

      </div>
    </div>
  );
}
