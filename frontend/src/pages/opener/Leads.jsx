import { useState, useEffect } from "react";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiBook,
  FiUserCheck,
  FiSearch,
  FiRefreshCw,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiStar,
  FiFlag,
  FiMessageSquare,
  FiThumbsDown, 
  FiX,
  FiSend,
  FiVolume2,
  FiCopy,
} from "react-icons/fi";
import axios from "axios";

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function Leads() {
  const [activeTab, setActiveTab] = useState("my-leads"); // "my-leads", "flagged", "declined", "transferred"
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState({ show: false, type: "", message: "" });
  const [selectedLead, setSelectedLead] = useState(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [selectedTargetAgent, setSelectedTargetAgent] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(false);

  const [showScriptModal, setShowScriptModal] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedScript, setSelectedScript] = useState(null);
  const [copied, setCopied] = useState(false);
  const [playingScriptId, setPlayingScriptId] = useState(null);
  const [audioElement, setAudioElement] = useState(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  
  // Get current user info
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("name") || "User";
  const userRole = localStorage.getItem("role") || "opener";

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Status filter
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchLeads();
  }, [activeTab, currentPage, itemsPerPage, statusFilter]);

  useEffect(() => {
    filterLeadsBySearch();
  }, [searchQuery, leads]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showScriptModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showScriptModal]);

  const fetchScripts = async () => {
    setLoadingScripts(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:5000/api/scripts", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Filter to show only admin and opener scripts
        const scriptsArray = Array.isArray(data) 
          ? data.filter(script => script.type === 'admin' || script.type === 'opener')
          : [];
        setScripts(scriptsArray);
        // Set first script as selected by default
        if (scriptsArray.length > 0) {
          setSelectedScript(scriptsArray[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching scripts:", error);
    } finally {
      setLoadingScripts(false);
    }
  };

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      let endpoint = '';
      
      // Different endpoints based on tab
      if (activeTab === "my-leads") {
        endpoint = `/contacts/assigned-to/${userId}/my-leads/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "flagged") {
        endpoint = `/contacts/assigned-to/${userId}/flagged/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "declined") {
        endpoint = `/contacts/assigned-to/${userId}/declined/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "transferred") {
        endpoint = `/contacts/transferred-to/${userId}/page/${currentPage}/limit/${itemsPerPage}`;
      }
      
      if (statusFilter !== 'all') {
        endpoint += `?status=${statusFilter}`;
      }
      
      const response = await api.get(endpoint);
      
      if (response.data.success) {
        setLeads(response.data.data);
        setFilteredLeads(response.data.data);
        setTotalPages(response.data.pagination.pages);
        setTotalItems(response.data.pagination.total);
      }
    } catch (error) {
      //console.error("Error fetching leads:", error);
      if (error.response?.status !== 500) {
        //showNotification("error", "Failed to fetch your leads");
      } else {
        setLeads([]);
        setFilteredLeads([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  console.log("Leads data:", filteredLeads);

  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    try {
      const response = await api.get("/contacts/agents/available");
      if (response.data.success) {
        // Filter agents based on role
        let agents = response.data.data;
        if (userRole === "opener") {
          // Openers can transfer to closers
          agents = agents.filter(agent => 
            agent.role === "closer" && agent.id !== userId
          );
        } else if (userRole === "closer") {
          // Closers can transfer to openers
          agents = agents.filter(agent => 
            agent.role === "opener" && agent.id !== userId
          );
        }
        setAvailableAgents(agents);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      // Fallback dummy data
      setAvailableAgents([
        { id: "2", name: "Jane Closer", email: "jane@example.com", role: "closer" },
        { id: "4", name: "Mike Closer", email: "mike@example.com", role: "closer" },
      ]);
    } finally {
      setLoadingAgents(false);
    }
  };

  const filterLeadsBySearch = () => {
    if (!searchQuery.trim()) {
      setFilteredLeads(leads);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = leads.filter(lead => 
      lead.name?.toLowerCase().includes(query) ||
      lead.email?.toLowerCase().includes(query) ||
      lead.phone?.toLowerCase().includes(query) ||
      lead.book_title?.toLowerCase().includes(query) ||
      lead.publisher?.toLowerCase().includes(query) ||
      lead.author?.toLowerCase().includes(query) ||
      lead.comment?.toLowerCase().includes(query)
    );
    
    setFilteredLeads(filtered);
  };

  const handleUpdateRating = async () => {
    if (!selectedLead || !selectedRating) return;
    
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/rating`, {
        rating: selectedRating,
        updatedBy: userId
      });
      
      if (response.data.success) {
        showNotification("success", response.data.message);
        setShowRatingModal(false);
        setSelectedRating("");
        fetchLeads();
        
        if (selectedRating === 'Decline') {
          window.dispatchEvent(new CustomEvent('refreshContacts'));
        }
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to update rating");
    }
  };

  const handleTransferLead = async () => {
    if (!selectedLead || !selectedTargetAgent || !transferReason.trim()) {
      showNotification("warning", "Please select an agent and provide a reason");
      return;
    }
    
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/transfer`, {
        targetAgentId: selectedTargetAgent,
        reason: transferReason,
        transferredBy: userId
      });
      
      if (response.data.success) {
        showNotification("success", response.data.message);
        setShowTransferModal(false);
        setSelectedTargetAgent("");
        setTransferReason("");
        fetchLeads();
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to transfer lead");
    }
  };

  const handleAddComment = async () => {
    if (!selectedLead || !commentText.trim()) return;
    
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/comment`, {
        comment: commentText,
        commentedBy: userId,
        userName: userName
      });
      
      if (response.data.success) {
        showNotification("success", "Comment added successfully");
        setShowCommentModal(false);
        setCommentText("");
        fetchLeads();
      }
    } catch (error) {
      showNotification("error", "Failed to add comment", error);
    }
  };

  const handleCopyScript = () => {
    const textToCopy = selectedScript.content
      .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
      .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
      .replace(/\[Your Name\]/g, selectedScript?.author?.name || "User");
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      showNotification("success", "Script copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      showNotification("error", "Failed to copy script");
    });
  };

  const handlePlayAudio = async () => {
    if (!selectedScript) return;
    
    if (playingScriptId === selectedScript._id && audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setPlayingScriptId(null);
      setAudioElement(null);
      return;
    }
    
    // Stop any currently playing audio
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setAudioElement(null);
    }
    
    // Get replaced content
    const replacedContent = selectedScript.content
      .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
      .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
      .replace(/\[Your Name\]/g, selectedScript?.author?.name || "User");
    
    setGeneratingAudio(true);
    
    try {
      // Generate audio with personalized content
      const response = await api.post('/scripts/generate-audio-temp', {
        text: replacedContent,
        scriptId: selectedScript._id
      });
      
      if (response.data.success && response.data.audioUrl) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const audioUrl = response.data.audioUrl.startsWith('http') 
          ? response.data.audioUrl 
          : `${baseUrl.replace('/api', '')}${response.data.audioUrl}`;
        
        const audio = new Audio(audioUrl);
        
        audio.play().catch(err => {
          console.error('Audio play error:', err);
          showNotification("error", "Failed to play audio");
          setPlayingScriptId(null);
        });
        
        setPlayingScriptId(selectedScript._id);
        setAudioElement(audio);
        
        audio.onended = () => {
          setPlayingScriptId(null);
          setAudioElement(null);
        };
      } else {
        showNotification("error", "Failed to generate audio");
      }
    } catch (error) {
      console.error('Audio generation error:', error);
      showNotification("error", "Failed to generate personalized audio");
    } finally {
      setGeneratingAudio(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: "", message: "" }), 3000);
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

  const getStatusColor = (status) => {
    switch(status) {
      case "New": return "bg-green-100 text-green-800";
      case "Contacted": return "bg-blue-100 text-blue-800";
      case "In Progress": return "bg-yellow-100 text-yellow-800";
      case "Closed": return "bg-gray-100 text-gray-800";
      case "Completed": return "bg-purple-100 text-purple-800";
      case "Incompleted": return "bg-red-100 text-red-800";
      case "Transferred": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getRatingDisplay = (lead) => {
    if (lead.rating === "Flagged") {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
          <FiFlag className="h-3 w-3 mr-1" />
          Flagged
        </span>
      );
    } else if (lead.status === "Incompleted" && !lead.assigned_to) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <FiThumbsDown className="h-3 w-3 mr-1" />
          Declined
        </span>
      );
    } else if (lead.transferred_to) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          <FiSend className="h-3 w-3 mr-1" />
          Transferred
        </span>
      );
    }
    return null;
  };

  const getTransferredToName = (agentId) => {
    if (!agentId) return "Unknown";
    const agent = availableAgents.find(a => a.id === agentId);
    return agent ? agent.name : `Agent ${agentId.substring(0, 8)}...`;
  };

  const tabs = [
    { 
      id: "my-leads", 
      label: "My Leads", 
      icon: FiUserCheck, 
      color: "indigo", 
      description: "Leads currently assigned to you" 
    },
    { 
      id: "flagged", 
      label: "Flagged", 
      icon: FiFlag, 
      color: "purple", 
      description: "Flagged leads (still assigned to you)" 
    },
    { 
      id: "transferred", 
      label: "Transferred to Me", 
      icon: FiSend, 
      color: "blue", 
      description: "Leads transferred/referred to you" 
    },
    { 
      id: "declined", 
      label: "Declined", 
      icon: FiThumbsDown, 
      color: "red", 
      description: "Leads you declined (removed from your list)" 
    },
  ];

  // Pagination Component
  const PaginationControls = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700">
          Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
          <span className="font-medium">
            {Math.min(currentPage * itemsPerPage, totalItems)}
          </span>{' '}
          of <span className="font-medium">{totalItems.toLocaleString()}</span> leads
        </span>
        <select
          value={itemsPerPage}
          onChange={handleItemsPerPageChange}
          className="ml-4 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
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
          "bg-yellow-500"
        } text-white`}>
          {notification.message}
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Comment for {selectedLead.name}</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter your comment or note..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px]"
              autoFocus
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowCommentModal(false);
                  setCommentText("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleAddComment}
                disabled={!commentText.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Lead: {selectedLead.name}</h3>
            <p className="text-sm text-gray-600 mb-4">Choose an option:</p>
            <div className="space-y-3">
              <button
                onClick={() => setSelectedRating("Flagged")}
                className={`w-full p-3 rounded-lg border-2 transition ${
                  selectedRating === "Flagged" 
                    ? "border-purple-500 bg-purple-50" 
                    : "border-gray-200 hover:border-purple-200"
                }`}
              >
                <div className="flex items-center">
                  <FiFlag className="h-5 w-5 text-purple-500 mr-2" />
                  <div className="text-left">
                    <span className="font-medium block">Flagged</span>
                    <span className="text-xs text-gray-500">Lead stays assigned to you</span>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => setSelectedRating("Decline")}
                className={`w-full p-3 rounded-lg border-2 transition ${
                  selectedRating === "Decline" 
                    ? "border-red-500 bg-red-50" 
                    : "border-gray-200 hover:border-red-200"
                }`}
              >
                <div className="flex items-center">
                  <FiThumbsDown className="h-5 w-5 text-red-500 mr-2" />
                  <div className="text-left">
                    <span className="font-medium block">Decline</span>
                    <span className="text-xs text-gray-500">Lead removed from your list</span>
                  </div>
                </div>
              </button>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowRatingModal(false);
                  setSelectedRating("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRating}
                disabled={!selectedRating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Transfer Lead: {selectedLead.name}</h3>
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setSelectedTargetAgent("");
                  setTransferReason("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              This lead will be flagged in your list and transferred to the selected agent.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Agent
                </label>
                <select
                  value={selectedTargetAgent}
                  onChange={(e) => setSelectedTargetAgent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select an agent...</option>
                  {loadingAgents ? (
                    <option disabled>Loading agents...</option>
                  ) : (
                    availableAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role}) - {agent.email}
                      </option>
                    ))
                  )}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer Reason
                </label>
                <textarea
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Enter reason for transfer..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setSelectedTargetAgent("");
                  setTransferReason("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleTransferLead}
                disabled={!selectedTargetAgent || !transferReason.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center"
              >
                <FiSend className="mr-2 h-4 w-4" />
                Transfer & Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Script Modal */}
      {showScriptModal && selectedLead && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-6xl w-full min-h-[90vh] max-h-[90vh] my-auto flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-black">Scripts for {selectedLead.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Book: "{selectedLead.book_title}"</p>
              </div>
              <button
                onClick={() => {
                  setShowScriptModal(false);
                  setSelectedScript(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 flex" style={{ minHeight: 0, overflow: 'hidden' }}>
              {loadingScripts ? (
                <div className="flex justify-center items-center py-12 w-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : scripts.length === 0 ? (
                <div className="text-center py-12 w-full">
                  <FiBook className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No scripts available</p>
                </div>
              ) : (
                <>
                  {/* Left Column */}
                  <div className="w-1/3 border-r border-gray-200 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
                    <div className="p-4 border-b border-gray-200 flex-shrink-0">
                      <h1 className="text-sm font-semibold text-gray-900">Select Script Template</h1>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {scripts.map((script) => (
                        <button
                          key={script._id}
                          onClick={() => setSelectedScript(script)}
                          className={`w-full text-left p-3 rounded-lg border transition ${
                            selectedScript?._id === script._id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                          } ${
                            playingScriptId === script._id ? 'ring ring-green-400' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center flex-1">
                              {playingScriptId === script._id && (
                                <FiVolume2 className="h-4 w-4 text-green-600 mr-2 animate-pulse" />
                              )}
                              <h4 className="font-medium text-sm text-gray-900 flex-1">{script.title}</h4>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: 'hidden' }}>
                    {selectedScript ? (
                      <>
                        {/* Script Header */}
                        <div className="p-6 border-b border-gray-200 flex-shrink-0">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-xl font-semibold text-gray-900">{selectedScript.title}</h3>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={handlePlayAudio}
                                disabled={generatingAudio}
                                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                                  playingScriptId === selectedScript._id
                                    ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                    : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                title={playingScriptId === selectedScript._id ? "Stop audio" : "Play personalized audio"}
                              >
                                <FiVolume2 className={`h-4 w-4 mr-1.5 ${playingScriptId === selectedScript._id ? 'animate-pulse' : ''}`} />
                                {generatingAudio ? "Generating..." : playingScriptId === selectedScript._id ? "Stop" : "Play"}
                              </button>
                              <button
                                onClick={handleCopyScript}
                                className="flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
                                title="Copy script to clipboard"
                              >
                                <FiCopy className="h-4 w-4 mr-1.5" />
                                {copied ? "Copied!" : "Copy"}
                              </button>
                            </div>
                          </div>
                          {selectedScript.author && (
                            <p className="text-sm text-gray-500">
                              Created by {selectedScript.author.name}
                            </p>
                          )}
                        </div>

                        {/* Script Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                          <div className="prose max-w-none">
                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {selectedScript.content
                                .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
                                .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
                                .replace(/\[Your Name\]/g, selectedScript?.author?.name || "User")}
                            </p>
                          </div>

                          {selectedScript.audioStatus === 'generating' && (
                            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                              Audio is being generated...
                            </div>
                          )}

                          {selectedScript.audioStatus === 'failed' && (
                            <div className="mt-6 p-4 bg-red-50 rounded-lg text-sm text-red-700">
                              Audio generation failed: {selectedScript.audioError}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <div className="text-center">
                          <FiBook className="h-12 w-12 mx-auto mb-3" />
                          <p>Select a script to view details</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header with Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const colorClasses = {
                indigo: "border-indigo-500 text-indigo-600",
                purple: "border-purple-500 text-purple-600",
                blue: "border-blue-500 text-blue-600",
                red: "border-red-500 text-red-600"
              };
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                    setSearchQuery("");
                    if (tab.id === "transferred") {
                      // Fetch agents when switching to transferred tab
                      fetchAvailableAgents();
                    }
                  }}
                  className={`
                    group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm relative
                    ${isActive 
                      ? colorClasses[tab.color]
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }
                  `}
                  title={tab.description}
                >
                  <Icon className={`mr-2 h-5 w-5 ${
                    isActive ? `text-${tab.color}-500` : "text-gray-400 group-hover:text-gray-500"
                  }`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Search and Filter Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="relative max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            
            <div className="flex items-center space-x-3">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Closed">Closed</option>
              </select>
              
              <button
                onClick={fetchLeads}
                className="p-2 text-gray-400 hover:text-gray-500"
              >
                <FiRefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Top Pagination */}
        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <PaginationControls />
          </div>
        )}
      </div>

      {/* Leads Table */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
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
                  Rating
                </th>
                {activeTab === "transferred" && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transferred By
                  </th>
                )}
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comments/Notes
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={activeTab === "transferred" ? 7 : 6} className="px-6 py-4 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "transferred" ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
                    {searchQuery ? (
                      "No leads match your search"
                    ) : activeTab === "my-leads" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiUser className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No active leads</p>
                        <p className="text-sm text-gray-400">Leads assigned to you will appear here</p>
                      </div>
                    ) : activeTab === "flagged" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiFlag className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No flagged leads yet</p>
                        <p className="text-sm text-gray-400">When you flag leads, they will appear here</p>
                      </div>
                    ) : activeTab === "transferred" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiSend className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No transferred leads</p>
                        <p className="text-sm text-gray-400">Leads transferred to you will appear here</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8">
                        <FiThumbsDown className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No declined leads</p>
                        <p className="text-sm text-gray-400">Leads you decline will appear here</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    onClick={() => {
                      setSelectedLead(lead);
                      setShowScriptModal(true);
                      fetchScripts();
                    }}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 bg-gradient-to-br ${
                          lead.rating === 'Flagged' ? 'from-purple-500 to-purple-600' :
                          lead.status === 'Incompleted' && !lead.assigned_to ? 'from-red-500 to-red-600' :
                          lead.transferred_to ? 'from-blue-500 to-blue-600' :
                          'from-indigo-500 to-purple-600'
                        } rounded-full flex items-center justify-center`}>
                          <span className="text-white font-medium text-sm">
                            {lead.name?.charAt(0).toUpperCase() || "?"}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {lead.name || "No Name"}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <FiMail className="mr-1 h-3 w-3" />
                            {lead.email || "No email"}
                          </div>
                          {lead.phone && (
                            <div className="text-sm text-gray-500 flex items-center">
                              <FiPhone className="mr-1 h-3 w-3" />
                              {lead.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center">
                          <FiBook className="mr-1 h-3 w-3 text-gray-400" />
                          {lead.book_title || "No title"}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {lead.author && `by ${lead.author}`}
                      </div>
                      {lead.publisher && (
                        <div className="text-xs text-gray-400">
                          {lead.publisher}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                        {lead.status || "New"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRatingDisplay(lead)}
                      {lead.transferred_to && activeTab !== "transferred" && (
                        <span className="ml-2 text-xs text-gray-500">
                          → {getTransferredToName(lead.transferred_to)}
                        </span>
                      )}
                    </td>
                    {activeTab === "transferred" && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-400">
                            {lead.transferred_at ? new Date(lead.transferred_at).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        {lead.comment ? (
                          <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                            <p className="line-clamp-2">{lead.comment}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(lead.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowCommentModal(true);
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"
                          >
                            <FiMessageSquare className="mr-1 h-3 w-3" />
                            Add note
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        {activeTab === "my-leads" && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                setShowRatingModal(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50"
                              title="Flag or Decline lead"
                            >
                              <FiStar className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedLead(lead);
                                fetchAvailableAgents();
                                setShowTransferModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900 p-1 rounded-full hover:bg-blue-50"
                              title="Transfer to another agent"
                            >
                              <FiSend className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            setSelectedLead(lead);
                            setShowCommentModal(true);
                          }}
                          className="text-gray-600 hover:text-gray-900 p-1 rounded-full hover:bg-gray-50"
                          title="Add comment"
                        >
                          <FiMessageSquare className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-4 bg-white border-t border-gray-200">
            <PaginationControls />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">My Leads</p>
              <p className="text-2xl font-semibold text-gray-900">
                {leads.filter(l => l.assigned_to && (!l.rating || l.rating !== 'Flagged') && !l.transferred_to).length}
              </p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <FiUser className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Flagged</p>
              <p className="text-2xl font-semibold text-purple-600">
                {leads.filter(l => l.rating === 'Flagged').length}
              </p>
              <p className="text-xs text-gray-400">Still assigned to you</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <FiFlag className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Transferred</p>
              <p className="text-2xl font-semibold text-blue-600">
                {leads.filter(l => l.transferred_to).length}
              </p>
              <p className="text-xs text-gray-400">Sent to other agents</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <FiSend className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Declined</p>
              <p className="text-2xl font-semibold text-red-600">
                {leads.filter(l => l.status === 'Incompleted' && !l.assigned_to).length}
              </p>
              <p className="text-xs text-gray-400">Removed from your list</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <FiThumbsDown className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}