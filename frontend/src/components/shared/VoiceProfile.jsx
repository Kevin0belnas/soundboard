import { useEffect, useRef, useState } from "react";
import {
  FiUpload,
  FiMic,
  FiCheckCircle,
  FiAlertCircle,
  FiClock,
  FiPlay,
  FiPause,
  FiTrash2,
  FiRefreshCw,
  FiSquare,
} from "react-icons/fi";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const APP_BASE = API_BASE.replace(/\/api\/?$/, "");

const STATUS_CONFIG = {
  none: {
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
    icon: FiMic,
    label: "No voice set up",
  },
  pending_review: {
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: FiClock,
    label: "Sample submitted - waiting for admin to activate",
  },
  cloning: {
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: FiRefreshCw,
    label: "Cloning in progress...",
  },
  cloned: {
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    icon: FiCheckCircle,
    label: "Voice ready",
  },
  rejected: {
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: FiAlertCircle,
    label: "Sample rejected - please re-submit",
  },
  failed: {
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: FiAlertCircle,
    label: "Cloning failed - please re-submit",
  },
};

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function VoiceProfile() {
  const [voiceStatus, setVoiceStatus] = useState("none");
  const [voiceName, setVoiceName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // upload tab
  const [activeTab, setActiveTab] = useState("record"); // "record" | "upload"
  const [selectedFile, setSelectedFile] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // recorder
  const [recordingState, setRecordingState] = useState("idle"); // idle | recording | stopped
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [playingRecording, setPlayingRecording] = useState(false);

  // preview
  const [previewing, setPreviewing] = useState(false);
  const [previewText, setPreviewText] = useState(
    "Hi, this is a preview of my cloned voice.",
  );
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const audioRef = useRef(null);
  const recordingAudioRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("name") || "Agent";

  useEffect(() => {
    fetchVoiceStatus();
    return () => {
      clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, []);

  const fetchVoiceStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/voices/my-cloned`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVoiceStatus(data.voiceStatus || "none");
        setVoiceName(data.voiceName || "");
        setVoiceId(data.elevenLabsVoiceId || "");
      }
    } catch {
      // no voice yet
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecordingState("stopped");
      };

      mr.start(250);
      setRecordingState("recording");
      setRecordDuration(0);
      timerRef.current = setInterval(
        () => setRecordDuration((d) => d + 1),
        1000,
      );
    } catch {
      setErrorMsg(
        "Microphone access denied. Please allow microphone access and try again.",
      );
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingState("idle");
    setRecordDuration(0);
    setPlayingRecording(false);
    if (recordingAudioRef.current) {
      recordingAudioRef.current.pause();
      recordingAudioRef.current = null;
    }
  };

  const togglePlayRecording = () => {
    if (!recordedUrl) return;
    if (playingRecording && recordingAudioRef.current) {
      recordingAudioRef.current.pause();
      setPlayingRecording(false);
      return;
    }
    const audio = new Audio(recordedUrl);
    recordingAudioRef.current = audio;
    audio.onended = () => setPlayingRecording(false);
    audio.play();
    setPlayingRecording(true);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = [
      "audio/mpeg",
      "audio/wav",
      "audio/mp3",
      "audio/x-wav",
      "audio/wave",
      "audio/webm",
    ];
    if (!allowed.includes(file.type) && !["mp3", "wav", "webm"].includes(ext)) {
      setErrorMsg("Only MP3 or WAV files are supported.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg("File must be under 50MB.");
      return;
    }
    setErrorMsg("");
    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    const fileToSend = activeTab === "record" ? recordedBlob : selectedFile;

    if (!fileToSend) {
      setErrorMsg(
        activeTab === "record"
          ? "Please record a voice sample first."
          : "Please select a file.",
      );
      return;
    }
    if (!nameInput.trim()) {
      setErrorMsg("Please enter a name for your voice.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const formData = new FormData();
      const fileName =
        activeTab === "record" ? "voice_sample.webm" : selectedFile.name;
      formData.append("files", fileToSend, fileName);
      formData.append("voiceName", nameInput.trim());

      const res = await fetch(`${API_BASE}/voices/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setVoiceStatus("pending_review");
        setVoiceName(nameInput.trim());
        setSelectedFile(null);
        discardRecording();
        setNameInput("");
      } else {
        setErrorMsg(data.message || "Failed to submit sample. Try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreview = async () => {
    if (!previewText.trim() || !voiceId) return;

    if (previewing && audioRef.current) {
      audioRef.current.pause();
      setPreviewing(false);
      return;
    }

    setGeneratingPreview(true);
    try {
      const res = await fetch(`${API_BASE}/scripts/generate-audio-temp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sectionText: previewText, voiceId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Preview failed");

      const audioUrl = data.audioUrl.startsWith("http")
        ? data.audioUrl
        : `${APP_BASE}${data.audioUrl}`;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setPreviewing(false);
      await audio.play();
      setPreviewing(true);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate preview");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove your cloned voice? You will need to re-submit a sample."))
      return;
    try {
      const res = await fetch(`${API_BASE}/voices/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setVoiceStatus("none");
        setVoiceName("");
        setVoiceId("");
      } else {
        setErrorMsg("Failed to remove voice.");
      }
    } catch {
      setErrorMsg("Failed to remove voice.");
    }
  };

  const status = STATUS_CONFIG[voiceStatus] || STATUS_CONFIG.none;
  const StatusIcon = status.icon;
  const activeFile = activeTab === "record" ? recordedBlob : selectedFile;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <FiRefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div
        className={`rounded-xl border ${status.border} ${status.bg} p-3 flex items-start gap-3 -mt-6`}
      >
        <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${status.color}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${status.color}`}>
            {status.label}
          </p>
          {voiceName && (
            <p className="text-xs text-gray-500 mt-0.5">
              Voice name:{" "}
              <span className="font-medium text-gray-700">{voiceName}</span>
            </p>
          )}
          {voiceId && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              ID: {voiceId}
            </p>
          )}
        </div>
        {(voiceStatus === "cloned" || voiceStatus === "pending_review" || voiceStatus === "cloning") && (
          <button
            onClick={handleDelete}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition shrink-0"
            title="Remove voice"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {voiceStatus === "cloned" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Preview Your Voice
          </h3>
          <textarea
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={3}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Type something to hear your cloned voice..."
          />
          <button
            onClick={handlePreview}
            disabled={generatingPreview || !previewText.trim()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition gap-2"
          >
            {generatingPreview ? (
              <FiRefreshCw className="w-4 h-4 animate-spin" />
            ) : previewing ? (
              <FiPause className="w-4 h-4" />
            ) : (
              <FiPlay className="w-4 h-4" />
            )}
            {generatingPreview
              ? "Generating..."
              : previewing
                ? "Stop"
                : "Play Preview"}
          </button>
        </div>
      )}

      {voiceStatus === "pending_review" && (
        <div className="bg-white rounded-xl border border-amber-200 p-5">
          <div className="flex gap-3">
            <FiClock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Sample received
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Your voice sample has been submitted. An admin will review and
                clone your voice shortly. You'll be notified once it's ready.
              </p>
            </div>
          </div>
        </div>
      )}

      {(voiceStatus === "none" || voiceStatus === "failed" || voiceStatus === "rejected") && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {[
              { key: "record", label: "Record Now", icon: FiMic },
              { key: "upload", label: "Upload File", icon: FiUpload },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setActiveTab(key);
                  setErrorMsg("");
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === key
                    ? "border-indigo-500 text-indigo-600 bg-indigo-50"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voice Name
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={`e.g. ${userName}'s Voice`}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {activeTab === "record" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Click record and speak naturally for at least 1 minute. No
                  background noise.
                </p>

                <div
                  className={`rounded-xl border-2 p-6 text-center transition ${
                    recordingState === "recording"
                      ? "border-red-300 bg-red-50"
                      : recordingState === "stopped"
                        ? "border-green-300 bg-green-50"
                        : "border-gray-200 bg-gray-50"
                  }`}
                >
                  {recordingState === "idle" && (
                    <div className="space-y-3">
                      <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                        <FiMic className="w-7 h-7 text-indigo-600" />
                      </div>
                      <p className="text-sm text-gray-600 font-medium">
                        Ready to record
                      </p>
                      <button
                        onClick={startRecording}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        <FiMic className="w-4 h-4" />
                        Start Recording
                      </button>
                    </div>
                  )}

                  {recordingState === "recording" && (
                    <div className="space-y-3">
                      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto animate-pulse">
                        <FiMic className="w-7 h-7 text-red-600" />
                      </div>
                      <p className="text-sm font-semibold text-red-600">
                        Recording...
                      </p>
                      <p className="text-2xl font-mono font-bold text-red-700">
                        {formatDuration(recordDuration)}
                      </p>
                      {recordDuration < 60 && (
                        <p className="text-xs text-red-400">
                          Keep going - aim for at least 1 minute
                        </p>
                      )}
                      <button
                        onClick={stopRecording}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        <FiSquare className="w-4 h-4" />
                        Stop Recording
                      </button>
                    </div>
                  )}

                  {recordingState === "stopped" && (
                    <div className="space-y-3">
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                        <FiCheckCircle className="w-7 h-7 text-green-600" />
                      </div>
                      <p className="text-sm font-semibold text-green-700">
                        Recording complete
                      </p>
                      <p className="text-xs text-gray-500">
                        Duration: {formatDuration(recordDuration)}
                      </p>
                      {recordDuration < 60 && (
                        <p className="text-xs text-amber-600 rounded-lg px-3 py-1.5">
                          Sample is under 1 minute - quality may be lower.
                          Consider re-recording.
                        </p>
                      )}
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={togglePlayRecording}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 border border-green-300 bg-white hover:bg-green-50 rounded-lg transition"
                        >
                          {playingRecording ? (
                            <FiPause className="w-4 h-4" />
                          ) : (
                            <FiPlay className="w-4 h-4" />
                          )}
                          {playingRecording ? "Stop" : "Play Back"}
                        </button>
                        <button
                          onClick={discardRecording}
                          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 bg-white hover:bg-red-50 rounded-lg transition"
                        >
                          <FiTrash2 className="w-4 h-4" />
                          Re-record
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "upload" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Upload an MP3 or WAV file of your voice. At least 1 minute,
                  max 50MB.
                </p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFileSelect(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                    dragOver
                      ? "border-indigo-400 bg-indigo-50"
                      : selectedFile
                        ? "border-green-400 bg-green-50"
                        : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,audio/mpeg,audio/wav"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                  {selectedFile ? (
                    <div className="space-y-1">
                      <FiCheckCircle className="w-8 h-8 text-green-500 mx-auto" />
                      <p className="text-sm font-medium text-green-700">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                      <p className="text-xs text-indigo-600 mt-1">
                        Click to change file
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <FiUpload className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-sm font-medium text-gray-600">
                        Drag & drop your voice sample
                      </p>
                      <p className="text-xs text-gray-400">
                        or click to browse · MP3 or WAV · max 50MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 mb-1">
                Tips for a good voice sample
              </p>
              <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
                <li>Record in a quiet room with no echo</li>
                <li>Speak naturally at your normal pace</li>
                <li>Record at least 1 minute of audio</li>
                <li>Keep the audio consistent</li>
              </ul>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting || !activeFile || !nameInput.trim()}
              className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <FiRefreshCw className="w-4 h-4 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <FiMic className="w-4 h-4" /> Submit Voice Sample
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
