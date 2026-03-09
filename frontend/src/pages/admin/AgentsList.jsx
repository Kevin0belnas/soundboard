import { useState, useEffect } from "react";
import { FiEdit2, FiTrash2, FiUserPlus, FiRefreshCw, FiSearch } from "react-icons/fi";
import Pagination from "../../components/Pagination";

export default function AgentsList({ searchQuery: externalSearchQuery, onEditAgent }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchAgents();
  }, []);

  // Handle external search from dashboard
  useEffect(() => {
    if (externalSearchQuery !== undefined) {
      setSearchTerm(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(""); // Clear any previous errors
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:5000/api/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setAgents(data);
        setError("");
      } else {
        setError(data.error || "Failed to fetch agents");
      }
    } catch (err) {
      console.error("Error fetching agents:", err);
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchAgents();
  };

  const handleDeleteAgent = async (agentId) => {
    if (!window.confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/api/users/${agentId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (res.ok) {
        fetchAgents();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete agent");
      }
    } catch (err) {
      console.error("Error deleting agent:", err);
      alert("Error deleting agent");
    }
  };

  const handleEditAgent = (agent) => { 
    if (onEditAgent) {
      onEditAgent(agent);
    }
  };

  // Get unique roles for filter
  const roles = ["all", ...new Set(agents.map(agent => agent.role).filter(Boolean))];

  // Filter agents based on search and role
  const filteredAgents = agents.filter(agent => {
    const searchLower = searchTerm.toLowerCase();
    
    const matchesSearch = 
      (agent.name || "").toLowerCase().includes(searchLower) ||
      (agent.email || "").toLowerCase().includes(searchLower) ||
      (agent.role || "").toLowerCase().includes(searchLower);
    
    const matchesRole = filterRole === "all" || agent.role === filterRole;
    
    return matchesSearch && matchesRole;
  });

  // Pagination
  const totalPages = Math.ceil(filteredAgents.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedAgents = filteredAgents.slice(startIndex, startIndex + pageSize);

  // Determine what to display
  const showNoData = !loading && !error && agents.length === 0;
  const showNoSearchResults = !loading && !error && agents.length > 0 && filteredAgents.length === 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-gray-800">Agents Management</h2>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
            title="Refresh agents"
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
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
          </div>
          
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {roles.map(role => (
              <option key={role} value={role}>
                {role === "all" ? "All Roles" : role.charAt(0).toUpperCase() + role.slice(1)}
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

      {/* Agents Table */} 
      <div className="overflow-x-auto overflow-y-auto max-h-[600px] border border-gray-200 rounded-lg">
        {loading ? (
          <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
        <p className="mt-2 text-gray-500">Loading agents...</p>
      </div>
        ) : showNoData ? ( 
          <div className="text-center py-20">
            <div className="mb-4">
              <FiUserPlus className="w-16 h-16 mx-auto text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No agents yet</h3>
            <p className="text-gray-500 mb-6">Get started by adding your first agent</p>
            <button
              onClick={() => onEditAgent(null)} // Pass null for new agent
              className="inline-flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-lg"
            >
              <FiUserPlus className="w-5 h-5" />
              <span>Add Your First Agent</span>
            </button>
          </div>
        ) : showNoSearchResults ? (
          // No Search Results State
          <div className="text-center py-20">
            <FiUserPlus className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium text-gray-900 mb-2">No agents found</p>
            <p className="text-sm text-gray-500">
              {searchTerm || filterRole !== "all"
                ? "Try adjusting your search or filters" 
                : "No agents available"}
            </p>
          </div>
        ) : (
          // Agents Table - Data Available
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedAgents.map((agent) => (
                <tr key={agent._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="shrink-0 h-10 w-10 bg-linear-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {agent.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.email}
                  </td> 
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      agent.role === 'admin' ? 'bg-red-100 text-red-800' :
                      agent.role === 'opener' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {agent.role?.charAt(0).toUpperCase() + agent.role?.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {agent.lastLogin ? new Date(agent.lastLogin).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      onClick={() => handleEditAgent(agent)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3 transition"
                      title="Edit agent"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(agent._id)}
                      className="text-red-600 hover:text-red-900 transition"
                      title="Delete agent"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filteredAgents.length > 0 && (
        <>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
          
          {/* Summary Footer */}
          <div className="mt-4 text-sm text-gray-500 flex justify-between items-center">
            <span>
              Showing {paginatedAgents.length} of {filteredAgents.length} agents
            </span>
            <span className="text-xs text-gray-400">
              Last updated: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
} 