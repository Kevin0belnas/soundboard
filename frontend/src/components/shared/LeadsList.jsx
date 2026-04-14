import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  FiBook,
  FiCopy,
  FiFlag,
  FiMail,
  FiMessageSquare,
  FiPauseCircle,
  FiPhone,
  FiPlay,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiStar,
  FiThumbsDown, 
  FiUserCheck,
  FiVolume2,
  FiX,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";

function parseScriptSections(content) {
  if (!content) return [];

  const lines = content.split("\n");
  const sections = [];
  let currentSection = null;
  let currentLines = [];

  const isSectionHeader = (line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      trimmed.length < 80 &&
      !trimmed.startsWith("•") &&
      !trimmed.startsWith("-") &&
      !/[.!?,:"]$/.test(trimmed) &&
      /^[A-Z"]/.test(trimmed) &&
      !trimmed.includes("[PAUSE]") &&
      !/^(As\s+mentioned)/i.test(trimmed)
    );
  };

  for (const line of lines) {
    if (isSectionHeader(line)) {
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentLines.join("\n").trim(),
        });
      } else if (currentLines.join("").trim().length > 0) {
        sections.push({
          title: "Intro",
          content: currentLines.join("\n").trim(),
        });
      }
      currentSection = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentLines.join("\n").trim(),
    });
  }

  if (sections.length === 0) {
    sections.push({ title: "Script", content: content.trim() });
  }

  return sections;
}

const STAGE_DIRECTION_PATTERNS = [
  /^\[PAUSE.*?\]/i,
  /^Pause\.?/i,
  /^Let them answer\.?$/i,
  /^Wait for (response|answer|reply)\.?$/i,
  /^Transition\.?$/i,
  /^Let them agree\.?$/i,
  /^Note:/i,
  /^Close$/i,
];

function cleanTextForTTS(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !STAGE_DIRECTION_PATTERNS.some((pattern) => pattern.test(t));
    })
    .join("\n")
    .trim();
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const APP_BASE = API_BASE.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function LeadsList({ scriptTypeFilter, showTransferButton }) {
  const [activeTab, setActiveTab] = useState("my-leads");
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [notification, setNotification] = useState({show: false, type: "", message: ""});

  const [selectedLead, setSelectedLead] = useState(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [selectedTargetAgent, setSelectedTargetAgent] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const [showScriptModal, setShowScriptModal] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedScript, setSelectedScript] = useState(null);
  const [scriptSections, setScriptSections] = useState([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [activeSectionTitle, setActiveSectionTitle] = useState(null);
  const [copied, setCopied] = useState(false);

  const [openerName, setOpenerName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [callManagerId, setCallManagerId] = useState("");
  const [openerAgents, setOpenerAgents] = useState([]);

  const [playingPreviewId, setPlayingPreviewId] = useState(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const audioRef = useRef(null);
  const previewCacheRef = useRef({});

  const [callingLeadId, setCallingLeadId] = useState(null);
  const [liveCall, setLiveCall] = useState(null);
  const [liveTtsQueue, setLiveTtsQueue] = useState([]);
  const [isInjectingLiveTts, setIsInjectingLiveTts] = useState(false);
  const [currentLiveItemId, setCurrentLiveItemId] = useState(null);

  const storedUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const userId =
    localStorage.getItem("userId") ||
    localStorage.getItem("_id") ||
    storedUser._id ||
    storedUser.id ||
    storedUser.userId ||
    storedUser.user ||
    "";
  const userName = localStorage.getItem("name") || storedUser.name || "User";
  const userRole = localStorage.getItem("role") || storedUser.role || "opener";
  const canCallLead = userRole === "closer" || Boolean(showTransferButton);
  const userExtension = storedUser.extension || localStorage.getItem("extension") || "";
  const userDid = storedUser.didNumber || localStorage.getItem("didNumber") || "";

  useEffect(() => {
    fetchLeads();
  }, [activeTab, currentPage, itemsPerPage, statusFilter]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredLeads(leads);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredLeads(
      leads.filter((lead) =>
        [lead.name, lead.email, lead.phone, lead.book_title, lead.author, lead.publisher, lead.comment]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      ),
    );
  }, [searchQuery, leads]);

  useEffect(() => {
    document.body.style.overflow = showScriptModal ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showScriptModal]);

  useEffect(() => {
    if (!selectedScript?.content) {
      setScriptSections([]);
      setActiveSectionIndex(0);
      return;
    }
    const sections = parseScriptSections(replaceScriptPlaceholders(selectedScript.content));
    setScriptSections(sections);
    setActiveSectionIndex(0);
    setActiveSectionTitle(null);
    stopPreview();
    previewCacheRef.current = {};
  }, [selectedScript, selectedLead, openerName, managerName, callManagerId]);

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification({ show: false, type: "", message: "" });
    }, 3000);
  };

  const resolvedManagerName = managerName || (!selectedLead?.transferred_to ? openerName : "") || "";

  const shouldRemoveOpenerPlaceholder =
    userRole === "closer" && !selectedLead?.transferred_to;

  const removeOpenerPlaceholder = (text) => {
    if (!text || !shouldRemoveOpenerPlaceholder) return text || "";
    return text.replace(/\s*\[Opener Name\]\s*/g, " ");
  };

  const replaceScriptPlaceholders = (content) => {
    const currentUserName = localStorage.getItem("name") || "User";
    return removeOpenerPlaceholder(content || "")
      .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
      .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
      .replace(/\[Your Name\]/g, currentUserName)
      .replace(/\[Manager Name\]/g, resolvedManagerName || "[Manager Name]")
      .replace(
        /\[Opener Name\]/g,
        (!selectedLead?.transferred_to
          ? openerAgents.find((a) => a.id === callManagerId)?.name
          : openerName) || "[Opener Name]",
      );
  };

  const normalizeScriptForTts = useCallback(
    (content) => cleanTextForTTS(replaceScriptPlaceholders(content || "")),
    [replaceScriptPlaceholders],
  );

  const starterSection = useMemo(() => {
    if (!selectedScript || !scriptSections.length) return null;
    return {
      _id: `${selectedScript._id}::section::0`,
      parentScriptId: selectedScript._id,
      parentScriptTitle: selectedScript.title,
      title: scriptSections[0].title || "Starter Sub-script",
      content: scriptSections[0].content,
      sectionIndex: 0,
    };
  }, [selectedScript, scriptSections]);

  const activeSection = useMemo(() => {
    if (!selectedScript || !scriptSections.length) return null;
    const idx = Math.max(0, Math.min(activeSectionIndex, scriptSections.length - 1));
    return {
      _id: `${selectedScript._id}::section::${idx}`,
      parentScriptId: selectedScript._id,
      parentScriptTitle: selectedScript.title,
      title: scriptSections[idx].title || `Sub-script ${idx + 1}`,
      content: scriptSections[idx].content,
      sectionIndex: idx,
    };
  }, [selectedScript, scriptSections, activeSectionIndex]);

  const fetchScripts = async () => {
    setLoadingScripts(true);
    try {
      const response = await api.get("/scripts");
      const raw = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      const filtered = raw.filter((s) =>
        (scriptTypeFilter || ["admin", "opener", "closer", "general"]).includes(s.type),
      );

      const sorted = [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      setScripts(sorted);
      setSelectedScript((prev) => sorted.find((s) => s._id === prev?._id) || sorted[0] || null);
    } catch (error) {
      console.error("Error fetching scripts:", error);
      setScripts([]);
      setSelectedScript(null);
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
      } else {
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
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableAgents = async () => {
    try {
      const response = await api.get("/contacts/agents/available");
      if (response.data?.success) {
        let agents = response.data.data || [];
        if (userRole === "opener") {
          agents = agents.filter((a) => a.role === "closer" && String(a.id) !== String(userId));
        } else if (userRole === "closer") {
          agents = agents.filter((a) => a.role === "opener" && String(a.id) !== String(userId));
        }
        setAvailableAgents(agents);
      }
    } catch (error) {
      console.error("Fetch agents error:", error);
    }
  };

  const extractPrimaryPhone = (phoneValue = "") =>
    String(phoneValue || "")
      .split(/[,;/|]/)[0]
      .trim();

  const sanitizePhoneNumber = (phoneValue = "") => String(phoneValue).replace(/[^\d+]/g, "");

  const ensureSipMapped = async () => {
    if (!userId) throw new Error("Missing logged-in user ID");
    const ext = userExtension || "2002";
    const response = await api.post("/asterisk/map-device", {
      userId,
      extension: ext,
      sipChannel: `SIP/${ext}`,
      didNumber: userDid,
      callerIdName: `${userName} (Sales)`,
      isActive: true,
    });

    if (!response.data?.success) {
      throw new Error(response.data?.message || "Failed to map SIP device");
    }
    return response.data;
  };

  const handleMapMySipDevice = async () => {
    try {
      await ensureSipMapped();
      showNotification("success", `SIP device mapped to extension ${userExtension || "2002"}`);
    } catch (error) {
      showNotification("error", error.message || "Failed to map SIP device");
    }
  };

  const resetLiveTtsState = () => {
    setLiveTtsQueue([]);
    setIsInjectingLiveTts(false);
    setCurrentLiveItemId(null);
  };

  const playItemIntoLiveCall = useCallback(
    async (item) => {
      if (!liveCall?.callId || !selectedLead || !item) return;
      const text = normalizeScriptForTts(item.content);
      if (!text.trim()) {
        showNotification("warning", "Selected sub-script has no playable text");
        return;
      }

      setIsInjectingLiveTts(true);
      setCurrentLiveItemId(item._id);
      try {
        const response = await api.post("/asterisk/play-tts-in-call", {
          callId: liveCall.callId,
          leadId: selectedLead.id,
          agentId: userId,
          phoneNumber: liveCall.phoneNumber,
          scriptId: item._id,
          title: item.title,
          text,
        });

        if (!response.data?.success) {
          throw new Error(response.data?.message || "Failed to inject TTS");
        }
        showNotification("success", `"${item.title}" sent to the live call`);
      } catch (error) {
        showNotification(
          "error",
          error.response?.data?.message || error.message || "Failed to play in live call",
        );
      } finally {
        setIsInjectingLiveTts(false);
        setCurrentLiveItemId(null);
      }
    },
    [liveCall, selectedLead, userId, normalizeScriptForTts],
  );

  useEffect(() => {
    if (!liveCall?.callId || !liveTtsQueue.length || isInjectingLiveTts) return;
    let cancelled = false;

    const next = liveTtsQueue[0];
    const run = async () => {
      await playItemIntoLiveCall(next);
      if (!cancelled) {
        setLiveTtsQueue((prev) => prev.slice(1));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [liveCall, liveTtsQueue, isInjectingLiveTts, playItemIntoLiveCall]);

  const handleStartCall = async () => {
    if (!selectedLead || !selectedScript || !starterSection) {
      showNotification("warning", "Select one script first");
      return;
    }

    const phone = sanitizePhoneNumber(extractPrimaryPhone(selectedLead.phone));
    if (!phone) {
      showNotification("error", "No valid phone number found");
      return;
    }

    const text = normalizeScriptForTts(starterSection.content);
    if (!text.trim()) {
      showNotification("error", "Starter sub-script is empty");
      return;
    }

    try {
      setCallingLeadId(selectedLead.id);
      setLiveCall({ callId: null, leadId: selectedLead.id, phoneNumber: phone, status: "mapping-sip" });
      resetLiveTtsState();

      await ensureSipMapped();
      setLiveCall((prev) => (prev ? { ...prev, status: "starting-call" } : prev));

      const response = await api.post("/asterisk/call-with-tts", {
        leadId: selectedLead.id,
        phoneNumber: phone,
        agentId: userId,
        scriptId: starterSection._id,
        scriptTitle: starterSection.title,
        text,
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Failed to start call");
      }

      setLiveCall({
        callId: response.data.callId,
        leadId: selectedLead.id,
        phoneNumber: phone,
        status: response.data.status || "dialing-microsip",
        starterScriptTitle: starterSection.title,
        parentScriptTitle: selectedScript.title,
      });
      showNotification("success", `Call started with starter sub-script "${starterSection.title}".`);
    } catch (error) {
      setLiveCall(null);
      resetLiveTtsState();
      showNotification("error", error.response?.data?.message || error.message || "Failed to start call");
    } finally {
      setCallingLeadId(null);
    }
  };

  const handlePlayInLiveCall = async (item = activeSection) => {
    if (!item) {
      showNotification("warning", "Select one sub-script first");
      return;
    }
    if (!liveCall?.callId) {
      showNotification("warning", "Start the lead call first");
      return;
    }
    if (isInjectingLiveTts) {
      setLiveTtsQueue((prev) => [...prev, item]);
      showNotification("success", `"${item.title}" added to queue`);
      return;
    }
    await playItemIntoLiveCall(item);
  };

  const handleHangupCall = async () => {
    if (!liveCall?.callId) return;
    try {
      await api.post("/asterisk/hangup", { callId: liveCall.callId });
      showNotification("success", "Call ended");
    } catch {
      showNotification("warning", "Call removed from UI");
    } finally {
      setLiveCall(null);
      resetLiveTtsState();
    }
  };

  const formatLiveCallStatus = (status) => {
    const map = {
      "mapping-sip": "Mapping SIP device...",
      "starting-call": "Starting call...",
      "dialing-microsip": "Dialing MicroSIP...",
      bridged: "In call",
      "dialing-lead": "Dialing lead...",
      "queued-tts": "Queued TTS",
      "playing-tts": "Playing TTS",
    };
    return map[status] || status || "";
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    setPlayingPreviewId(null);
    setGeneratingPreview(false);
  };

  const previewSection = async (section, sectionIndex) => { 
    if (!selectedScript || !section) return;

    const itemId = `${selectedScript._id}::section::${sectionIndex}`;
    if (playingPreviewId === itemId) {
      stopPreview();
      return;
    }  

    stopPreview();
    setActiveSectionIndex(sectionIndex);
    setGeneratingPreview(true);

    try {
      const cacheKey = itemId;
      let audioUrl = previewCacheRef.current[cacheKey] || null;
      if (!audioUrl) {
        const response = await api.post("/scripts/generate-audio-temp", {
          scriptId: selectedScript._id,
          sectionText: normalizeScriptForTts(section.content),
        });
        
        if (!response.data?.success) {
          throw new Error("Failed to generate preview");
        }
        audioUrl = response.data.audioUrl.startsWith("http")
          ? response.data.audioUrl
          : `${APP_BASE}${response.data.audioUrl}`;
        previewCacheRef.current[cacheKey] = audioUrl;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingPreviewId(itemId);
      audio.onended = () => stopPreview();
      await audio.play();
    } catch (error) {
      console.error("Preview error:", error);
      stopPreview();
      showNotification("error", "Failed to preview sub-script");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleCopyScript = async () => {
    if (!selectedScript) return;
    try {
      await navigator.clipboard.writeText(replaceScriptPlaceholders(selectedScript.content || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showNotification("success", "Script copied to clipboard");
    } catch {
      showNotification("error", "Failed to copy script");
    }
  };

  const handleUpdateRating = async () => {
    if (!selectedLead || !selectedRating) return;
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/rating`, {
        rating: selectedRating,
        updatedBy: userId,
      });
      if (response.data?.success) {
        setShowRatingModal(false);
        setSelectedRating("");
        showNotification("success", response.data.message || "Lead updated");
        fetchLeads();
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to update rating");
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
        setShowCommentModal(false);
        setCommentText("");
        showNotification("success", "Comment added successfully");
        fetchLeads();
      }
    } catch {
      showNotification("error", "Failed to add comment");
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
        setShowTransferModal(false);
        setSelectedTargetAgent("");
        setTransferReason("");
        showNotification("success", response.data.message || "Lead transferred");
        fetchLeads();
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to transfer lead");
    }
  };

  const closeScriptModal = () => {
    stopPreview();
    setShowScriptModal(false);
    setSelectedScript(null);
    setScriptSections([]);
    setActiveSectionIndex(0);
  };

  const openLeadScriptModal = async (lead) => {
    setSelectedLead(lead);
    setShowScriptModal(true);
    setCallManagerId("");

    const token = localStorage.getItem("token");
    const fetchName = async (id) => {
      if (!id) return "";
      try {
        const res = await fetch(`${APP_BASE}/api/users/${id}/name`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          return data.name || "";
        }
      } catch {}
      return "";
    };

    const [opener, manager] = await Promise.all([
      fetchName(lead.assigned_to),
      fetchName(lead.transferred_to),
    ]);

    setOpenerName(opener);
    setManagerName(manager);

    if (!lead.transferred_to) {
      try {
        const res = await fetch(`${APP_BASE}/api/contacts/agents/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOpenerAgents((data.data || []).filter((a) => a.role === "opener"));
        }
      } catch {}
    }

    await fetchScripts();
  };

  const getStatusColor = (status) => {
    const map = {
      New: "bg-green-100 text-green-800",
      Contacted: "bg-blue-100 text-blue-800",
      "In Progress": "bg-yellow-100 text-yellow-800",
      Completed: "bg-purple-100 text-purple-800",
      Closed: "bg-gray-100 text-gray-800",
      Incompleted: "bg-red-100 text-red-800",
      Transferred: "bg-orange-100 text-orange-800",
    };
    return map[status] || "bg-gray-100 text-gray-800";
  };

  const tabs = [
    { id: "my-leads", label: "My Leads", icon: FiUserCheck },
    { id: "flagged", label: "Flagged", icon: FiFlag },
    { id: "transferred", label: "Transferred to Me", icon: FiSend },
    { id: "declined", label: "Declined", icon: FiThumbsDown },
  ];

  return (
    <div className="space-y-6">
      {notification.show && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
            notification.type === "success"
              ? "bg-green-500"
              : notification.type === "error"
                ? "bg-red-500"
                : "bg-yellow-500"
          }`}
        >
          {notification.message}
        </div>
      )}

      {liveCall && (
        <div className="fixed top-20 right-4 z-50 bg-white border border-indigo-200 shadow-lg rounded-xl px-4 py-3 w-80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Active Call</p>
              <p className="text-xs text-gray-500">{liveCall.phoneNumber}</p>
              <p className="text-xs text-indigo-600">{formatLiveCallStatus(liveCall.status)}</p>
              {liveCall.parentScriptTitle && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Script: <span className="font-medium">{liveCall.parentScriptTitle}</span>
                </p>
              )}
              {liveCall.starterScriptTitle && (
                <p className="text-[11px] text-green-700">
                  Starter sub-script: <span className="font-medium">{liveCall.starterScriptTitle}</span>
                </p>
              )}
            </div>
            <button
              onClick={handleHangupCall}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Hang Up
            </button>
          </div>
          {(isInjectingLiveTts || liveTtsQueue.length > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
              {isInjectingLiveTts && (
                <p className="text-xs text-blue-600">Playing sub-script in call...</p>
              )}
              {liveTtsQueue.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {liveTtsQueue.map((item, idx) => (
                    <span key={`${item._id}-${idx}`} className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                      {idx + 1}. {item.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">Add Comment for {selectedLead.name}</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="w-full min-h-[120px] border border-gray-300 rounded-lg px-3 py-2"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowCommentModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleAddComment} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Add Comment</button>
            </div>
          </div>
        </div>
      )}

      {showRatingModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Update Lead: {selectedLead.name}</h3>
            <div className="space-y-3">
              {["Flagged", "Decline"].map((value) => (
                <button
                  key={value}
                  onClick={() => setSelectedRating(value)}
                  className={`w-full p-3 rounded-lg border ${selectedRating === value ? "border-indigo-500 bg-indigo-50" : "border-gray-200"}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowRatingModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleUpdateRating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Update</button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">Transfer Lead: {selectedLead.name}</h3>
            <select
              value={selectedTargetAgent}
              onChange={(e) => setSelectedTargetAgent(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            >
              <option value="">Select agent</option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
            <textarea
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              className="w-full min-h-[100px] border border-gray-300 rounded-lg px-3 py-2"
              placeholder="Transfer reason"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleTransferLead} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Transfer</button>
            </div>
          </div>
        </div>
      )}

      {showScriptModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-7xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[calc(100dvh-1.5rem)] flex flex-col">
            <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Scripts for {selectedLead.name}</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">Book: "{selectedLead.book_title}"</p>
                {selectedScript && starterSection && ( 
                  <p className="text-[11px] text-green-700 mt-1">
                    Selected script: <span className="font-medium">{selectedScript.title}</span> · Starter sub-script: <span className="font-medium">{activeSectionTitle === null ? starterSection.title : activeSectionTitle}</span>
                  </p>
                )} 
              </div>
              <button onClick={closeScriptModal} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              <div className="w-full lg:w-[280px] xl:w-[320px] border-r border-gray-200 bg-gray-50 flex flex-col">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Main Scripts</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {loadingScripts ? (
                    <div className="text-sm text-gray-500 text-center py-8">Loading...</div>
                  ) : scripts.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8">No scripts</div>
                  ) : (
                    scripts.map((script) => {
                      // activeSectionTitle = null;
                      // if (selectedScript?._id === script._id && activeSection) {
                      //   activeSectionTitle = activeSection.title;
                      // }
                      const isSelected = selectedScript?._id === script._id;
                      return (
                        <button
                          key={script._id}
                          onClick={() => setSelectedScript(script)}
                          className={`w-full text-left rounded-xl border p-4 transition ${isSelected ? "border-indigo-300 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-200"}`}
                        >
                          <div className="flex items-start gap-3">
                            <FiPlay className={`h-4 w-4 mt-1 ${isSelected ? "text-indigo-600" : "text-gray-300"}`} />
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${isSelected ? "text-indigo-700" : "text-gray-900"}`}>{script.title}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{script.type}</span>
                                {selectedScript?._id === script._id && starterSection && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                    {
                                    activeSectionTitle === null ? `${starterSection.title}` : activeSectionTitle}
                                    </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                {selectedScript ? (
                  <>
                    <div className="px-4 sm:px-5 py-4 border-b border-gray-200 bg-white">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-gray-900 truncate">{selectedScript.title}</h4>
                              {starterSection && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                  starter sub-script: {activeSectionTitle === null ? starterSection.title : activeSectionTitle}
                                </span>
                              )}
                            </div>
                            {selectedScript.author && (
                              <p className="text-xs text-gray-400 mt-1">Created by {selectedScript.author.name}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {canCallLead && (
                              <button
                                onClick={handleStartCall}
                                disabled={!selectedLead || !selectedScript || !starterSection || callingLeadId === selectedLead?.id}
                                className="inline-flex items-center px-3 py-2 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg disabled:opacity-50"
                              >
                                <FiPhone className="h-3.5 w-3.5 mr-1.5" />
                                {callingLeadId === selectedLead?.id ? "Calling..." : "Call Lead + Starter Sub-script"}
                              </button>
                            )}

                            {liveCall?.callId && (
                              <button
                                onClick={() => handlePlayInLiveCall(activeSection)}
                                className="inline-flex items-center px-3 py-2 text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg"
                              >
                                <FiSend className="h-3.5 w-3.5 mr-1.5" />
                                {isInjectingLiveTts ? "Queue Selected Sub-script" : "Play Selected Sub-script in Call"}
                              </button>
                            )}

                            <button
                              onClick={() => activeSection && previewSection({ content: activeSection.content }, activeSection.sectionIndex)}
                              className="inline-flex items-center px-3 py-2 text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg"
                            >
                              {generatingPreview ? (
                                <FiRefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <FiVolume2 className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {playingPreviewId === activeSection?._id ? "Stop Preview" : "Preview Selected Sub-script"}
                            </button>

                            <button
                              onClick={handleCopyScript}
                              className="inline-flex items-center px-3 py-2 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
                            >
                              <FiCopy className="h-3.5 w-3.5 mr-1.5" />
                              {copied ? "Copied!" : "Copy Main Script"}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Closer Flow</p>
                          <p className="text-sm text-indigo-900 mt-1">
                            Choose one main script first. When you click call, only the starter sub-script of that chosen script will play first. After that, you can choose any one sub-script below and play it in the same call.
                          </p>
                        </div>
                      </div>  
                    </div>

                    <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50 overflow-x-auto">
                      <div className="flex gap-2">
                        {scriptSections.map((section, idx) => (
                          <button
                            key={`${selectedScript._id}-${idx}`}
                            onClick={() => [setActiveSectionIndex(idx), setActiveSectionTitle(section.title || `Sub-script ${idx + 1}`)]}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${activeSectionIndex === idx ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"}`}
                          >
                            {section.title || `Sub-script ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 bg-gray-50">
                      {scriptSections.map((section, idx) => {
                        const item = {
                          _id: `${selectedScript._id}::section::${idx}`,
                          parentScriptId: selectedScript._id,
                          parentScriptTitle: selectedScript.title,
                          title: section.title || `Sub-script ${idx + 1}`,
                          content: section.content,
                          sectionIndex: idx,
                        };
                        const isActive = activeSectionIndex === idx;
                        const isPreviewing = playingPreviewId === item._id;
                        const isPlayingInCall = currentLiveItemId === item._id;
                        return (
                          <div
                            key={item._id}
                            className={`rounded-xl border overflow-hidden ${isActive ? "border-indigo-300 ring-1 ring-indigo-100 bg-white" : "border-gray-200 bg-white"}`}
                          >
                            <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${isActive ? "bg-indigo-50" : "bg-gray-50"}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-indigo-500" : "bg-gray-300"}`} />
                                <p className={`text-sm truncate ${isActive ? "font-semibold text-indigo-700" : "font-medium text-gray-800"}`}>{item.title}</p>
                                {idx === 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">starter</span>
                                )}
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => {
                                    setActiveSectionIndex(idx);
                                    previewSection(section, idx);
                                  }}
                                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg"
                                >
                                  {isPreviewing ? <FiPauseCircle className="h-3.5 w-3.5 mr-1.5" /> : <FiVolume2 className="h-3.5 w-3.5 mr-1.5" />}
                                  {isPreviewing ? "Stop Preview" : "Preview This Sub-script"}
                                </button>
                                {liveCall?.callId && (
                                  <button
                                    onClick={() => {
                                      setActiveSectionIndex(idx);
                                      handlePlayInLiveCall(item);
                                    }}
                                    className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg"
                                  >
                                    <FiSend className="h-3.5 w-3.5 mr-1.5" />
                                    {isPlayingInCall ? "Playing in Call..." : isInjectingLiveTts ? "Queue This Sub-script" : "Play This Sub-script in Call"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap max-w-4xl">
                              {section.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <FiBook className="h-10 w-10 mx-auto mb-2" />
                      <p className="text-sm">Select a script</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto px-4 sm:px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setCurrentPage(1);
                    setSearchQuery("");
                    if (tab.id === "transferred") fetchAvailableAgents();
                  }}
                  className={`inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm ${isActive ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                >
                  <Icon className="h-5 w-5 sm:mr-2" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FiSearch className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canCallLead && (
                <button onClick={handleMapMySipDevice} className="px-3 py-2 text-xs border border-indigo-300 text-indigo-600 rounded-md hover:bg-indigo-50">
                  Map My SIP
                </button>
              )}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Status</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Closed">Closed</option>
              </select>
              <button onClick={fetchLeads} className="p-2 text-gray-400 hover:text-gray-600">
                <FiRefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {!isLoading && totalItems > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              onFirst={() => setCurrentPage(1)}
              onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
              onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              onLast={() => setCurrentPage(totalPages)}
            />
          </div>
        )}
      </div>

      <div className="hidden md:block bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Contact Info", "Book Details", "Status", "Comments", "Actions"].map((head) => (
                  <th key={head} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No leads found</td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openLeadScriptModal(lead)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium">
                          {lead.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{lead.name || "No Name"}</div>
                          <div className="text-sm text-gray-500 flex items-center"><FiMail className="mr-1 h-3 w-3" />{lead.email || "No email"}</div>
                          {lead.phone && <div className="text-sm text-gray-500 flex items-center"><FiPhone className="mr-1 h-3 w-3" />{lead.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 flex items-center"><FiBook className="mr-1 h-3 w-3 text-gray-400" />{lead.book_title || "No title"}</div>
                      {lead.author && <div className="text-sm text-gray-500">by {lead.author}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                        {lead.status || "New"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{lead.comment || "No notes"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); openLeadScriptModal(lead); }} className="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-green-50" title="Open scripts"><FiPhone className="h-4 w-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowCommentModal(true); }} className="text-gray-600 hover:text-gray-900 p-1 rounded-full hover:bg-gray-50" title="Comment"><FiMessageSquare className="h-4 w-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowRatingModal(true); }} className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50" title="Flag or decline"><FiStar className="h-4 w-4" /></button>
                        {showTransferButton && (
                          <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); fetchAvailableAgents(); setShowTransferModal(true); }} className="text-cyan-600 hover:text-cyan-900 p-1 rounded-full hover:bg-cyan-50" title="Transfer"><FiSend className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
