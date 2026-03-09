import { useState, useEffect } from "react";
import { FiEdit2, FiTrash2, FiUserPlus, FiRefreshCw } from "react-icons/fi";

export default function AgentsList({ searchQuery: externalSearchQuery, onEditAgent }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchQuery = externalSearchQuery || "";
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchAgents();
  }, [refreshKey]);

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
        setRefreshKey(prev => prev + 1);
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
    // Use the parent's edit handler - exactly like ScriptList
    if (onEditAgent) {
      onEditAgent(agent);
    }
  };

  // Filter agents based on search query
  const filteredAgents = agents.filter(agent =>
    agent.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.agentType?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Determine what to display
  const showNoData = !loading && !error && agents.length === 0;
  const showNoSearchResults = !loading && !error && agents.length > 0 && filteredAgents.length === 0;

  return (
    <>
      

      {/* Agents Table */}
      <div className="overflow-x-auto">
        {loading ? (
          // Loading State
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          // Error State
          <div className="text-center py-20">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchAgents}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <FiRefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </div>
        ) : showNoData ? (
          // No Agents State - Empty database
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
            <p className="text-gray-500 mb-2">No agents match your search</p>
            <p className="text-sm text-gray-400">Try adjusting your search terms</p>
          </div>
        ) : (
          // Agents Table - Data Available
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAgents.map((agent) => (
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      agent.agentType === 'opener' ? 'bg-green-100 text-green-800' :
                      agent.agentType === 'closer' ? 'bg-purple-100 text-purple-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {agent.agentType ? agent.agentType.charAt(0).toUpperCase() + agent.agentType.slice(1) : 'General'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      agent.role === 'admin' ? 'bg-red-100 text-red-800' :
                      agent.role === 'editor' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {agent.role?.charAt(0).toUpperCase() + agent.role?.slice(1) || 'User'}
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

    </>
  );
}