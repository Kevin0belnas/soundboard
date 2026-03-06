import { useEffect, useState } from "react";
import { FiClock, FiUser, FiCode, FiSearch, FiRefreshCw, FiAlertCircle, FiCheckCircle, FiXCircle } from "react-icons/fi";

export default function LogList({ searchQuery: externalSearchQuery = "" }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      if (!token) {
        setError("Not authenticated. Please login again.");
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
        return;
      }

      const res = await fetch("http://localhost:5000/api/logs", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        setError("Session expired. Please login again.");
        localStorage.clear();
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log("Fetched logs:", data);
      setLogs(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("Error fetching logs:", err);
      setError("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Handle external search from dashboard
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchTerm(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  // Get unique actions for filter
  const actions = ["all", ...new Set(logs.map(log => log.action).filter(Boolean))];

  // Filter logs based on search and action type
  const filteredLogs = logs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    
    // Search in user name/email, action, and details
    const matchesSearch = 
      (log.user?.name || "").toLowerCase().includes(searchLower) ||
      (log.user?.email || "").toLowerCase().includes(searchLower) ||
      (log.action || "").toLowerCase().includes(searchLower) ||
      (log.details?.message || "").toLowerCase().includes(searchLower) ||
      (log.details?.title || "").toLowerCase().includes(searchLower) ||
      (log.details?.email || "").toLowerCase().includes(searchLower);
    
    const matchesAction = filterAction === "all" || log.action === filterAction;
    
    return matchesSearch && matchesAction;
  });

  const handleRefresh = () => {
    fetchLogs();
  };

  const getActionIcon = (action) => {
    switch(action) {
      case "create_script":
      case "registration_success":
      case "login_success":
        return <FiCheckCircle className="w-4 h-4 text-green-500" />;
      case "update_script":
        return <FiRefreshCw className="w-4 h-4 text-blue-500" />;
      case "delete_script":
        return <FiXCircle className="w-4 h-4 text-red-500" />;
      case "login_failed":
      case "error":
        return <FiAlertCircle className="w-4 h-4 text-red-500" />;
      case "logout":
        return <FiClock className="w-4 h-4 text-gray-500" />;
      default:
        return <FiCode className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getActionColor = (action) => {
    switch(action) {
      case "create_script":
      case "registration_success":
      case "login_success":
        return "bg-green-100 text-green-800";
      case "update_script":
        return "bg-blue-100 text-blue-800";
      case "delete_script":
        return "bg-red-100 text-red-800";
      case "login_failed":
      case "error":
        return "bg-red-100 text-red-800";
      case "logout":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-indigo-100 text-indigo-800";
    }
  };

  const formatDetails = (details) => {
    if (!details) return "—";
    if (typeof details === "string") return details;
    if (details.message) return details.message;
    if (details.title) return `Script: ${details.title}`;
    if (details.email) return `User: ${details.email}`;
    if (details.scriptId) return `Script ID: ${details.scriptId}`;
    return JSON.stringify(details).substring(0, 50) + "...";
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
        <p className="mt-2 text-gray-500">Loading logs...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with title and refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-gray-800">Activity Logs</h2>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
            title="Refresh logs"
            disabled={loading}
          >
            <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
          </div>
          
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {actions.map(action => (
              <option key={action} value={action}>
                {action === "all" ? "All Actions" : action.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <tr key={log._id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-500">
                      <FiClock className="w-4 h-4 mr-1" />
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "Unknown"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-3">
                        <FiUser className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {log.user?.name || "System"}
                        </span>
                        {log.user?.email && (
                          <span className="text-xs text-gray-500 block">
                            {log.user.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getActionIcon(log.action)}
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                        {log.action?.replace(/_/g, ' ') || "Unknown"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 max-w-xs">
                      {formatDetails(log.details)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500 font-mono">
                      {log.ip || "—"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                  <FiClock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-lg font-medium">No logs found</p>
                  <p className="text-sm">
                    {searchTerm || filterAction !== "all"
                      ? "Try adjusting your search or filters" 
                      : "Activity logs will appear here"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      {filteredLogs.length > 0 && (
        <div className="mt-4 text-sm text-gray-500 flex justify-between items-center">
          <span>
            Showing {filteredLogs.length} of {logs.length} logs
          </span>
          <span className="text-xs text-gray-400">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}