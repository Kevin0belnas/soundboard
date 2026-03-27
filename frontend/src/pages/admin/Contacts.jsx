import { useState, useEffect, useRef } from "react";
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
  FiLock,
} from "react-icons/fi";
import axios from "axios";
import Pagination from "../../components/Pagination";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [paginationLoading, setPaginationLoading] = useState(false);

  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchContacts();
    fetchAgents();
    fetchStats();
  }, [activeTab, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedContacts(new Set());
    setSearchQuery("");
  }, [activeTab]);

  useEffect(() => {
    if (searchQuery.trim()) {
      filterContactsBySearch();
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowAgentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get("/contacts/stats/summary");
      if (response.data.success) {
        setStats({
          total: response.data.stats.total_leads,
          unassigned: response.data.stats.unassigned_leads,
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
      const endpoint =
        activeTab === "all"
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
        setAgents(
          response.data.data.map((a) => ({ ...a, id: a.id.toString() }))
        );
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      setAgents([
        { id: "1", name: "John Opener", email: "john@example.com", role: "opener" },
        { id: "2", name: "Jane Closer", email: "jane@example.com", role: "closer" },
        { id: "3", name: "Admin User", email: "admin@example.com", role: "admin" },
      ]);
    }
  };

  const filterContactsBySearch = () => {
    if (!searchQuery.trim()) { setFilteredContacts(contacts); return; }
    const q = searchQuery.toLowerCase();
    setFilteredContacts(
      contacts.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.book_title?.toLowerCase().includes(q) ||
        c.publisher?.toLowerCase().includes(q) ||
        c.author?.toLowerCase().includes(q)
      )
    );
  };

  const getSelectableCount = () =>
    activeTab === "unassigned"
      ? filteredContacts.length
      : filteredContacts.filter((c) => !c.assigned_to).length;

  const handleSelectAll = () => {
    const selectable =
      activeTab === "unassigned"
        ? filteredContacts
        : filteredContacts.filter((c) => !c.assigned_to);

    if (selectedContacts.size === selectable.length && selectable.length > 0) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(selectable.map((c) => c.id)));
    }
  };

  const handleSelectContact = (contactId, assignedTo) => {
    if (activeTab === "all" && assignedTo) {
      showNotification("info", "Assigned contacts cannot be selected");
      return;
    }
    const next = new Set(selectedContacts);
    next.has(contactId) ? next.delete(contactId) : next.add(contactId);
    setSelectedContacts(next);
  };

  const handleBulkAssign = async () => {
    if (selectedContacts.size === 0) { showNotification("warning", "Please select at least one contact"); return; }
    if (!selectedAgent) { showNotification("warning", "Please select an agent"); return; }

    setIsAssigning(true);
    try {
      const response = await api.post("/contacts/bulk-assign", {
        leadIds: Array.from(selectedContacts),
        agentId: selectedAgent,
        assignedBy: localStorage.getItem("userId") || null,
      });
      if (response.data.success) {
        showNotification("success", response.data.message);
        setSelectedContacts(new Set());
        setSelectedAgent("");
        fetchContacts();
        fetchStats();
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to assign contacts");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleBulkUnassign = async () => {
    if (selectedContacts.size === 0) { showNotification("warning", "Please select at least one contact"); return; }
    if (!window.confirm(`Unassign ${selectedContacts.size} contact(s)?`)) return;

    setIsAssigning(true);
    try {
      const response = await api.post("/contacts/bulk-unassign", {
        leadIds: Array.from(selectedContacts),
      });
      if (response.data.success) {
        showNotification("success", response.data.message);
        setSelectedContacts(new Set());
        fetchContacts();
        fetchStats();
      }
    } catch (error) {
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
    const agent = agents.find((a) => a.id.toString() === agentId.toString());
    return agent ? agent.name : `Agent #${agentId}`;
  };

  const getStatusColor = (status) => {
    const map = {
      New: "bg-green-100 text-green-800",
      Contacted: "bg-blue-100 text-blue-800",
      "In Progress": "bg-yellow-100 text-yellow-800",
      Closed: "bg-gray-100 text-gray-800",
      Completed: "bg-purple-100 text-purple-800",
    };
    return map[status] || "bg-red-100 text-red-800";
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value > 0 ? Number(value) : 25);
    setCurrentPage(1);
  };

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

  const paginationProps = {
    currentPage, totalPages, totalItems, itemsPerPage,
    onItemsPerPageChange: handleItemsPerPageChange,
    onFirst: goToFirstPage,
    onPrev: goToPreviousPage,
    onNext: goToNextPage,
    onLast: goToLastPage,
  };

  const tabs = [
    { id: "all", label: "All Contacts", icon: FiUser, count: stats.total },
    { id: "unassigned", label: "Unassigned", icon: FiUserX, count: stats.unassigned },
  ];

  const selectedAgentName = agents.find(
    (a) => a.id.toString() === selectedAgent.toString()
  )?.name;

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm max-w-xs ${
          notification.type === "success" ? "bg-green-500" :
          notification.type === "error" ? "bg-red-500" :
          notification.type === "info" ? "bg-blue-500" : "bg-yellow-500"
        }`}>
          {notification.message}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto px-4 sm:px-6 scrollbar-hide" aria-label="Tabs">
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
                  className={`group inline-flex items-center px-3 sm:px-1 py-4 border-b-2 font-medium text-sm flex-shrink-0 mr-6 sm:mr-8 ${
                    isActive
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className={`h-5 w-5 sm:mr-2 ${isActive ? "text-indigo-500" : "text-gray-400"}`} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                      isActive ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-600"
                    }`}>
                      {tab.count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Top pagination */}
        {!isLoading && totalItems > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
            <Pagination {...paginationProps} />
          </div>
        )}

        {/* Action bar */}
        <div className="p-3 sm:p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search in current page..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => { fetchContacts(); fetchStats(); fetchAgents(); }}
              className="p-2 text-gray-400 hover:text-gray-500 flex-shrink-0"
            >
              <FiRefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSelectAll}
              disabled={activeTab === "all" && getSelectableCount() === 0}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {selectedContacts.size === getSelectableCount() && getSelectableCount() > 0 ? (
                <FiCheckSquare className="mr-1.5 h-4 w-4" />
              ) : (
                <FiSquare className="mr-1.5 h-4 w-4" />
              )}
              {selectedContacts.size === getSelectableCount() && getSelectableCount() > 0
                ? "Deselect All"
                : "Select All"}
              {selectedContacts.size > 0 && (
                <span className="ml-1.5 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-xs">
                  {selectedContacts.size}
                </span>
              )}
            </button>

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap max-w-[180px] sm:max-w-none"
              >
                <FiUserCheck className="mr-1.5 h-4 w-4 flex-shrink-0" />
                <span className="truncate">{selectedAgentName || "Select Agent"}</span>
                <FiChevronDown className="ml-1.5 h-4 w-4 flex-shrink-0" />
              </button>

              {showAgentDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-md shadow-lg z-20 border border-gray-200">
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
              className="inline-flex items-center px-3 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isAssigning ? "Assigning..." : "Assign Selected"}
            </button>

            {activeTab !== "unassigned" && (
              <button
                onClick={handleBulkUnassign}
                disabled={isAssigning || selectedContacts.size === 0}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <FiUserX className="mr-1.5 h-4 w-4" />
                Unassign
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table (Desktop) */}
      <div className="hidden sm:block bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <span className="sr-only">Select</span>
                </th>
                {["Contact Info", "Book Details", "Status", "Assigned To", "Created"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading || paginationLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No contacts found
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const isAssigned = !!contact.assigned_to;
                  const isSelectable = activeTab === "unassigned" || !isAssigned;
                  return (
                    <tr key={contact.id} className={`hover:bg-gray-50 ${!isSelectable ? "bg-gray-50" : ""}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isSelectable ? (
                          <button onClick={() => handleSelectContact(contact.id, contact.assigned_to)} className="text-gray-400 hover:text-gray-500">
                            {selectedContacts.has(contact.id)
                              ? <FiCheckSquare className="h-5 w-5 text-indigo-600" />
                              : <FiSquare className="h-5 w-5" />}
                          </button>
                        ) : (
                          <div className="text-gray-300" title="Already assigned">
                            <FiLock className="h-5 w-5" />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-br ${
                            isAssigned ? "from-gray-400 to-gray-500" : "from-indigo-500 to-purple-600"
                          }`}>
                            <span className="text-white font-medium text-sm">
                              {contact.name?.charAt(0).toUpperCase() || "?"}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{contact.name || "No Name"}</div>
                            <div className="text-sm text-gray-500 flex items-center"><FiMail className="mr-1 h-3 w-3" />{contact.email || "No email"}</div>
                            {contact.phone && <div className="text-sm text-gray-500 flex items-center"><FiPhone className="mr-1 h-3 w-3" />{contact.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 flex items-center"><FiBook className="mr-1 h-3 w-3 text-gray-400" />{contact.book_title || "No title"}</div>
                        {contact.author && <div className="text-sm text-gray-500">by {contact.author}</div>}
                        {contact.publisher && <div className="text-xs text-gray-400">{contact.publisher}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(contact.status)}`}>
                          {contact.status || "New"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isAssigned ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs">
                            <FiUserCheck className="mr-1 h-3 w-3" />{getAgentName(contact.assigned_to)}
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
        {!isLoading && !paginationLoading && totalItems > 0 && (
          <div className="px-6 py-4 bg-white border-t border-gray-200">
            <Pagination {...paginationProps} />
          </div>
        )}
      </div>

      {/* Cards (Mobile */}
      <div className="sm:hidden space-y-3">
        {isLoading || paginationLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            No contacts found
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const isAssigned = !!contact.assigned_to;
            const isSelectable = activeTab === "unassigned" || !isAssigned;
            const isSelected = selectedContacts.has(contact.id);
            return (
              <div
                key={contact.id}
                onClick={() => isSelectable && handleSelectContact(contact.id, contact.assigned_to)}
                className={`bg-white rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? "border-indigo-400 ring-1 ring-indigo-200"
                    : isSelectable
                      ? "border-gray-200 hover:border-indigo-200"
                      : "border-gray-100 bg-gray-50 cursor-default"
                }`}
              >
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {isSelectable ? (
                      isSelected
                        ? <FiCheckSquare className="h-5 w-5 text-indigo-600" />
                        : <FiSquare className="h-5 w-5 text-gray-400" />
                    ) : (
                      <FiLock className="h-5 w-5 text-gray-300" />
                    )}
                  </div>

                  <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-br ${
                    isAssigned ? "from-gray-400 to-gray-500" : "from-indigo-500 to-purple-600"
                  }`}>
                    <span className="text-white font-medium text-sm">
                      {contact.name?.charAt(0).toUpperCase() || "?"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{contact.name || "No Name"}</p>
                      <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(contact.status)}`}>
                        {contact.status || "New"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{contact.email || "No email"}</p>
                    {contact.phone && <p className="text-xs text-gray-400">{contact.phone}</p>}
                    <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <FiBook className="h-3 w-3 text-gray-400" />
                        <span className="truncate max-w-[140px]">{contact.book_title || "No title"}</span>
                      </p>
                      {isAssigned ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs">
                          <FiUserCheck className="mr-1 h-3 w-3" />{getAgentName(contact.assigned_to)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Unassigned</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(contact.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {!isLoading && !paginationLoading && totalItems > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <Pagination {...paginationProps} />
          </div>
        )}
      </div>

      {selectedContacts.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-4 z-50 text-sm">
          <span className="font-medium whitespace-nowrap">{selectedContacts.size} selected</span>
          <button onClick={() => setSelectedContacts(new Set())} className="p-1 hover:bg-indigo-700 rounded-full">
            <FiX className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}