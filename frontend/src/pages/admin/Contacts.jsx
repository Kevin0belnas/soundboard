import { useState, useEffect } from "react";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiBook,
  FiUserCheck,
  FiUserX,
  FiCheckSquare,
  FiSquare,
  FiChevronDown,
  FiX,
  FiSearch,
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiLock,
} from "react-icons/fi";
import axios from "axios";

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function Contacts() {
  const [activeTab, setActiveTab] = useState("all");
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [notification, setNotification] = useState({ show: false, type: "", message: "" });
  const [stats, setStats] = useState({ total: 0, unassigned: 0 });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50); // Show 50 items per page
  const [paginationLoading, setPaginationLoading] = useState(false);

  // Fetch contacts based on active tab and pagination
  useEffect(() => {
    fetchContacts();
    fetchAgents();
    fetchStats();
  }, [activeTab, currentPage, itemsPerPage]);

  // Reset to first page when changing tabs
  useEffect(() => {
    setCurrentPage(1);
    setSelectedContacts(new Set());
    setSearchQuery("");
  }, [activeTab]);

  useEffect(() => {
    // When search query changes, filter the current page's contacts
    if (searchQuery.trim()) {
      filterContactsBySearch();
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  const fetchStats = async () => {
    try {
      const response = await api.get("/contacts/stats/summary");
      if (response.data.success) {
        setStats({
          total: response.data.stats.total_leads,
          unassigned: response.data.stats.unassigned_leads
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchContacts = async () => {
    setIsLoading(true);
    setPaginationLoading(true);
    try {
      // Use paginated endpoint
      let endpoint = activeTab === "all" 
        ? `/contacts/page/${currentPage}/limit/${itemsPerPage}` 
        : `/contacts/unassigned/page/${currentPage}/limit/${itemsPerPage}`;
      
      const response = await api.get(endpoint);
      
      if (response.data.success) {
        setContacts(response.data.data);
        setFilteredContacts(response.data.data);
        setTotalPages(response.data.pagination.pages);
        setTotalItems(response.data.pagination.total);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      showNotification("error", "Failed to fetch contacts");
    } finally {
      setIsLoading(false);
      setPaginationLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await api.get("/contacts/agents/available");
      if (response.data.success) {
        // Ensure agent IDs are treated as strings (MongoDB ObjectIds are strings)
        const agentsWithStringIds = response.data.data.map(agent => ({
          ...agent,
          id: agent.id.toString() // Ensure ID is string
        }));
        setAgents(agentsWithStringIds);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      // Set dummy data with string IDs for testing
      setAgents([
        { id: "1", name: "John Opener", email: "john@example.com", role: "opener" },
        { id: "2", name: "Jane Closer", email: "jane@example.com", role: "closer" },
        { id: "3", name: "Admin User", email: "admin@example.com", role: "admin" },
      ]);
    }
  };

  const filterContactsBySearch = () => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contacts);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = contacts.filter(contact => 
      contact.name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.phone?.toLowerCase().includes(query) ||
      contact.book_title?.toLowerCase().includes(query) ||
      contact.publisher?.toLowerCase().includes(query) ||
      contact.author?.toLowerCase().includes(query)
    );
    
    setFilteredContacts(filtered);
  };

  const handleSelectAll = () => {
    if (activeTab === "unassigned") {
      // In unassigned tab, all contacts are selectable
      if (selectedContacts.size === filteredContacts.length && filteredContacts.length > 0) {
        setSelectedContacts(new Set());
      } else {
        const newSelected = new Set(filteredContacts.map(c => c.id));
        setSelectedContacts(newSelected);
      }
    } else {
      // In all contacts tab, only select unassigned contacts
      const unassignedContacts = filteredContacts.filter(c => !c.assigned_to);
      if (selectedContacts.size === unassignedContacts.length && unassignedContacts.length > 0) {
        setSelectedContacts(new Set());
      } else {
        const newSelected = new Set(unassignedContacts.map(c => c.id));
        setSelectedContacts(newSelected);
      }
    }
  };

  const handleSelectContact = (contactId, assignedTo) => {
    // Don't allow selection if contact is already assigned (in all tab)
    if (activeTab === "all" && assignedTo) {
      showNotification("info", "Assigned contacts cannot be selected");
      return;
    }

    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleBulkAssign = async () => {
    if (selectedContacts.size === 0) {
      showNotification("warning", "Please select at least one contact");
      return;
    }

    if (!selectedAgent) {
      showNotification("warning", "Please select an agent");
      return;
    }

    setIsAssigning(true);
    try {
      const response = await api.post("/contacts/bulk-assign", {
        leadIds: Array.from(selectedContacts),
        agentId: selectedAgent,
        assignedBy: localStorage.getItem("userId") || null
      });

      if (response.data.success) {
        showNotification("success", response.data.message);
        setSelectedContacts(new Set());
        setSelectedAgent("");
        fetchContacts(); // Refresh the list
        fetchStats(); // Update stats
      }
    } catch (error) {
      console.error("Bulk assign error:", error);
      showNotification("error", error.response?.data?.message || "Failed to assign contacts");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleBulkUnassign = async () => {
    if (selectedContacts.size === 0) {
      showNotification("warning", "Please select at least one contact");
      return;
    }

    if (!window.confirm(`Are you sure you want to unassign ${selectedContacts.size} contact(s)?`)) {
      return;
    }

    setIsAssigning(true);
    try {
      const response = await api.post("/contacts/bulk-unassign", {
        leadIds: Array.from(selectedContacts)
      });

      if (response.data.success) {
        showNotification("success", response.data.message);
        setSelectedContacts(new Set());
        fetchContacts(); // Refresh the list
        fetchStats(); // Update stats
      }
    } catch (error) {
      console.error("Bulk unassign error:", error);
      showNotification("error", error.response?.data?.message || "Failed to unassign contacts");
    } finally {
      setIsAssigning(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: "", message: "" }), 3000);
  };

  const getAgentName = (agentId) => {
    if (!agentId) return "Unassigned";
    const agent = agents.find(a => a.id.toString() === agentId.toString());
    return agent ? agent.name : `Agent #${agentId}`;
  };

  // Pagination handlers
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  // Get selectable contacts count (for All tab - only unassigned are selectable)
  const getSelectableCount = () => {
    if (activeTab === "unassigned") {
      return filteredContacts.length;
    } else {
      return filteredContacts.filter(c => !c.assigned_to).length;
    }
  };

  const tabs = [
    { id: "all", label: "All Contacts", icon: FiUser, count: stats.total },
    { id: "unassigned", label: "Unassigned", icon: FiUserX, count: stats.unassigned },
  ];

  // Pagination Component (reusable)
  const PaginationControls = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700">
          Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
          <span className="font-medium">
            {Math.min(currentPage * itemsPerPage, totalItems)}
          </span>{' '}
          of <span className="font-medium">{totalItems.toLocaleString()}</span> results
        </span>
        <select
          value={itemsPerPage}
          onChange={handleItemsPerPageChange}
          className="ml-4 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={250}>250 / page</option>
          <option value={1000}>1000 / page</option>
          <option value={2000}>2000 / page</option>
        </select>
      </div>
      
      <div className="flex items-center space-x-2">
        <button
          onClick={goToFirstPage}
          disabled={currentPage === 1}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="First page"
        >
          <FiChevronsLeft className="h-5 w-5" />
        </button>
        <button
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Previous page"
        >
          <FiChevronLeft className="h-5 w-5" />
        </button>
        
        <span className="text-sm text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        
        <button
          onClick={goToNextPage}
          disabled={currentPage === totalPages}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Next page"
        >
          <FiChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={goToLastPage}
          disabled={currentPage === totalPages}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Last page"
        >
          <FiChevronsRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          notification.type === "success" ? "bg-green-500" :
          notification.type === "error" ? "bg-red-500" :
          notification.type === "info" ? "bg-blue-500" :
          "bg-yellow-500"
        } text-white`}>
          {notification.message}
        </div>
      )}

      {/* Header with Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedContacts(new Set());
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className={`
                    group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm
                    ${isActive
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }
                  `}
                >
                  <Icon className={`mr-2 h-5 w-5 ${
                    isActive ? "text-indigo-500" : "text-gray-400 group-hover:text-gray-500"
                  }`} />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                      isActive
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {tab.count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Top Pagination */}
        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <PaginationControls />
          </div>
        )}

        {/* Action Bar */}
        <div className="p-4 flex flex-wrap items-center gap-4">
          <button
            onClick={handleSelectAll}
            disabled={activeTab === "all" && getSelectableCount() === 0}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedContacts.size === getSelectableCount() && getSelectableCount() > 0 ? (
              <FiCheckSquare className="mr-2 h-4 w-4" />
            ) : (
              <FiSquare className="mr-2 h-4 w-4" />
            )}
            {selectedContacts.size === getSelectableCount() && getSelectableCount() > 0 ? "Deselect All" : "Select All"}
            {selectedContacts.size > 0 && (
              <span className="ml-2 bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-xs">
                {selectedContacts.size}
              </span>
            )}
          </button>

          <div className="relative flex-1 max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search in current page..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <FiUserCheck className="mr-2 h-4 w-4" />
                {selectedAgent ? agents.find(a => a.id.toString() === selectedAgent.toString())?.name || "Select Agent" : "Select Agent"}
                <FiChevronDown className="ml-2 h-4 w-4" />
              </button>

              {showAgentDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                  <div className="py-1 max-h-60 overflow-y-auto">
                    {agents.length > 0 ? (
                      agents.map((agent) => (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent.id.toString());
                            setShowAgentDropdown(false);
                          }}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-gray-500">{agent.email}</div>
                          <div className="text-xs text-gray-400 capitalize">{agent.role}</div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500">No agents found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleBulkAssign}
              disabled={isAssigning || selectedContacts.size === 0 || !selectedAgent}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAssigning ? "Assigning..." : "Assign Selected"}
            </button>

            {activeTab !== "unassigned" && (
              <button
                onClick={handleBulkUnassign}
                disabled={isAssigning || selectedContacts.size === 0}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiUserX className="mr-2 h-4 w-4" />
                Unassign
              </button>
            )}

            <button
              onClick={() => {
                fetchContacts();
                fetchStats();
                fetchAgents();
              }}
              className="p-2 text-gray-400 hover:text-gray-500"
            >
              <FiRefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact Info
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Book Details
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading || paginationLoading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No contacts found
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const isAssigned = !!contact.assigned_to;
                  const isSelectable = activeTab === "unassigned" || !isAssigned;
                  
                  return (
                    <tr 
                      key={contact.id} 
                      className={`hover:bg-gray-50 ${!isSelectable ? 'bg-gray-50' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isSelectable ? (
                          <button
                            onClick={() => handleSelectContact(contact.id, contact.assigned_to)}
                            className="text-gray-400 hover:text-gray-500"
                          >
                            {selectedContacts.has(contact.id) ? (
                              <FiCheckSquare className="h-5 w-5 text-indigo-600" />
                            ) : (
                              <FiSquare className="h-5 w-5" />
                            )}
                          </button>
                        ) : (
                          <div className="text-gray-300" title="Already assigned">
                            <FiLock className="h-5 w-5" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 bg-gradient-to-br ${
                            isAssigned 
                              ? 'from-gray-400 to-gray-500' 
                              : 'from-indigo-500 to-purple-600'
                          } rounded-full flex items-center justify-center`}>
                            <span className="text-white font-medium text-sm">
                              {contact.name?.charAt(0).toUpperCase() || "?"}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {contact.name || "No Name"}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center">
                              <FiMail className="mr-1 h-3 w-3" />
                              {contact.email || "No email"}
                            </div>
                            {contact.phone && (
                              <div className="text-sm text-gray-500 flex items-center">
                                <FiPhone className="mr-1 h-3 w-3" />
                                {contact.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          <div className="flex items-center">
                            <FiBook className="mr-1 h-3 w-3 text-gray-400" />
                            {contact.book_title || "No title"}
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {contact.author && `by ${contact.author}`}
                        </div>
                        {contact.publisher && (
                          <div className="text-xs text-gray-400">
                            {contact.publisher}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          contact.status === "New" ? "bg-green-100 text-green-800" :
                          contact.status === "Contacted" ? "bg-blue-100 text-blue-800" :
                          contact.status === "In Progress" ? "bg-yellow-100 text-yellow-800" :
                          contact.status === "Closed" ? "bg-gray-100 text-gray-800" :
                          contact.status === "Completed" ? "bg-purple-100 text-purple-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {contact.status || "New"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isAssigned ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs">
                            <FiUserCheck className="mr-1 h-3 w-3" />
                            {getAgentName(contact.assigned_to)}
                          </span>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(contact.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        {!isLoading && !paginationLoading && totalItems > 0 && (
          <div className="px-6 py-4 bg-white border-t border-gray-200">
            <PaginationControls />
          </div>
        )}
      </div>

      {/* Selection Info Bar */}
      {selectedContacts.size > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center space-x-4">
          <span className="font-medium">{selectedContacts.size} contact(s) selected</span>
          <button
            onClick={() => setSelectedContacts(new Set())}
            className="p-1 hover:bg-indigo-700 rounded-full"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}