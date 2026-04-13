import { useState } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiUser,
  FiMail,
  FiLock,
  FiUserPlus,
  FiPhone,
  FiHash,
  FiRadio,
} from "react-icons/fi";

const API_BASE = "http://localhost:5000/api";

export default function AddAgent({ agent, onClose, onAgentSaved }) {
  const [formData, setFormData] = useState({
    name: agent?.name || "",
    email: agent?.email || "",
    password: "",
    role: agent?.role || "opener",
    extension: agent?.asteriskDevice?.extension || "",
    sipChannel: agent?.asteriskDevice?.sipChannel || "",
    didNumber: agent?.asteriskDevice?.didNumber || "",
    callerIdName:
      agent?.asteriskDevice?.callerIdName ||
      (agent?.name ? `${agent.name} (Sales)` : ""),
    isActive:
      typeof agent?.asteriskDevice?.isActive === "boolean"
        ? agent.asteriskDevice.isActive
        : true,
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isEditMode = !!agent;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "extension" && !prev.sipChannel) {
        next.sipChannel = value ? `SIP/${value}` : "";
      }

      if (name === "name" && !isEditMode && !prev.callerIdName) {
        next.callerIdName = value ? `${value} (Sales)` : "";
      }

      return next;
    });

    setError("");
  };

  const buildPayload = () => {
    const cleanExtension = String(formData.extension || "").trim();
    const cleanSipChannel = String(formData.sipChannel || "").trim();
    const cleanDidNumber = String(formData.didNumber || "").trim();
    const cleanCallerIdName = String(formData.callerIdName || "").trim();

    const payload = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      extension: cleanExtension,
      sipChannel: cleanSipChannel || (cleanExtension ? `SIP/${cleanExtension}` : ""),
      didNumber: cleanDidNumber,
      callerIdName: cleanCallerIdName || `${formData.name} (Sales)`,
      isActive: !!formData.isActive,
    };

    if (!isEditMode || formData.password) {
      payload.password = formData.password;
    }

    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const token = localStorage.getItem("token");

    if (!token) {
      setError("Not authenticated. Please login again.");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
      setLoading(false);
      return;
    }

    if (!formData.extension.trim()) {
      setError("Extension is required.");
      setLoading(false);
      return;
    }

    const dataToSend = buildPayload();
    console.log("Submitting agent data:", dataToSend);

    try {
      const url = isEditMode
        ? `${API_BASE}/users/${agent._id}`
        : `${API_BASE}/auth/register`;

      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(dataToSend),
      });

      const data = await res.json();

      if (res.status === 401) {
        setError("Session expired. Please login again.");
        localStorage.clear();
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "add"} agent`);
      }

      if (onAgentSaved) {
        onAgentSaved(data);
      }
    } catch (err) {
      console.error("Error saving agent:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formFields = (
    <>
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            placeholder="John Doe"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            placeholder="agent@example.com"
            disabled={loading || isEditMode}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password {!isEditMode && <span className="text-red-500">*</span>}
          {isEditMode && (
            <span className="text-xs text-gray-500 ml-2">
              (Leave blank to keep current)
            </span>
          )}
        </label>
        <div className="relative">
          <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required={!isEditMode}
            minLength="6"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            placeholder={
              isEditMode ? "•••••••• (optional)" : "Password123!"
            }
            disabled={loading}
          />
        </div>
        {!isEditMode && (
          <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Role <span className="text-red-500">*</span>
        </label>
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          disabled={loading}
        >
          <option value="admin">Admin</option>
          <option value="opener">Opener</option>
          <option value="closer">Closer</option>
        </select>
      </div>

      <div className="pt-2 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Asterisk Device
        </h3>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Extension <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FiPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="extension"
                value={formData.extension}
                onChange={handleChange}
                required
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="2002"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SIP Channel
            </label>
            <div className="relative">
              <FiRadio className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="sipChannel"
                value={formData.sipChannel}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="SIP/2002"
                disabled={loading}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to auto-use SIP/extension
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              DID Number
            </label>
            <div className="relative">
              <FiHash className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="didNumber"
                value={formData.didNumber}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="6366746133"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Caller ID Name
            </label>
            <div className="relative">
              <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="callerIdName"
                value={formData.callerIdName}
                onChange={handleChange}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                placeholder="John Doe (Sales)"
                disabled={loading}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="isActive"
              checked={formData.isActive}
              onChange={handleChange}
              disabled={loading}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Active SIP device
          </label>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>{isEditMode ? "Updating..." : "Adding..."}</span>
            </>
          ) : (
            <>
              <FiUserPlus className="w-5 h-5" />
              <span>{isEditMode ? "Update Agent" : "Add Agent"}</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  if (onClose) {
    return createPortal(
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={() => !loading && onClose()}
        />
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-auto">
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {isEditMode ? "Edit Agent" : "Add New Agent"}
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition"
                  disabled={loading}
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {formFields}
              </form>

              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Agent Information
                </h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Openers handle initial calls and lead qualification</li>
                  <li>• Closers handle final negotiations and deal closure</li>
                  <li>• Each agent can have their own Asterisk extension/device</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h2 className="text-2xl font-bold mb-6">
        {isEditMode ? "Edit Agent" : "Add New Agent"}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {formFields}
      </form>
    </div>
  );
}