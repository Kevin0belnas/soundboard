import { useEffect, useMemo, useState } from "react";
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

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const APP_BASE = API_BASE.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function Leads() {
  const [activeTab, setActiveTab] = useState("my-leads");
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState({
    show: false,
    type: "",
    message: "",
  });

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

  const [callingLeadId, setCallingLeadId] = useState(null);
  const [liveCall, setLiveCall] = useState(null);

  const storedUser = useMemo(
    () => JSON.parse(localStorage.getItem("user") || "{}"),
    []
  );

  const userId =
    localStorage.getItem("userId") ||
    localStorage.getItem("_id") ||
    storedUser._id ||
    storedUser.id ||
    "";

  const userName = localStorage.getItem("name") || storedUser.name || "User";
  const userRole = localStorage.getItem("role") || storedUser.role || "opener";

  // IMPORTANT: no hardcoded fallback like 2001 anymore
  const userExtension =
    storedUser.extension ||
    localStorage.getItem("extension") ||
    "2002";

  const userDid =
    storedUser.didNumber ||
    localStorage.getItem("didNumber") ||
    "";

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPage, itemsPerPage, statusFilter]);

  useEffect(() => {
    filterLeadsBySearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, leads]);

  useEffect(() => {
    document.body.style.overflow = showScriptModal ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
      stopPreviewAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScriptModal]);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification({ show: false, type: "", message: "" });
    }, 3000);
  };

  const stopPreviewAudio = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    setAudioElement(null);
    setPlayingScriptId(null);
  };

  const extractPrimaryPhone = (phoneValue = "") => {
    if (!phoneValue) return "";
    return String(phoneValue).split(/[,;/|]/)[0].trim();
  };

  const sanitizePhoneNumber = (phoneValue = "") => {
    return String(phoneValue).replace(/[^\d+]/g, "");
  };

  const getPersonalizedScriptText = () => {
    if (!selectedScript) return "";

    return String(selectedScript.content || "")
      .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
      .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
      .replace(
        /\[Your Name\]/g,
        selectedScript?.author?.name || userName || "User"
      );
  };

  const fetchScripts = async () => {
    setLoadingScripts(true);
    try {
      const response = await api.get("/scripts");

      const raw = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : [];

      const scriptsArray = raw.filter((script) =>
        ["admin", "opener", "general", "closer"].includes(script.type)
      );

      setScripts(scriptsArray);
      setSelectedScript((prev) => {
        if (prev && scriptsArray.find((s) => s._id === prev._id)) return prev;
        return scriptsArray.length > 0 ? scriptsArray[0] : null;
      });
    } catch (error) {
      console.error("Error fetching scripts:", error);
      setScripts([]);
      setSelectedScript(null);
      showNotification("error", "Failed to fetch scripts");
    } finally {
      setLoadingScripts(false);
    }
  };

  const fetchLeads = async () => {
    if (!userId) {
      setLeads([]);
      setFilteredLeads([]);
      return;
    }

    setIsLoading(true);

    try {
      let endpoint = "";

      if (activeTab === "my-leads") {
        endpoint = `/contacts/assigned-to/${userId}/my-leads/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "flagged") {
        endpoint = `/contacts/assigned-to/${userId}/flagged/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "declined") {
        endpoint = `/contacts/assigned-to/${userId}/declined/page/${currentPage}/limit/${itemsPerPage}`;
      } else if (activeTab === "transferred") {
        endpoint = `/contacts/transferred-to/${userId}/page/${currentPage}/limit/${itemsPerPage}`;
      }

      if (statusFilter !== "all") {
        endpoint += `?status=${encodeURIComponent(statusFilter)}`;
      }

      const response = await api.get(endpoint);

      if (response.data?.success) {
        const data = response.data.data || [];
        setLeads(data);
        setFilteredLeads(data);
        setTotalPages(response.data.pagination?.pages || 1);
        setTotalItems(response.data.pagination?.total || 0);
      } else {
        setLeads([]);
        setFilteredLeads([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (error) {
      console.error("Fetch leads error:", error);
      setLeads([]);
      setFilteredLeads([]);
      setTotalPages(1);
      setTotalItems(0);
      showNotification("error", "Failed to fetch leads");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    try {
      const response = await api.get("/contacts/agents/available");

      if (response.data?.success) {
        let agents = response.data.data || [];

        if (userRole === "opener") {
          agents = agents.filter(
            (agent) =>
              agent.role === "closer" && String(agent.id) !== String(userId)
          );
        } else if (userRole === "closer") {
          agents = agents.filter(
            (agent) =>
              agent.role === "opener" && String(agent.id) !== String(userId)
          );
        }

        setAvailableAgents(agents);
      } else {
        setAvailableAgents([]);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      setAvailableAgents([]);
      showNotification("error", "Failed to fetch agents");
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
    const filtered = leads.filter(
      (lead) =>
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
        updatedBy: userId,
      });

      if (response.data?.success) {
        showNotification("success", response.data.message || "Lead updated");
        setShowRatingModal(false);
        setSelectedRating("");
        fetchLeads();

        if (selectedRating === "Decline") {
          window.dispatchEvent(new CustomEvent("refreshContacts"));
        }
      } else {
        showNotification(
          "error",
          response.data?.message || "Failed to update lead"
        );
      }
    } catch (error) {
      showNotification(
        "error",
        error.response?.data?.message || "Failed to update rating"
      );
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
        transferredBy: userId,
      });

      if (response.data?.success) {
        showNotification("success", response.data.message || "Lead transferred");
        setShowTransferModal(false);
        setSelectedTargetAgent("");
        setTransferReason("");
        fetchLeads();
      } else {
        showNotification(
          "error",
          response.data?.message || "Failed to transfer lead"
        );
      }
    } catch (error) {
      showNotification(
        "error",
        error.response?.data?.message || "Failed to transfer lead"
      );
    }
  };

  const handleAddComment = async () => {
    if (!selectedLead || !commentText.trim()) return;

    try {
      const response = await api.post(`/contacts/${selectedLead.id}/comment`, {
        comment: commentText,
        commentedBy: userId,
        userName,
      });

      if (response.data?.success) {
        showNotification("success", "Comment added successfully");
        setShowCommentModal(false);
        setCommentText("");
        fetchLeads();
      } else {
        showNotification(
          "error",
          response.data?.message || "Failed to add comment"
        );
      }
    } catch (error) {
      console.error("Failed to add comment:", error);
      showNotification("error", "Failed to add comment");
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(getPersonalizedScriptText());
      setCopied(true);
      showNotification("success", "Script copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      showNotification("error", "Failed to copy script");
    }
  };

  const handlePreviewAudio = async () => {
    if (!selectedScript) return;

    if (playingScriptId === selectedScript._id && audioElement) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();

    const replacedContent = getPersonalizedScriptText();
    if (!replacedContent.trim()) {
      showNotification("warning", "Script content is empty");
      return;
    }

    setGeneratingAudio(true);

    try {
      const response = await api.post("/scripts/generate-audio-temp", {
        text: replacedContent,
        scriptId: selectedScript._id,
      });

      if (response.data?.success && response.data.audioUrl) {
        const audioUrl = response.data.audioUrl.startsWith("http")
          ? response.data.audioUrl
          : `${APP_BASE}${response.data.audioUrl}`;

        const audio = new Audio(audioUrl);

        audio.onended = () => {
          setPlayingScriptId(null);
          setAudioElement(null);
        };

        audio.onerror = () => {
          setPlayingScriptId(null);
          setAudioElement(null);
          showNotification("error", "Audio preview failed");
        };

        await audio.play();

        setPlayingScriptId(selectedScript._id);
        setAudioElement(audio);
      } else {
        showNotification("error", "Failed to generate preview audio");
      }
    } catch (error) {
      console.error("Preview audio error:", error);
      showNotification(
        "error",
        error.response?.data?.message || "Failed to preview audio"
      );
    } finally {
      setGeneratingAudio(false);
    }
  };

  const handleMapMySipDevice = async () => {
    if (!userId) {
      showNotification("error", "Missing logged-in user ID");
      return;
    }

    if (!userExtension) {
      showNotification(
        "error",
        "No SIP extension found. Save your real MicroSIP extension first."
      );
      return;
    }

    try {
      const response = await api.post("/asterisk/map-device", {
          userId,
          extension: "2002",
          sipChannel: "SIP/2002",
          didNumber: "",
          callerIdName: `${userName} (Sales)`,
          isActive: true,
      });

      if (response.data?.success) {
        showNotification(
          "success",
          `Your SIP device was mapped successfully to extension ${userExtension}`
        );
      } else {
        showNotification(
          "error",
          response.data?.message || "Failed to map device"
        );
      }
    } catch (error) {
      console.error("Map device error:", error);
      showNotification(
        "error",
        error.response?.data?.message || "Failed to map SIP device"
      );
    }
  };

  const ensureSipMapped = async () => {
    if (!userId) {
      throw new Error("Missing logged-in user ID");
    }

    if (!userExtension) {
      throw new Error(
        "No SIP extension found for this user. Set the real MicroSIP extension first."
      );
    }

    const response = await api.post("/asterisk/map-device", {
      userId,
      extension: "2002",
      sipChannel: `SIP/${"2002"}`,
      didNumber: userDid,
      callerIdName: `${"Kyle"} (Sales)`,
      isActive: true,
    });

    if (!response.data?.success) {
      throw new Error(response.data?.message || "Failed to map SIP device");
    }

    return response.data;
  };

  const openLeadScriptModal = async (lead) => {
    setSelectedLead(lead);
    setShowScriptModal(true);

    if (!scripts.length) {
      await fetchScripts();
    }
  };

  const handleDialLead = async (lead, e) => {
    e?.stopPropagation();
    await openLeadScriptModal(lead);
  };

  const handleStartCall = async () => {
    if (!selectedLead || !selectedScript) {
      showNotification("warning", "Select a lead and a script first");
      return;
    }

    const primaryPhone = extractPrimaryPhone(selectedLead?.phone);
    const cleanPhone = sanitizePhoneNumber(primaryPhone);

    if (!cleanPhone) {
      showNotification("error", "No valid phone number found");
      return;
    }

    const text = getPersonalizedScriptText();
    if (!text.trim()) {
      showNotification("error", "Script text is empty");
      return;
    }

    try {
      setCallingLeadId(selectedLead.id);

      setLiveCall({
        callId: null,
        leadId: selectedLead.id,
        phoneNumber: cleanPhone,
        status: "mapping-sip",
      });

      await ensureSipMapped();

      setLiveCall((prev) =>
        prev
          ? {
              ...prev,
              status: "starting-call",
            }
          : prev
      );

      const response = await api.post("/asterisk/call-with-tts", {
        leadId: selectedLead.id,
        phoneNumber: cleanPhone,
        agentId: userId,
        text,
      });

      if (response.data?.success) {
        setLiveCall({
          callId: response.data.callId,
          leadId: selectedLead.id,
          phoneNumber: cleanPhone,
          status: "dialing-microsip",
        });

        showNotification(
          "success",
          `Call request sent to extension ${userExtension}. MicroSIP should ring first.`
        );
      } else {
        setLiveCall(null);
        showNotification(
          "error",
          response.data?.message || "Failed to start call"
        );
      }
    } catch (error) {
      console.error("Start call error:", error);
      setLiveCall(null);
      showNotification(
        "error",
        error.response?.data?.message || error.message || "Failed to start call"
      );
    } finally {
      setCallingLeadId(null);
    }
  };

  const handleHangupCall = async () => {
    if (!liveCall?.callId) {
      showNotification("warning", "No active call");
      return;
    }

    try {
      const response = await api.post("/asterisk/hangup", {
        callId: liveCall.callId,
      });

      if (response.data?.success) {
        showNotification("success", response.data.message || "Call removed");
        setLiveCall(null);
      } else {
        showNotification(
          "error",
          response.data?.message || "Failed to hang up"
        );
      }
    } catch (error) {
      console.error("Hangup error:", error);
      setLiveCall(null);
      showNotification("warning", "Call removed from UI");
    }
  };

  const closeScriptModal = () => {
    setShowScriptModal(false);
    setSelectedScript(null);
    stopPreviewAudio();
  };

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const goToNextPage = () =>
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "New":
        return "bg-green-100 text-green-800";
      case "Contacted":
        return "bg-blue-100 text-blue-800";
      case "In Progress":
        return "bg-yellow-100 text-yellow-800";
      case "Closed":
        return "bg-gray-100 text-gray-800";
      case "Completed":
        return "bg-purple-100 text-purple-800";
      case "Incompleted":
        return "bg-red-100 text-red-800";
      case "Transferred":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
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
    }

    if (lead.status === "Incompleted" && !lead.assigned_to) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <FiThumbsDown className="h-3 w-3 mr-1" />
          Declined
        </span>
      );
    }

    if (lead.transferred_to) {
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
    const agent = availableAgents.find((a) => String(a.id) === String(agentId));
    return agent ? agent.name : `Agent ${String(agentId).substring(0, 8)}...`;
  };

  const formatLiveCallStatus = (status) => {
    switch (status) {
      case "mapping-sip":
        return "Mapping SIP device...";
      case "starting-call":
        return "Starting Asterisk call...";
      case "dialing-microsip":
        return "Dialing MicroSIP...";
      case "bridged":
        return "In call";
      default:
        return status || "";
    }
  };

  const tabs = [
    {
      id: "my-leads",
      label: "My Leads",
      icon: FiUserCheck,
      color: "indigo",
      description: "Leads currently assigned to you",
    },
    {
      id: "flagged",
      label: "Flagged",
      icon: FiFlag,
      color: "purple",
      description: "Flagged leads (still assigned to you)",
    },
    {
      id: "transferred",
      label: "Transferred to Me",
      icon: FiSend,
      color: "blue",
      description: "Leads transferred/referred to you",
    },
    {
      id: "declined",
      label: "Declined",
      icon: FiThumbsDown,
      color: "red",
      description: "Leads you declined (removed from your list)",
    },
  ];

  const PaginationControls = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700">
          Showing{" "}
          <span className="font-medium">
            {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
          </span>{" "}
          to{" "}
          <span className="font-medium">
            {Math.min(currentPage * itemsPerPage, totalItems)}
          </span>{" "}
          of <span className="font-medium">{totalItems.toLocaleString()}</span>{" "}
          leads
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
        >
          <FiChevronsLeft className="h-5 w-5" />
        </button>

        <button
          onClick={goToPreviousPage}
          disabled={currentPage === 1}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
        >
          <FiChevronRight className="h-5 w-5" />
        </button>

        <button
          onClick={goToLastPage}
          disabled={currentPage === totalPages}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiChevronsRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {notification.show && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            notification.type === "success"
              ? "bg-green-500"
              : notification.type === "error"
              ? "bg-red-500"
              : "bg-yellow-500"
          } text-white`}
        >
          {notification.message}
        </div>
      )}

      {liveCall && (
        <div className="fixed top-20 right-4 z-50 bg-white border border-indigo-200 shadow-lg rounded-xl px-4 py-3 w-80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Active Call</p>
              <p className="text-xs text-gray-500">{liveCall.phoneNumber}</p>
              <p className="text-xs text-indigo-500">
                {formatLiveCallStatus(liveCall.status)}
              </p>
            </div>

            <button
              onClick={handleHangupCall}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Hang Up
            </button>
          </div>
        </div>
      )}

      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Add Comment for {selectedLead.name}
            </h3>

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

      {showRatingModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Update Lead: {selectedLead.name}
            </h3>

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
                    <span className="text-xs text-gray-500">
                      Lead stays assigned to you
                    </span>
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
                    <span className="text-xs text-gray-500">
                      Lead removed from your list
                    </span>
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

      {showTransferModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Transfer Lead: {selectedLead.name}
              </h3>

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
              This lead will be flagged in your list and transferred to the
              selected agent.
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
                    availableAgents.map((agent) => (
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

      {showScriptModal && selectedLead && (
        <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-6xl w-full min-h-[90vh] max-h-[90vh] my-auto flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-black">
                  Scripts for {selectedLead.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Book: "{selectedLead.book_title}"
                </p>
              </div>

              <button
                onClick={closeScriptModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 flex" style={{ minHeight: 0, overflow: "hidden" }}>
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
                  <div
                    className="w-1/3 border-r border-gray-200 flex flex-col"
                    style={{ minHeight: 0, overflow: "hidden" }}
                  >
                    <div className="p-4 border-b border-gray-200 flex-shrink-0">
                      <h1 className="text-sm font-semibold text-gray-900">
                        Select Script Template
                      </h1>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {scripts.map((script) => (
                        <button
                          key={script._id}
                          onClick={() => setSelectedScript(script)}
                          className={`w-full text-left p-3 rounded-lg border transition ${
                            selectedScript?._id === script._id
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                          } ${playingScriptId === script._id ? "ring ring-green-400" : ""}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center flex-1">
                              {playingScriptId === script._id && (
                                <FiVolume2 className="h-4 w-4 text-green-600 mr-2 animate-pulse" />
                              )}

                              <h4 className="font-medium text-sm text-gray-900 flex-1">
                                {script.title}
                              </h4>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col" style={{ minHeight: 0, overflow: "hidden" }}>
                    {selectedScript ? (
                      <>
                        <div className="p-6 border-b border-gray-200 flex-shrink-0">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-xl font-semibold text-gray-900">
                              {selectedScript.title}
                            </h3>

                            <div className="flex items-center space-x-2 flex-wrap">
                              <button
                                onClick={handleStartCall}
                                disabled={
                                  !selectedLead ||
                                  !selectedScript ||
                                  callingLeadId === selectedLead?.id
                                }
                                className="flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
                              >
                                <FiPhone className="h-4 w-4 mr-1.5" />
                                {callingLeadId === selectedLead?.id
                                  ? "Calling..."
                                  : "Call Lead"}
                              </button>

                              <button
                                onClick={handlePreviewAudio}
                                disabled={generatingAudio}
                                className={`flex items-center px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                                  playingScriptId === selectedScript._id
                                    ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                                    : "text-green-600 hover:text-green-700 hover:bg-green-50"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                <FiVolume2
                                  className={`h-4 w-4 mr-1.5 ${
                                    playingScriptId === selectedScript._id ? "animate-pulse" : ""
                                  }`}
                                />
                                {generatingAudio
                                  ? "Generating..."
                                  : playingScriptId === selectedScript._id
                                  ? "Stop Preview"
                                  : "Preview"}
                              </button>

                              <button
                                onClick={handleCopyScript}
                                className="flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition"
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

                          {!userExtension && (
                            <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                              No SIP extension is set for your account. Save your real MicroSIP extension first.
                            </div>
                          )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                          <div className="prose max-w-none">
                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {getPersonalizedScriptText()}
                            </p>
                          </div>

                          {selectedScript.audioStatus === "generating" && (
                            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                              Audio is being generated...
                            </div>
                          )}

                          {selectedScript.audioStatus === "failed" && (
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
                red: "border-red-500 text-red-600",
              };

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                    setSearchQuery("");

                    if (tab.id === "transferred") {
                      fetchAvailableAgents();
                    }
                  }}
                  className={`group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm relative ${
                    isActive
                      ? colorClasses[tab.color]
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  title={tab.description}
                >
                  <Icon className="mr-2 h-5 w-5 text-current" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

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
              <button
                onClick={handleMapMySipDevice}
                className="px-3 py-2 text-sm border border-indigo-300 text-indigo-600 rounded-md hover:bg-indigo-50"
              >
                Map My SIP
              </button>

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

              <button onClick={fetchLeads} className="p-2 text-gray-400 hover:text-gray-500">
                <FiRefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <PaginationControls />
          </div>
        )}
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Book Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rating
                </th>

                {activeTab === "transferred" && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transferred By
                  </th>
                )}

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comments/Notes
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={activeTab === "transferred" ? 7 : 6}
                    className="px-6 py-4 text-center"
                  >
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab === "transferred" ? 7 : 6}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    {searchQuery ? (
                      "No leads match your search"
                    ) : activeTab === "my-leads" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiUser className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No active leads</p>
                        <p className="text-sm text-gray-400">
                          Leads assigned to you will appear here
                        </p>
                      </div>
                    ) : activeTab === "flagged" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiFlag className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No flagged leads yet</p>
                        <p className="text-sm text-gray-400">
                          When you flag leads, they will appear here
                        </p>
                      </div>
                    ) : activeTab === "transferred" ? (
                      <div className="flex flex-col items-center py-8">
                        <FiSend className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No transferred leads</p>
                        <p className="text-sm text-gray-400">
                          Leads transferred to you will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8">
                        <FiThumbsDown className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No declined leads</p>
                        <p className="text-sm text-gray-400">
                          Leads you decline will appear here
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => openLeadScriptModal(lead)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div
                          className={`flex-shrink-0 h-10 w-10 bg-gradient-to-br ${
                            lead.rating === "Flagged"
                              ? "from-purple-500 to-purple-600"
                              : lead.status === "Incompleted" && !lead.assigned_to
                              ? "from-red-500 to-red-600"
                              : lead.transferred_to
                              ? "from-blue-500 to-blue-600"
                              : "from-indigo-500 to-purple-600"
                          } rounded-full flex items-center justify-center`}
                        >
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
                            <button
                              onClick={(e) => handleDialLead(lead, e)}
                              className="text-sm text-gray-500 flex items-center hover:text-indigo-600 transition"
                              title="Open script and call"
                            >
                              <FiPhone className="mr-1 h-3 w-3" />
                              {lead.phone}
                            </button>
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
                        <div className="text-xs text-gray-400">{lead.publisher}</div>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                          lead.status
                        )}`}
                      >
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
                            {lead.transferred_at
                              ? new Date(lead.transferred_at).toLocaleDateString()
                              : "N/A"}
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
                              {lead.updated_at
                                ? new Date(lead.updated_at).toLocaleDateString()
                                : ""}
                            </p>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
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
                        <button
                          onClick={(e) => handleDialLead(lead, e)}
                          className="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-green-50"
                          title="Open script and call"
                        >
                          <FiPhone className="h-4 w-4" />
                        </button>

                        {activeTab === "my-leads" && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLead(lead);
                                setShowRatingModal(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50"
                              title="Flag or Decline lead"
                            >
                              <FiStar className="h-4 w-4" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLead(lead);
                                fetchAvailableAgents();
                                setShowTransferModal(true);
                              }}
                              className="text-cyan-600 hover:text-cyan-900 p-1 rounded-full hover:bg-cyan-50"
                              title="Transfer to another agent"
                            >
                              <FiSend className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
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

        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-4 bg-white border-t border-gray-200">
            <PaginationControls />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">My Leads</p>
              <p className="text-2xl font-semibold text-gray-900">
                {
                  leads.filter(
                    (l) =>
                      l.assigned_to &&
                      (!l.rating || l.rating !== "Flagged") &&
                      !l.transferred_to
                  ).length
                }
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
                {leads.filter((l) => l.rating === "Flagged").length}
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
                {leads.filter((l) => l.transferred_to).length}
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
                {
                  leads.filter(
                    (l) => l.status === "Incompleted" && !l.assigned_to
                  ).length
                }
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