import { useEffect, useState } from "react";
import { 
  FiEdit2, 
  FiTrash2, 
  FiSearch,
  FiFilter,
  FiRefreshCw,
  FiCode,
  FiUser,
  FiClock,
  FiAlertCircle,
  FiCheckCircle,
  FiXCircle
} from "react-icons/fi";

export default function ScriptList({ searchQuery: externalSearchQuery = "", onEditScript }) {
  const [scripts, setScripts] = useState([]);
  const [filteredScripts, setFilteredScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filterTypes = ["all", ...new Set(scripts.map(s => s.type))];

  const fetchScripts = async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      
      if (!token) {
        setError("Not authenticated. Please login again.");
        setLoading(false);
        return;
      }

      const res = await fetch("http://localhost:5000/api/scripts", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
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
      const scriptsArray = Array.isArray(data) ? data : [];
      setScripts(scriptsArray);
    } catch (err) {
      console.error("Error fetching scripts:", err);
      setError("Failed to load scripts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filterScripts = (scriptsList, query, type) => {
    let filtered = [...scriptsList];
    
    if (query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(script => 
        script.title.toLowerCase().includes(lowerQuery) ||
        script.content.toLowerCase().includes(lowerQuery) ||
        script.type.toLowerCase().includes(lowerQuery)
      );
    }
    
    if (type !== "all") {
      filtered = filtered.filter(script => script.type === type);
    }
    
    setFilteredScripts(filtered);
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  useEffect(() => {
    filterScripts(scripts, searchQuery, selectedType);
  }, [searchQuery, selectedType, scripts]);

  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem("token");
      
      if (!token) {
        setError("Not authenticated. Please login again.");
        return;
      }

      const res = await fetch(`http://localhost:5000/api/scripts/${id}`, { 
        method: "DELETE",
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

      if (res.ok) {
        setDeleteConfirm(null);
        fetchScripts();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete script");
      }
    } catch (err) {
      console.error("Error deleting script:", err);
      setError("Failed to delete script");
    }
  };

  const getTypeColor = (type) => {
    const colors = {
      opener: "bg-indigo-100 text-indigo-800 border-indigo-200",
      closer: "bg-green-100 text-green-800 border-green-200",
      general: "bg-purple-100 text-purple-800 border-purple-200",
      default: "bg-gray-100 text-gray-800 border-gray-200"
    };
    return colors[type?.toLowerCase()] || colors.default;
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <FiCode className="w-6 h-6 text-indigo-600 animate-pulse" />
          </div>
        </div>
        <p className="mt-4 text-gray-600 font-medium">Loading scripts...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold bg-linear-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Script Library
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {filteredScripts.length} {filteredScripts.length === 1 ? 'script' : 'scripts'} available
            </p>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-3 text-sm border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 sm:px-4 py-2 sm:py-3 border rounded-lg sm:rounded-xl flex items-center space-x-2 transition-all text-sm ${
                showFilters || selectedType !== "all"
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <FiFilter className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Filter</span>
            </button>
            
            <button
              onClick={fetchScripts}
              className="px-3 sm:px-4 py-2 sm:py-3 border border-gray-200 rounded-lg sm:rounded-xl text-gray-600 hover:bg-gray-50 transition-all"
              disabled={loading}
            >
              <FiRefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="mt-3 p-3 sm:p-4 bg-white rounded-lg sm:rounded-xl border border-gray-200 shadow-lg">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Filter by Type</h3>
            <div className="flex flex-wrap gap-2">
              {filterTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`
                    px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium capitalize transition-all
                    ${selectedType === type
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <FiAlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
            <p className="text-red-700 text-xs sm:text-sm flex-1">{error}</p>
          </div>
        </div>
      )}

      {/* Scripts Grid */}
      {filteredScripts.length === 0 ? (
        <div className="text-center py-12 sm:py-16 bg-linear-to-br from-gray-50 to-white rounded-xl sm:rounded-2xl border-2 border-dashed border-gray-200">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <FiCode className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-600" />
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">No scripts found</h3>
          <p className="text-sm text-gray-500 mb-4 sm:mb-6">
            {searchQuery || selectedType !== "all"
              ? "Try adjusting your search or filters"
              : "Get started by creating your first script"}
          </p>
          {(searchQuery || selectedType !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedType("all");
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {filteredScripts.map((script) => (
            <div
              key={script._id}
              className="group relative bg-white rounded-lg sm:rounded-xl border border-gray-200 hover:border-indigo-200 hover:shadow-lg sm:hover:shadow-xl transition-all duration-300"
            >
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-800 group-hover:text-indigo-600 transition truncate max-w-200px sm:max-w-full">
                        {script.title}
                      </h3>
                      <span className={`px-2 py-0.5 sm:px-3 sm:py-1 text-xs font-medium rounded-full border ${getTypeColor(script.type)}`}>
                        {script.type}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 text-xs sm:text-sm leading-relaxed mb-3 line-clamp-2">
                      {script.content}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-gray-500">
                      {script.author && (
                        <div className="flex items-center gap-1">
                          <FiUser className="w-3 h-3" />
                          <span className="truncate max-w-100px sm:max-w-full">
                            {script.author.name || script.author.email}
                          </span>
                        </div>
                      )}
                      {script.createdAt && (
                        <div className="flex items-center gap-1">
                          <FiClock className="w-3 h-3" />
                          <span>{getTimeAgo(script.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 sm:gap-2 ml-2">
                    <button
                      onClick={() => onEditScript(script)}
                      className="p-1.5 sm:p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Edit script"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    
                    {deleteConfirm === script._id ? (
                      <div className="flex items-center gap-1 bg-red-50 rounded-lg p-1">
                        <button
                          onClick={() => handleDelete(script._id)}
                          className="p-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                          title="Confirm delete"
                        >
                          <FiCheckCircle className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-200 transition"
                          title="Cancel"
                        >
                          <FiXCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(script._id)}
                        className="p-1.5 sm:p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete script"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r from-indigo-500 to-purple-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left rounded-b-lg sm:rounded-b-xl"></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}