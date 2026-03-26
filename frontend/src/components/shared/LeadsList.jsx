import { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiBook,
  FiUserCheck,
  FiSearch,
  FiRefreshCw,
  FiStar,
  FiFlag,
  FiMessageSquare,
  FiThumbsDown,
  FiX,
  FiSend,
  FiVolume2,
  FiCopy,
  FiPauseCircle,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";
import Pagination from "../../components/Pagination";

// ─────────────────────────────────────────────
// Script parsing helpers
// ─────────────────────────────────────────────

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
        sections.push({ title: currentSection, content: currentLines.join("\n").trim() });
      } else if (currentLines.join("").trim().length > 0) {
        sections.push({ title: "Intro", content: currentLines.join("\n").trim() });
      }
      currentSection = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentSection) {
    sections.push({ title: currentSection, content: currentLines.join("\n").trim() });
  }

  if (sections.length === 0) {
    sections.push({ title: "Script", content: content.trim() });
  }

  return sections;
}

const STAGE_DIRECTION_PATTERNS = [
  /^\[PAUSE.*?\]/i,
  /^Pause\.?(\s+Let them answer\.?)?(\s+Then transition\.?)?$/i,
  /^Let them answer\.?$/i,
  /^Then transition\.?$/i,
  /^Wait for (response|answer|reply)\.?$/i,
  /^Transition\.?$/i,
  /^Note:/i,
  /^Let them agree\.?$/i,
  /^Close$/i,
];

function cleanTextForTTS(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      return !STAGE_DIRECTION_PATTERNS.some((p) => p.test(t));
    })
    .join("\n")
    .trim();
}

// ─────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function LeadsList({ scriptTypeFilter, showTransferButton }) {
  // ── tabs & leads ──
  const [activeTab, setActiveTab] = useState("my-leads");
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── notification ──
  const [notification, setNotification] = useState({ show: false, type: "", message: "" });

  // ── modals ──
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

  // ── script modal ──
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [selectedScript, setSelectedScript] = useState(null);
  const [copied, setCopied] = useState(false);

  // ── audio player ──
  const [playingScriptId, setPlayingScriptId] = useState(null);
  const [pausedId, setPausedId] = useState(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const audioRef = useRef(null);
  const isPlayingRef = useRef(false);
  const currentSectionRef = useRef(0);
  const sectionBlobCache = useRef({});

  // ── script sections ──
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [completedSections, setCompletedSections] = useState([]);
  const [scriptSections, setScriptSections] = useState([]);

  // ── opener/manager resolution ──
  const [openerName, setOpenerName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [callManagerId, setCallManagerId] = useState("");
  const [openerAgents, setOpenerAgents] = useState([]);

  // ── SIP / calling (used when showTransferButton is true, i.e. opener role) ──
  const [callingLeadId, setCallingLeadId] = useState(null);
  const [liveCall, setLiveCall] = useState(null);

  // ── user info ──
  const storedUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  }, []);

  const userId =
    localStorage.getItem("userId") ||
    localStorage.getItem("_id") ||
    storedUser._id ||
    storedUser.id ||
    "";
  const userName = localStorage.getItem("name") || storedUser.name || "User";
  const userRole = localStorage.getItem("role") || storedUser.role || "opener";
  const userExtension = storedUser.extension || localStorage.getItem("extension") || "";
  const userDid = storedUser.didNumber || localStorage.getItem("didNumber") || "";

  // ── pagination ──
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState("all");

  // ─────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────

  useEffect(() => { fetchLeads(); }, [activeTab, currentPage, itemsPerPage, statusFilter]);
  useEffect(() => { filterLeadsBySearch(); }, [searchQuery, leads]);

  useEffect(() => {
    document.body.style.overflow = showScriptModal ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [showScriptModal]);

  useEffect(() => {
    if (!showScriptModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeScriptModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showScriptModal]);

  // Reparse sections when script or lead changes
  useEffect(() => {
    if (selectedScript?.content) {
      const sections = parseScriptSections(
        replaceScriptPlaceholders(selectedScript.content)
      );
      setScriptSections(sections);
      setActiveSectionIndex(0);
      setCompletedSections([]);
      sectionBlobCache.current = {};
      stopAllAudio();
    }
  }, [selectedScript, selectedLead, callManagerId, openerName, managerName]);

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  const showNotification = (type, message) => {
    setNotification({ show: true, type, message });
    setTimeout(() => setNotification({ show: false, type: "", message: "" }), 3000);
  };

  const extractPrimaryPhone = (phoneValue = "") => {
    if (!phoneValue) return "";
    return String(phoneValue).split(/[,;/|]/)[0].trim();
  };

  const sanitizePhoneNumber = (phoneValue = "") =>
    String(phoneValue).replace(/[^\d+]/g, "");

  const resolvedManagerName =
    managerName || (!selectedLead?.transferred_to ? openerName : "") || "";

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
          : openerName) || "[Opener Name]"
      );
  };

  // ─────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────

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
        (scriptTypeFilter || ["admin", "opener", "closer", "general"]).includes(s.type)
      );
      setScripts(filtered);
      setSelectedScript((prev) => {
        if (prev && filtered.find((s) => s._id === prev._id)) return prev;
        return filtered.length > 0 ? filtered[0] : null;
      });
    } catch (error) {
      console.error("Error fetching scripts:", error);
      setScripts([]);
      setSelectedScript(null);
    } finally {
      setLoadingScripts(false);
    }
  };

  const fetchLeads = async () => {
    if (!userId) { setLeads([]); setFilteredLeads([]); return; }
    setIsLoading(true);
    try {
      let endpoint = "";
      if (activeTab === "my-leads")
        endpoint = `/contacts/assigned-to/${userId}/my-leads/page/${currentPage}/limit/${itemsPerPage}`;
      else if (activeTab === "flagged")
        endpoint = `/contacts/assigned-to/${userId}/flagged/page/${currentPage}/limit/${itemsPerPage}`;
      else if (activeTab === "declined")
        endpoint = `/contacts/assigned-to/${userId}/declined/page/${currentPage}/limit/${itemsPerPage}`;
      else if (activeTab === "transferred")
        endpoint = `/contacts/transferred-to/${userId}/page/${currentPage}/limit/${itemsPerPage}`;

      if (statusFilter !== "all") endpoint += `?status=${encodeURIComponent(statusFilter)}`;

      const response = await api.get(endpoint);
      if (response.data?.success) {
        const data = response.data.data || [];
        setLeads(data);
        setFilteredLeads(data);
        setTotalPages(response.data.pagination?.pages || 1);
        setTotalItems(response.data.pagination?.total || 0);
      } else {
        setLeads([]); setFilteredLeads([]); setTotalPages(1); setTotalItems(0);
      }
    } catch {
      setLeads([]); setFilteredLeads([]); setTotalPages(1); setTotalItems(0);
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
        if (userRole === "opener")
          agents = agents.filter((a) => a.role === "closer" && String(a.id) !== String(userId));
        else if (userRole === "closer")
          agents = agents.filter((a) => a.role === "opener" && String(a.id) !== String(userId));
        setAvailableAgents(agents);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    } finally {
      setLoadingAgents(false);
    }
  };

  const filterLeadsBySearch = () => {
    if (!searchQuery.trim()) { setFilteredLeads(leads); return; }
    const q = searchQuery.toLowerCase();
    setFilteredLeads(leads.filter((l) =>
      l.name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.toLowerCase().includes(q) ||
      l.book_title?.toLowerCase().includes(q) ||
      l.publisher?.toLowerCase().includes(q) ||
      l.author?.toLowerCase().includes(q) ||
      l.comment?.toLowerCase().includes(q)
    ));
  };

  // ─────────────────────────────────────────────
  // Lead actions
  // ─────────────────────────────────────────────

  const handleUpdateRating = async () => {
    if (!selectedLead || !selectedRating) return;
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/rating`, {
        rating: selectedRating, updatedBy: userId,
      });
      if (response.data?.success) {
        showNotification("success", response.data.message || "Lead updated");
        setShowRatingModal(false); setSelectedRating(""); fetchLeads();
        if (selectedRating === "Decline")
          window.dispatchEvent(new CustomEvent("refreshContacts"));
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to update rating");
    }
  };

  const handleTransferLead = async () => {
    if (!selectedLead || !selectedTargetAgent || !transferReason.trim()) {
      showNotification("warning", "Please select an agent and provide a reason"); return;
    }
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/transfer`, {
        targetAgentId: selectedTargetAgent, reason: transferReason, transferredBy: userId,
      });
      if (response.data?.success) {
        showNotification("success", response.data.message || "Lead transferred");
        setShowTransferModal(false); setSelectedTargetAgent(""); setTransferReason(""); fetchLeads();
      }
    } catch (error) {
      showNotification("error", error.response?.data?.message || "Failed to transfer lead");
    }
  };

  const handleAddComment = async () => {
    if (!selectedLead || !commentText.trim()) return;
    try {
      const response = await api.post(`/contacts/${selectedLead.id}/comment`, {
        comment: commentText, commentedBy: userId, userName,
      });
      if (response.data?.success) {
        showNotification("success", "Comment added successfully");
        setShowCommentModal(false); setCommentText(""); fetchLeads();
      }
    } catch {
      showNotification("error", "Failed to add comment");
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(replaceScriptPlaceholders(selectedScript.content));
      setCopied(true);
      showNotification("success", "Script copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showNotification("error", "Failed to copy script");
    }
  };

  // ─────────────────────────────────────────────
  // SIP / Asterisk calling
  // ─────────────────────────────────────────────

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
    if (!response.data?.success)
      throw new Error(response.data?.message || "Failed to map SIP device");
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

  const handleStartCall = async () => {
    if (!selectedLead || !selectedScript) {
      showNotification("warning", "Select a lead and a script first"); return;
    }
    const phone = sanitizePhoneNumber(extractPrimaryPhone(selectedLead?.phone));
    if (!phone) { showNotification("error", "No valid phone number found"); return; }

    const text = replaceScriptPlaceholders(selectedScript.content);
    if (!text.trim()) { showNotification("error", "Script text is empty"); return; }

    try {
      setCallingLeadId(selectedLead.id);
      setLiveCall({ callId: null, leadId: selectedLead.id, phoneNumber: phone, status: "mapping-sip" });
      await ensureSipMapped();
      setLiveCall((prev) => prev ? { ...prev, status: "starting-call" } : prev);

      const response = await api.post("/asterisk/call-with-tts", {
        leadId: selectedLead.id, phoneNumber: phone, agentId: userId, text,
      });

      if (response.data?.success) {
        setLiveCall({ callId: response.data.callId, leadId: selectedLead.id, phoneNumber: phone, status: "dialing-microsip" });
        showNotification("success", "Call request sent. MicroSIP should ring first.");
      } else {
        setLiveCall(null);
        showNotification("error", response.data?.message || "Failed to start call");
      }
    } catch (error) {
      setLiveCall(null);
      showNotification("error", error.response?.data?.message || error.message || "Failed to start call");
    } finally {
      setCallingLeadId(null);
    }
  };

  const handleHangupCall = async () => {
    if (!liveCall?.callId) { showNotification("warning", "No active call"); return; }
    try {
      await api.post("/asterisk/hangup", { callId: liveCall.callId });
      showNotification("success", "Call ended");
    } catch {
      showNotification("warning", "Call removed from UI");
    } finally {
      setLiveCall(null);
    }
  };

  const formatLiveCallStatus = (status) => {
    const map = {
      "mapping-sip": "Mapping SIP device...",
      "starting-call": "Starting call...",
      "dialing-microsip": "Dialing MicroSIP...",
      "bridged": "In call",
    };
    return map[status] || status || "";
  };

  // ─────────────────────────────────────────────
  // Audio player
  // ─────────────────────────────────────────────

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    isPlayingRef.current = false;
    setPlayingScriptId(null);
    setPausedId(null);
    setGeneratingAudio(false);
  };

  const handlePauseAudio = () => {
    if (audioRef.current && isPlayingRef.current) {
      audioRef.current.pause();
      isPlayingRef.current = false;
      setPlayingScriptId(null);
      setPausedId(selectedScript._id);
    }
  };

  const handleResumeAudio = () => {
    if (audioRef.current && pausedId === selectedScript._id) {
      audioRef.current.play();
      isPlayingRef.current = true;
      setPlayingScriptId(selectedScript._id);
      setPausedId(null);
    } else {
      setPausedId(null);
      isPlayingRef.current = true;
      setPlayingScriptId(selectedScript._id);
      playSectionAudio(currentSectionRef.current);
    }
  };

  const playSectionAudio = async (sectionIdx) => {
    if (!selectedScript || !isPlayingRef.current) return;

    const section = scriptSections[sectionIdx];
    if (!section) { stopAllAudio(); return; }

    // Skip already completed sections
    if (completedSections.includes(sectionIdx)) {
      currentSectionRef.current = sectionIdx + 1;
      playSectionAudio(sectionIdx + 1);
      return;
    }

    setActiveSectionIndex(sectionIdx);
    currentSectionRef.current = sectionIdx;
    document.getElementById(`section-${sectionIdx}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const cacheKey = `${selectedScript._id}_${sectionIdx}`;
    let audioUrl = sectionBlobCache.current[cacheKey] || null;

    if (!audioUrl) {
      setGeneratingAudio(true);

      // Build cleaned, resolved text for this section
      const resolvedText = removeOpenerPlaceholder(cleanTextForTTS(section.content))
        .replace(/\[Author Name\]/g, selectedLead?.name || "Author")
        .replace(/\[Book Title\]/g, selectedLead?.book_title || "Book")
        .replace(/\[Your Name\]/g, localStorage.getItem("name") || "User")
        .replace(/\[Manager Name\]/g, resolvedManagerName || "")
        .replace(
          /\[Opener Name\]/g,
          (!selectedLead?.transferred_to
            ? openerAgents.find((a) => a.id === callManagerId)?.name
            : openerName) || ""
        );

      if (!resolvedText.trim()) {
        setGeneratingAudio(false);
        setCompletedSections((prev) => [...prev, sectionIdx]);
        currentSectionRef.current = sectionIdx + 1;
        playSectionAudio(sectionIdx + 1);
        return;
      }

      try {
        const response = await api.post("/scripts/generate-audio-temp", {
          scriptId: selectedScript._id,
          sectionText: resolvedText,
        });

        if (!isPlayingRef.current) return;

        if (!response.data?.success) {
          showNotification("error", "Failed to generate section audio");
          stopAllAudio(); return;
        }

        audioUrl = response.data.audioUrl.startsWith("http")
          ? response.data.audioUrl
          : `${APP_BASE}${response.data.audioUrl}`;
        sectionBlobCache.current[cacheKey] = audioUrl;
      } catch (err) {
        console.error("Section audio error:", err);
        showNotification("error", "Audio generation failed");
        stopAllAudio(); return;
      } finally {
        setGeneratingAudio(false);
      }
    }

    if (!isPlayingRef.current) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.play().catch((err) => {
      console.error("Play error:", err);
      stopAllAudio();
    });

    audio.onended = () => {
      if (!isPlayingRef.current) return;

      setCompletedSections((prev) => [...prev, sectionIdx]);

      const nextIdx = sectionIdx + 1;
      if (!scriptSections[nextIdx]) { stopAllAudio(); return; }

      const hasPause =
        section.content.includes("[PAUSE]") ||
        /Pause\.\s*Let them answer/i.test(section.content);

      if (hasPause) {
        isPlayingRef.current = false;
        setPlayingScriptId(null);
        setActiveSectionIndex(nextIdx);
        currentSectionRef.current = nextIdx;
      } else {
        currentSectionRef.current = nextIdx;
        playSectionAudio(nextIdx);
      }
    };
  };

  const handlePlayAudio = async () => {
    if (!selectedScript) return;

    if (isPlayingRef.current) { stopAllAudio(); return; }
    if (pausedId === selectedScript._id) { handleResumeAudio(); return; }

    // Fresh start from active section
    const startSection = Math.max(0, Math.min(activeSectionIndex, scriptSections.length - 1));
    isPlayingRef.current = true;
    setPlayingScriptId(selectedScript._id);
    setPausedId(null);
    currentSectionRef.current = startSection;
    setActiveSectionIndex(startSection);
    setCompletedSections((prev) => prev.filter((idx) => idx !== startSection));
    playSectionAudio(startSection);
  };

  // ─────────────────────────────────────────────
  // Modal helpers
  // ─────────────────────────────────────────────

  const closeScriptModal = () => {
    stopAllAudio();
    setShowScriptModal(false);
    setSelectedScript(null);
    setActiveSectionIndex(0);
    setCompletedSections([]);
    setScriptSections([]);
  };

  const openLeadScriptModal = async (lead) => {
    setSelectedLead(lead);
    setShowScriptModal(true);

    // Fetch names in parallel
    const token = localStorage.getItem("token");
    const fetchName = async (id) => {
      if (!id) return "";
      try {
        const res = await fetch(`${APP_BASE}/api/users/${id}/name`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) { const d = await res.json(); return d.name || ""; }
      } catch {}
      return "";
    };

    const [opener, manager] = await Promise.all([
      fetchName(lead.assigned_to),
      fetchName(lead.transferred_to),
    ]);
    setOpenerName(opener);
    setManagerName(manager);
    setCallManagerId("");

    if (!lead.transferred_to) {
      try {
        const res = await fetch(`${APP_BASE}/api/contacts/agents/available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const d = await res.json();
          setOpenerAgents((d.data || []).filter((a) => a.role === "opener"));
        }
      } catch {}
    }

    await fetchScripts();
  };

  // ─────────────────────────────────────────────
  // UI helpers
  // ─────────────────────────────────────────────

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const handleItemsPerPageChange = (e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); };

  const getStatusColor = (status) => {
    const map = {
      New: "bg-green-100 text-green-800",
      Contacted: "bg-blue-100 text-blue-800",
      "In Progress": "bg-yellow-100 text-yellow-800",
      Closed: "bg-gray-100 text-gray-800",
      Completed: "bg-purple-100 text-purple-800",
      Incompleted: "bg-red-100 text-red-800",
      Transferred: "bg-orange-100 text-orange-800",
    };
    return map[status] || "bg-gray-100 text-gray-800";
  };

  const getRatingDisplay = (lead) => {
    if (lead.rating === "Flagged")
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
          <FiFlag className="h-3 w-3 mr-1" /> Flagged
        </span>
      );
    if (lead.status === "Incompleted" && !lead.assigned_to)
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <FiThumbsDown className="h-3 w-3 mr-1" /> Declined
        </span>
      );
    if (lead.transferred_to)
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          <FiSend className="h-3 w-3 mr-1" /> Transferred
        </span>
      );
    return null;
  };

  const getTransferredToName = (agentId) => {
    if (!agentId) return "Unknown";
    const agent = availableAgents.find((a) => String(a.id) === String(agentId));
    return agent ? agent.name : `Agent ${String(agentId).substring(0, 8)}...`;
  };

  const tabs = [
    { id: "my-leads", label: "My Leads", icon: FiUserCheck, color: "indigo", description: "Leads currently assigned to you" },
    { id: "flagged", label: "Flagged", icon: FiFlag, color: "purple", description: "Flagged leads" },
    { id: "transferred", label: "Transferred to Me", icon: FiSend, color: "blue", description: "Leads transferred to you" },
    { id: "declined", label: "Declined", icon: FiThumbsDown, color: "red", description: "Leads you declined" },
  ];

  const PaginationControls = () => (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-700">
          Showing{" "}
          <span className="font-medium">{totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>
          {" "}to{" "}
          <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
          {" "}of{" "}
          <span className="font-medium">{totalItems.toLocaleString()}</span> leads
        </span>
        <select value={itemsPerPage} onChange={handleItemsPerPageChange}
          className="ml-4 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>
      <div className="flex items-center space-x-1">
        <button onClick={goToFirstPage} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50">
          <FiChevronsLeft className="h-4 w-4" />
        </button>
        <button onClick={goToPreviousPage} disabled={currentPage === 1} className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50">
          <FiChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-gray-700 px-2">Page {currentPage} of {totalPages}</span>
        <button onClick={goToNextPage} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50">
          <FiChevronRight className="h-4 w-4" />
        </button>
        <button onClick={goToLastPage} disabled={currentPage === totalPages} className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50">
          <FiChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
          notification.type === "success" ? "bg-green-500" :
          notification.type === "error" ? "bg-red-500" : "bg-yellow-500"
        }`}>
          {notification.message}
        </div>
      )}

      {/* Live call banner */}
      {liveCall && (
        <div className="fixed top-20 right-4 z-50 bg-white border border-indigo-200 shadow-lg rounded-xl px-4 py-3 w-80">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Active Call</p>
              <p className="text-xs text-gray-500">{liveCall.phoneNumber}</p>
              <p className="text-xs text-indigo-500">{formatLiveCallStatus(liveCall.status)}</p>
            </div>
            <button onClick={handleHangupCall} className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
              Hang Up
            </button>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Comment for {selectedLead.name}</h3>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder="Enter your comment or note..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px]"
              autoFocus />
            <div className="flex justify-end space-x-3 mt-4">
              <button onClick={() => { setShowCommentModal(false); setCommentText(""); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleAddComment} disabled={!commentText.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Add Comment</button>
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
              {[
                { val: "Flagged", icon: FiFlag, color: "purple", label: "Flagged", sub: "Lead stays assigned to you" },
                { val: "Decline", icon: FiThumbsDown, color: "red", label: "Decline", sub: "Lead removed from your list" },
              ].map(({ val, icon: Icon, color, label, sub }) => (
                <button key={val} onClick={() => setSelectedRating(val)}
                  className={`w-full p-3 rounded-lg border-2 transition ${selectedRating === val ? `border-${color}-500 bg-${color}-50` : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center">
                    <Icon className={`h-5 w-5 text-${color}-500 mr-2`} />
                    <div className="text-left">
                      <span className="font-medium block">{label}</span>
                      <span className="text-xs text-gray-500">{sub}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => { setShowRatingModal(false); setSelectedRating(""); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleUpdateRating} disabled={!selectedRating} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Update</button>
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
              <button onClick={() => { setShowTransferModal(false); setSelectedTargetAgent(""); setTransferReason(""); }} className="text-gray-400 hover:text-gray-600">
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">This lead will be flagged and transferred to the selected agent.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Agent</label>
                <select value={selectedTargetAgent} onChange={(e) => setSelectedTargetAgent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select an agent...</option>
                  {loadingAgents ? <option disabled>Loading...</option> :
                    availableAgents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role}) - {a.email}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Reason</label>
                <textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Enter reason for transfer..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]" />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => { setShowTransferModal(false); setSelectedTargetAgent(""); setTransferReason(""); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleTransferLead} disabled={!selectedTargetAgent || !transferReason.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center">
                <FiSend className="mr-2 h-4 w-4" /> Transfer & Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Script Modal ── */}
      {showScriptModal && selectedLead && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          role="dialog" aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeScriptModal(); }}
        >
          <div className="relative h-full w-full p-3 sm:p-6 flex items-center justify-center">
            <div className="bg-white w-full max-w-6xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">

              {/* Modal header */}
              <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">Scripts for {selectedLead.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">Book: "{selectedLead.book_title}"</p>
                  
                </div>
                <button onClick={closeScriptModal}
                  className="shrink-0 inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

                {/* Left: script list (desktop) */}
                <div className="hidden lg:flex lg:w-[240px] border-r border-gray-200 flex-col flex-shrink-0 bg-gray-50">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Templates</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {loadingScripts ? (
                      <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
                    ) : scripts.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No scripts</p>
                    ) : (
                      scripts.map((script) => (
                        <button key={script._id} onClick={() => setSelectedScript(script)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                            selectedScript?._id === script._id
                              ? "border-indigo-300 bg-indigo-50"
                              : "border-transparent hover:bg-white hover:border-gray-200"
                          }`}>
                          <div className="flex items-center gap-2">
                            {playingScriptId === script._id && (
                              <FiVolume2 className="h-3.5 w-3.5 text-green-600 animate-pulse flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${selectedScript?._id === script._id ? "text-indigo-700" : "text-gray-900"}`}>
                                {script.title}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">{script.type}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Mobile script selector */}
                <div className="lg:hidden border-b border-gray-200 p-3 flex-shrink-0">
                  <select value={selectedScript?._id || ""} onChange={(e) => {
                    const next = scripts.find((s) => s._id === e.target.value);
                    if (next) setSelectedScript(next);
                  }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {scripts.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
                  </select>
                </div>

                {/* Right: script content */}
                {selectedScript ? (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

                    {/* Script topbar */}
                    <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-shrink-0">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{selectedScript.title}</h4>
                        {selectedScript.author && (
                          <p className="text-xs text-gray-400 mt-0.5">Created by {selectedScript.author.name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {/* Call button — only shown when showTransferButton prop is true (opener) */}
                        {showTransferButton && (
                          <button onClick={handleStartCall}
                            disabled={!selectedLead || !selectedScript || callingLeadId === selectedLead?.id}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition disabled:opacity-50">
                            <FiPhone className="h-3.5 w-3.5 mr-1.5" />
                            {callingLeadId === selectedLead?.id ? "Calling..." : "Call Lead"}
                          </button>
                        )}

                        {/* Play / Stop / Resume */}
                        <button onClick={handlePlayAudio} disabled={generatingAudio}
                          className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                            playingScriptId === selectedScript._id
                              ? "text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
                              : "text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
                          }`}>
                          <FiVolume2 className={`h-3.5 w-3.5 mr-1.5 ${playingScriptId === selectedScript._id ? "animate-pulse" : ""}`} />
                          {generatingAudio ? "Generating..." :
                            playingScriptId === selectedScript._id ? "Stop" :
                            pausedId === selectedScript._id ? "Resume" : "Play"}
                        </button>

                        {/* Pause — only shown while playing */}
                        {playingScriptId === selectedScript._id && (
                          <button onClick={handlePauseAudio}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg transition">
                            <FiPauseCircle className="h-3.5 w-3.5 mr-1.5" /> Pause
                          </button>
                        )}

                        <button onClick={handleCopyScript}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition">
                          <FiCopy className="h-3.5 w-3.5 mr-1.5" />
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>

                    {/* Section nav pills */}
                    {scriptSections.length > 1 && (
                      <div className="px-4 sm:px-5 py-2.5 border-b border-gray-200 flex gap-2 flex-wrap flex-shrink-0 bg-gray-50">
                        {scriptSections.map((sec, idx) => (
                          <button key={idx}
                            onClick={() => {
                              setActiveSectionIndex(idx);
                              currentSectionRef.current = idx;
                              document.getElementById(`section-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition whitespace-nowrap ${
                              completedSections.includes(idx)
                                ? "bg-gray-100 text-gray-400 border-gray-200 line-through"
                                : activeSectionIndex === idx
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-300 hover:text-indigo-600"
                            }`}>
                            {sec.title.length > 22 ? sec.title.slice(0, 22) + "…" : sec.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Section blocks */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
                      {scriptSections.length > 0 ? (
                        scriptSections.map((sec, idx) => (
                          <div key={idx} id={`section-${idx}`}
                            className={`rounded-xl border transition-all overflow-hidden ${
                              completedSections.includes(idx) ? "opacity-40 border-gray-200" :
                              activeSectionIndex === idx ? "border-indigo-300 ring-1 ring-indigo-100" :
                              "border-gray-200"
                            }`}>

                            {/* Section header row */}
                            <div
                              className={`px-4 py-2.5 flex items-center justify-between cursor-pointer select-none ${
                                completedSections.includes(idx) ? "bg-gray-50" :
                                activeSectionIndex === idx ? "bg-indigo-50" :
                                "bg-gray-50 hover:bg-gray-100"
                              }`}
                              onClick={() => { setActiveSectionIndex(idx); currentSectionRef.current = idx; }}>
                              <div className="flex items-center gap-2 min-w-0">
                                {completedSections.includes(idx) ? (
                                  <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="2,7 6,11 12,3" />
                                  </svg>
                                ) : activeSectionIndex === idx && playingScriptId === selectedScript._id ? (
                                  <FiVolume2 className="h-3.5 w-3.5 text-indigo-500 animate-pulse flex-shrink-0" />
                                ) : (
                                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${activeSectionIndex === idx ? "bg-indigo-500" : "bg-gray-300"}`} />
                                )}
                                <span className={`text-xs font-semibold truncate ${
                                  completedSections.includes(idx) ? "text-gray-400 line-through" :
                                  activeSectionIndex === idx ? "text-indigo-700" : "text-gray-700"
                                }`}>
                                  {sec.title}
                                </span>
                                {activeSectionIndex === idx && !completedSections.includes(idx) && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium flex-shrink-0">
                                    {playingScriptId === selectedScript._id ? "playing" : "active"}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCompletedSections((prev) =>
                                    prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                                  );
                                  if (!completedSections.includes(idx)) {
                                    const next = scriptSections.findIndex((_, i) => i > idx && !completedSections.includes(i));
                                    if (next !== -1) setActiveSectionIndex(next);
                                  }
                                }}
                                className={`text-xs px-2 py-0.5 rounded border flex-shrink-0 ml-2 transition ${
                                  completedSections.includes(idx)
                                    ? "border-gray-300 text-gray-500 hover:bg-gray-100"
                                    : "border-green-300 text-green-700 hover:bg-green-50"
                                }`}>
                                {completedSections.includes(idx) ? "Undo" : "Done"}
                              </button>
                            </div>

                            {/* Section body */}
                            {!completedSections.includes(idx) && (
                              <div className="px-4 py-3 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                                {sec.content}
                              </div>
                            )}

                            {/* Pause bar */}
                            {(sec.content.includes("[PAUSE]") || /Pause\.\s*Let them answer/i.test(sec.content)) &&
                              !completedSections.includes(idx) && (
                              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
                                <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                                  Pause — let client respond
                                </span>
                                <button
                                  onClick={() => {
                                    setCompletedSections((prev) => [...prev, idx]);
                                    const next = scriptSections.findIndex((_, i) => i > idx && !completedSections.includes(i));
                                    if (next !== -1) {
                                      setActiveSectionIndex(next);
                                      isPlayingRef.current = true;
                                      setPlayingScriptId(selectedScript._id);
                                      currentSectionRef.current = next;
                                      playSectionAudio(next);
                                    }
                                  }}
                                  className="text-xs px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium">
                                  Continue ▶
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {replaceScriptPlaceholders(selectedScript.content)}
                        </p>
                      )}

                      {selectedScript.audioStatus === "generating" && (
                        <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">Audio is being generated...</div>
                      )}
                      {selectedScript.audioStatus === "failed" && (
                        <div className="p-4 bg-red-50 rounded-lg text-sm text-red-700">
                          Audio generation failed: {selectedScript.audioError}
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    {scriptSections.length > 1 && (
                      <div className="px-4 sm:px-5 py-2.5 border-t border-gray-200 bg-gray-50 flex items-center gap-3 flex-shrink-0">
                        <div className="flex gap-1.5 items-center">
                          {scriptSections.map((_, idx) => (
                            <div key={idx} className={`h-1.5 rounded-full transition-all ${
                              completedSections.includes(idx) ? "w-4 bg-green-400" :
                              activeSectionIndex === idx ? "w-4 bg-indigo-500" : "w-1.5 bg-gray-300"
                            }`} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 ml-auto">
                          {completedSections.length} of {scriptSections.length} sections done
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <FiBook className="h-10 w-10 mx-auto mb-2" />
                      <p className="text-sm">Select a script to view</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs + search ── */}
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
                <button key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setCurrentPage(1); setSearchQuery(""); if (tab.id === "transferred") fetchAvailableAgents(); }}
                  className={`group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm ${
                    isActive ? colorClasses[tab.color] : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                  title={tab.description}>
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
              <input type="text" placeholder="Search leads..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="flex items-center space-x-3">
              {/* Map SIP button — only for opener */}
              {showTransferButton && (
                <button onClick={handleMapMySipDevice}
                  className="px-3 py-2 text-sm border border-indigo-300 text-indigo-600 rounded-md hover:bg-indigo-50">
                  Map My SIP
                </button>
              )}
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
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

      {/* ── Leads table ── */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Contact Info", "Book Details", "Status", "Rating",
                  ...(activeTab === "transferred" ? ["Transferred By"] : []),
                  "Comments/Notes", "Actions"
                ].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={activeTab === "transferred" ? 7 : 6} className="px-6 py-8 text-center">
                  <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
                </td></tr>
              ) : filteredLeads.length === 0 ? (
                <tr><td colSpan={activeTab === "transferred" ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
                  {searchQuery ? "No leads match your search" : (
                    <div className="flex flex-col items-center py-8">
                      {activeTab === "my-leads" && <><FiUser className="h-12 w-12 text-gray-300 mb-3" /><p className="font-medium">No active leads</p><p className="text-sm text-gray-400">Leads assigned to you will appear here</p></>}
                      {activeTab === "flagged" && <><FiFlag className="h-12 w-12 text-gray-300 mb-3" /><p className="font-medium">No flagged leads yet</p></>}
                      {activeTab === "transferred" && <><FiSend className="h-12 w-12 text-gray-300 mb-3" /><p className="font-medium">No transferred leads</p></>}
                      {activeTab === "declined" && <><FiThumbsDown className="h-12 w-12 text-gray-300 mb-3" /><p className="font-medium">No declined leads</p></>}
                    </div>
                  )}
                </td></tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} onClick={() => openLeadScriptModal(lead)} className="hover:bg-gray-50 cursor-pointer">

                    {/* Contact Info */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-br ${
                          lead.rating === "Flagged" ? "from-purple-500 to-purple-600" :
                          lead.status === "Incompleted" && !lead.assigned_to ? "from-red-500 to-red-600" :
                          lead.transferred_to ? "from-blue-500 to-blue-600" : "from-indigo-500 to-purple-600"
                        }`}>
                          <span className="text-white font-medium text-sm">{lead.name?.charAt(0).toUpperCase() || "?"}</span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{lead.name || "No Name"}</div>
                          <div className="text-sm text-gray-500 flex items-center"><FiMail className="mr-1 h-3 w-3" />{lead.email || "No email"}</div>
                          {lead.phone && (
                            <button onClick={(e) => { e.stopPropagation(); openLeadScriptModal(lead); }}
                              className="text-sm text-gray-500 flex items-center hover:text-indigo-600 transition">
                              <FiPhone className="mr-1 h-3 w-3" />{lead.phone}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Book Details */}
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 flex items-center"><FiBook className="mr-1 h-3 w-3 text-gray-400" />{lead.book_title || "No title"}</div>
                      {lead.author && <div className="text-sm text-gray-500">by {lead.author}</div>}
                      {lead.publisher && <div className="text-xs text-gray-400">{lead.publisher}</div>}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                        {lead.status || "New"}
                      </span>
                    </td>

                    {/* Rating */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getRatingDisplay(lead)}
                      {lead.transferred_to && activeTab !== "transferred" && (
                        <span className="ml-2 text-xs text-gray-500">→ {getTransferredToName(lead.transferred_to)}</span>
                      )}
                    </td>

                    {/* Transferred By */}
                    {activeTab === "transferred" && (
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400">
                        {lead.transferred_at ? new Date(lead.transferred_at).toLocaleDateString() : "N/A"}
                      </td>
                    )}

                    {/* Comments */}
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        {lead.comment ? (
                          <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded-lg">
                            <p className="line-clamp-2">{lead.comment}</p>
                            <p className="text-xs text-gray-400 mt-1">{lead.updated_at ? new Date(lead.updated_at).toLocaleDateString() : ""}</p>
                          </div>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowCommentModal(true); }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center">
                            <FiMessageSquare className="mr-1 h-3 w-3" /> Add note
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button onClick={(e) => { e.stopPropagation(); openLeadScriptModal(lead); }}
                          className="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-green-50" title="Open script">
                          <FiPhone className="h-4 w-4" />
                        </button>
                        {activeTab === "my-leads" && (
                          <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowRatingModal(true); }}
                            className="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50" title="Flag or Decline">
                            <FiStar className="h-4 w-4" />
                          </button>
                        )}
                        {activeTab === "my-leads" && showTransferButton && (
                          <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); fetchAvailableAgents(); setShowTransferModal(true); }}
                            className="text-cyan-600 hover:text-cyan-900 p-1 rounded-full hover:bg-cyan-50" title="Transfer">
                            <FiSend className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); setShowCommentModal(true); }}
                          className="text-gray-600 hover:text-gray-900 p-1 rounded-full hover:bg-gray-50" title="Add comment">
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
          <div className="px-6 py-4 bg-white border-t border-gray-200"><PaginationControls /></div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "My Leads", value: leads.filter((l) => l.assigned_to && (!l.rating || l.rating !== "Flagged") && !l.transferred_to).length, color: "indigo", icon: FiUser },
          { label: "Flagged", value: leads.filter((l) => l.rating === "Flagged").length, color: "purple", icon: FiFlag, sub: "Still assigned to you" },
          { label: "Transferred", value: leads.filter((l) => l.transferred_to).length, color: "blue", icon: FiSend, sub: "Sent to other agents" },
          { label: "Declined", value: leads.filter((l) => l.status === "Incompleted" && !l.assigned_to).length, color: "red", icon: FiThumbsDown, sub: "Removed from your list" },
        ].map(({ label, value, color, icon: Icon, sub }) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-2xl font-semibold text-${color}-600`}>{value}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
              </div>
              <div className={`p-3 bg-${color}-100 rounded-lg`}>
                <Icon className={`h-6 w-6 text-${color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}