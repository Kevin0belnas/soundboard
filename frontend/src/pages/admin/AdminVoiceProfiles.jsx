import { useEffect, useRef, useState } from "react";
import {
  FiMic,
  FiCheckCircle,
  FiAlertCircle,
  FiClock,
  FiPlay,
  FiPause,
  FiTrash2,
  FiRefreshCw,
  FiUser,
  FiVolume2,
  FiXCircle,
} from "react-icons/fi";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const APP_BASE = API_BASE.replace(/\/api\/?$/, "");

const STATUS_CONFIG = {
  none: {
    label: "No sample",
    color: "text-gray-500",
    bg: "bg-gray-100",
    icon: FiUser,
  },
  pending_review: {
    label: "Pending review",
    color: "text-amber-600",
    bg: "bg-amber-50",
    icon: FiClock,
  },
  cloning: {
    label: "Cloning...",
    color: "text-blue-600",
    bg: "bg-blue-50",
    icon: FiRefreshCw,
  },
  cloned: {
    label: "Voice ready",
    color: "text-green-600",
    bg: "bg-green-50",
    icon: FiCheckCircle,
  },
  rejected: {
    label: "Rejected",
    color: "text-orange-600",
    bg: "bg-orange-50",
    icon: FiXCircle,
  },
  failed: {
    label: "Clone failed",
    color: "text-red-600",
    bg: "bg-red-50",
    icon: FiAlertCircle,
  },
};

export default function AdminVoiceProfiles() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [notification, setNotification] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [playingId, setPlayingId] = useState(null);
  const [playingType, setPlayingType] = useState(null); // "sample" | "preview"
  const [loadingAudioId, setLoadingAudioId] = useState(null);
  const audioRef = useRef(null);

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchAgents();
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), type === "error" ? 6000 : 3500);
  };

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/voices/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setAgents(data.data || []);
    } catch {
      showNotification("error", "Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    setPlayingId(null);
    setPlayingType(null);
  };

  const handlePlaySample = async (agent) => {
    if (playingId === agent._id && playingType === "sample") {
      stopAudio();
      return;
    }
    stopAudio();

    if (!agent.voiceSampleUrl) {
      showNotification("error", "No sample file found for this agent.");
      return;
    }

    setLoadingAudioId(`${agent._id}-sample`);
    try {
      const sampleUrl = agent.voiceSampleUrl.startsWith("http")
        ? agent.voiceSampleUrl
        : `${APP_BASE}${agent.voiceSampleUrl}`;

      const res = await fetch(sampleUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load sample");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const audio = new Audio(blobUrl);
      audioRef.current = audio;
      audio.onended = () => { stopAudio(); URL.revokeObjectURL(blobUrl); };
      await audio.play();
      setPlayingId(agent._id);
      setPlayingType("sample");
    } catch (err) {
      showNotification("error", err.message || "Failed to play sample");
    } finally {
      setLoadingAudioId(null);
    }
  };

  const handlePreviewClone = async (agent) => {
    if (playingId === agent._id && playingType === "preview") {
      stopAudio();
      return;
    }
    stopAudio();

    setLoadingAudioId(`${agent._id}-preview`);
    try {
      const res = await fetch(`${API_BASE}/scripts/generate-audio-temp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sectionText: `Hi, my name is ${agent.name}. This is a preview of my cloned voice.`,
          voiceId: agent.elevenLabsVoiceId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Preview failed");

      const audioUrl = data.audioUrl.startsWith("http")
        ? data.audioUrl
        : `${APP_BASE}${data.audioUrl}`;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => stopAudio();
      await audio.play();
      setPlayingId(agent._id);
      setPlayingType("preview");
    } catch (err) {
      showNotification("error", err.message || "Preview failed");
    } finally {
      setLoadingAudioId(null);
    }
  };

  const handleClone = async (agent) => {
    if (!agent.voiceSampleUrl) {
      showNotification("error", "No voice sample uploaded by this agent yet.");
      return;
    }
    stopAudio();
    setActionLoading(agent._id);
    try {
      const res = await fetch(`${API_BASE}/voices/admin/${agent._id}/clone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ voiceName: agent.voiceName || agent.name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification("success", `Cloning started for ${agent.name}`);
        fetchAgents();
      } else {
        const msg = data.message || "Cloning failed";
        const isPermission = msg.toLowerCase().includes("missing_permissions") ||
          msg.toLowerCase().includes("permission") ||
          msg.toLowerCase().includes("create_instant_voice_clone");
        showNotification(
          "error",
          isPermission
            ? "ElevenLabs API key is missing voice cloning permission. Enable 'create_instant_voice_clone' in your ElevenLabs API key settings."
            : msg
        );
        fetchAgents();
      }
    } catch {
      showNotification("error", "Network error during cloning");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (agent) => {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    try {
      const res = await fetch(`${API_BASE}/voices/admin/${agent._id}/reject`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reason || "Sample rejected by admin" }),
      });
      if (res.ok) {
        showNotification("success", `Rejected ${agent.name}'s sample`);
        fetchAgents();
      } else {
        showNotification("error", "Failed to reject sample");
      }
    } catch {
      showNotification("error", "Network error");
    }
  };

  const handleDelete = async (agent) => {
    if (!confirm(`Remove voice for ${agent.name}? They will need to re-submit a sample.`)) return;
    stopAudio();
    setActionLoading(agent._id);
    try {
      const res = await fetch(`${API_BASE}/voices/${agent._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showNotification("success", `Voice removed for ${agent.name}`);
        fetchAgents();
      } else {
        showNotification("error", "Failed to remove voice");
      }
    } catch {
      showNotification("error", "Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const counts = {
    all:            agents.length,
    pending_review: agents.filter((a) => a.voiceStatus === "pending_review").length,
    cloning:        agents.filter((a) => a.voiceStatus === "cloning").length,
    cloned:         agents.filter((a) => a.voiceStatus === "cloned").length,
    rejected:       agents.filter((a) => a.voiceStatus === "rejected").length,
    failed:         agents.filter((a) => a.voiceStatus === "failed").length,
    none:           agents.filter((a) => !a.voiceStatus || a.voiceStatus === "none").length,
  };

  const filtered = agents.filter((a) => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      (a.name || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.role || "").toLowerCase().includes(q);
    const matchStatus =
      filterStatus === "all" || (a.voiceStatus || "none") === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <FiRefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm ${
          notification.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {notification.message}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "all",            label: "All",            cls: "bg-gray-100 text-gray-700" },
          { key: "pending_review", label: "Pending Review", cls: "bg-amber-100 text-amber-700" },
          { key: "cloning",        label: "Cloning",        cls: "bg-blue-100 text-blue-700" },
          { key: "cloned",         label: "Cloned",         cls: "bg-green-100 text-green-700" },
          { key: "rejected",       label: "Rejected",       cls: "bg-orange-100 text-orange-700" },
          { key: "failed",         label: "Failed",         cls: "bg-red-100 text-red-700" },
          { key: "none",           label: "No sample",      cls: "bg-gray-100 text-gray-400" },
        ].map(({ key, label, cls }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterStatus === key
                ? `${cls} border-indigo-400 ring-1 ring-indigo-200`
                : `${cls} border-transparent opacity-60 hover:opacity-100`
            }`}
          >
            {label} <span className="font-bold ml-1">{counts[key]}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />
          <button
            onClick={fetchAgents}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pending callout */}
      {counts.pending_review > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <FiClock className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">
              {counts.pending_review} agent{counts.pending_review > 1 ? "s" : ""}
            </span>{" "}
            submitted a voice sample and {counts.pending_review > 1 ? "are" : "is"} waiting to be cloned.
          </p>
        </div>
      )} 

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FiMic className="w-10 h-10 mx-auto mb-2" />
          <p className="text-sm">No agents match your filter</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 bg-white">
            <thead className="bg-gray-50">
              <tr>
                {["Agent", "Voice Name", "Status", "Sample", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((agent) => {
                const status = STATUS_CONFIG[agent.voiceStatus || "none"] || STATUS_CONFIG.none;
                const StatusIcon = status.icon;
                const isActing = actionLoading === agent._id;
                const isSampleLoading  = loadingAudioId === `${agent._id}-sample`;
                const isPreviewLoading = loadingAudioId === `${agent._id}-preview`;
                const isSamplePlaying  = playingId === agent._id && playingType === "sample";
                const isPreviewPlaying = playingId === agent._id && playingType === "preview";

                // which statuses allow cloning / retrying
                const canClone = ["pending_review", "failed", "rejected", "none"].includes(agent.voiceStatus || "none");
                // which statuses show preview
                const canPreview = agent.voiceStatus === "cloned" && agent.elevenLabsVoiceId;
                // which statuses show remove
                const canRemove = ["cloned", "pending_review", "cloning", "rejected", "failed"].includes(agent.voiceStatus);
                // which statuses show reject
                const canReject = agent.voiceStatus === "pending_review";

                return (
                  <tr key={agent._id} className="hover:bg-gray-50 transition">

                    {/* Agent */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                          {agent.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
                          <p className="text-xs text-gray-400 truncate">{agent.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Voice name */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-700">
                        {agent.voiceName || <span className="text-gray-300">—</span>}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        agent.role === "closer" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
                      }`}>
                        {agent.role}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        <StatusIcon className={`w-3 h-3 ${agent.voiceStatus === "cloning" ? "animate-spin" : ""}`} />
                        {status.label}
                      </span>
                      {["failed", "rejected"].includes(agent.voiceStatus) && agent.voiceError && (
                        <p className="text-[10px] text-red-500 mt-1 max-w-[160px] truncate" title={agent.voiceError}>
                          {agent.voiceError}
                        </p>
                      )}
                    </td>

                    {/* Sample playback */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {agent.voiceSampleUrl ? (
                        <button
                          onClick={() => handlePlaySample(agent)}
                          disabled={!!loadingAudioId}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition disabled:opacity-50 ${
                            isSamplePlaying
                              ? "text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
                              : "text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                          }`}
                        >
                          {isSampleLoading ? (
                            <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : isSamplePlaying ? (
                            <FiPause className="w-3.5 h-3.5" />
                          ) : (
                            <FiPlay className="w-3.5 h-3.5" />
                          )}
                          {isSampleLoading ? "Loading..." : isSamplePlaying ? "Stop" : "Listen"}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">No sample</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 flex-wrap">

                        {/* Clone / Retry */}
                        {canClone && (
                          <button
                            onClick={() => handleClone(agent)}
                            disabled={isActing || !agent.voiceSampleUrl}
                            title={!agent.voiceSampleUrl ? "Agent hasn't uploaded a sample yet" : ""}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 transition"
                          >
                            {isActing ? (
                              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FiMic className="w-3.5 h-3.5" />
                            )}
                            {isActing ? "Cloning..." : ["failed", "rejected"].includes(agent.voiceStatus) ? "Retry" : "Clone"}
                          </button>
                        )}

                        {/* Reject */}
                        {canReject && (
                          <button
                            onClick={() => handleReject(agent)}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 rounded-lg disabled:opacity-50 transition"
                          >
                            <FiXCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        )}

                        {/* Preview cloned voice */}
                        {canPreview && (
                          <button
                            onClick={() => handlePreviewClone(agent)}
                            disabled={!!loadingAudioId}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition disabled:opacity-50 ${
                              isPreviewPlaying
                                ? "text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
                                : "text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
                            }`}
                          >
                            {isPreviewLoading ? (
                              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : isPreviewPlaying ? (
                              <FiPause className="w-3.5 h-3.5" />
                            ) : (
                              <FiVolume2 className="w-3.5 h-3.5" />
                            )}
                            {isPreviewLoading ? "Generating..." : isPreviewPlaying ? "Stop" : "Preview Clone"}
                          </button>
                        )}

                        {/* Remove */}
                        {canRemove && (
                          <button
                            onClick={() => handleDelete(agent)}
                            disabled={isActing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50 transition"
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
