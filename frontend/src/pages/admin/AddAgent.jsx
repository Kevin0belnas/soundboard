import { useState } from "react";
import { createPortal } from "react-dom";
import { FiX, FiUser, FiMail, FiLock, FiUserPlus } from "react-icons/fi";

export default function AddAgent({ agent, onClose, onAgentSaved }) {
  const [formData, setFormData] = useState({
    name: agent?.name || "",
    email: agent?.email || "",
    password: "", // Empty for edit mode
    role: agent?.role || "user",
    agentType: agent?.agentType || "general"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isEditMode = !!agent;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError("");
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
      return;
    }

    // For edit mode, don't send password if it's empty
    const dataToSend = { ...formData };
    if (isEditMode && !dataToSend.password) {
      delete dataToSend.password;
    }

    try {
      const url = isEditMode
        ? `http://localhost:5000/api/users/${agent._id}`
        : "http://localhost:5000/api/auth/register";

      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(dataToSend)
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
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'add'} agent`);
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

  // If onClose is provided, render as modal, otherwise render as normal form
  if (onClose) {
    return createPortal(
      <div className="fixed inset-0 z-100 overflow-y-auto">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={() => !loading && onClose()}
        />
        
        {/* Modal Container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-auto">
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold bg-linear-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
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

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Name Field */}
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

                {/* Email Field */}
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
                      disabled={loading || isEditMode} // Disable email in edit mode
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {!isEditMode && <span className="text-red-500">*</span>}
                    {isEditMode && <span className="text-xs text-gray-500 ml-2">(Leave blank to keep current)</span>}
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
                      placeholder={isEditMode ? "•••••••• (optional)" : "Password123! <- use this to all"}
                      disabled={loading}
                    />
                  </div>
                  {!isEditMode && (
                    <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
                  )}
                </div>

                {/* Agent Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agent Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="agentType"
                    value={formData.agentType}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    disabled={loading}
                  >
                    <option value="opener">Opener Agent</option>
                    <option value="closer">Closer Agent</option>
                    <option value="general">General Agent</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.agentType === "opener" 
                      ? "Specializes in initial contact and qualification" 
                      : formData.agentType === "closer"
                      ? "Specializes in closing deals and negotiations"
                      : "Handles general inquiries and support"}
                  </p>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    disabled={loading}
                  >
                    <option value="user">User</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-linear-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
              </form>

              {/* Info Box */}
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Agent Information</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Openers handle initial calls and lead qualification</li>
                  <li>• Closers handle final negotiations and deal closure</li>
                  <li>• General agents handle mixed responsibilities</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // If no onClose prop, render as normal form (for backward compatibility)
  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h2 className="text-2xl font-bold mb-6">Add New Agent</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Same form fields as above but without modal structure */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required={!isEditMode}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent Type</label>
          <select
            name="agentType"
            value={formData.agentType}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="opener">Opener</option>
            <option value="closer">Closer</option>
            <option value="general">General</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          {loading ? "Saving..." : "Save Agent"}
        </button>
      </form>
    </div>
  );
}