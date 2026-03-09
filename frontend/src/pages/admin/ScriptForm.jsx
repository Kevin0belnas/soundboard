import { useState } from "react";
import { createPortal } from "react-dom";

export default function ScriptForm({ script, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title: script?.title || script?.name || "",
    content: script?.content || "",
    type: script?.type || "opener"
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    
    const token = localStorage.getItem("token");
    
    if (!token) {
      setError("Not authenticated. Please login again.");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
      return;
    }

    const method = script ? "PUT" : "POST";
    const url = script 
      ? `http://localhost:5000/api/scripts/${script._id}`
      : "http://localhost:5000/api/scripts";

    const scriptData = {
      title: formData.title,
      content: formData.content,
      type: formData.type
    };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(scriptData)
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
        throw new Error(data.error || "Failed to save script");
      }
      
      if (onSave) {
        onSave();
      }
      
      onClose();
      
    } catch (err) {
      console.error("Error saving script:", err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Use portal to render at document body level
  return createPortal(
    <div className="fixed inset-0 z-100 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={() => !saving && onClose()}
      />
      
      {/* Modal Container - Centers the modal */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Modal Content */}
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {script ? "Edit Script" : "Create New Script"}
              </h2>
              
              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="block mb-1 font-medium">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    required
                    disabled={saving}
                    placeholder="Enter script title"
                  />
                </div>

                <div className="mb-3">
                  <label className="block mb-1 font-medium">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    disabled={saving}
                  >
                    <option value="opener">Opener</option>
                    <option value="closer">Closer</option>
                    <option value="general">General</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block mb-1 font-medium">Content</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    rows="6"
                    required
                    disabled={saving}
                    placeholder="Enter script content here..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      "Save Script"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}