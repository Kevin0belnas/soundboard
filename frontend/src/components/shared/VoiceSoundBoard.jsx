import { useRef, useState, useEffect } from "react";

export default function VoiceSoundBoard() {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const audioRef = useRef(null);

  // Fetch scripts from database
  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      setLoading(true);
      setFetchError("");
      
      const token = localStorage.getItem("token");
      
      if (!token) {
        setFetchError("Not authenticated. Please login.");
        return;
      }

      const res = await fetch("http://localhost:5000/api/scripts", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error("Failed to fetch scripts");
      }

      const data = await res.json();
      setScripts(data);
    } catch (err) {
      console.error("Error fetching scripts:", err);
      setFetchError("Failed to load scripts");
    } finally {
      setLoading(false);
    }
  };

  const stopCurrentAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const playScript = async (script) => {
    const id = script._id;
    try {
      if (!script) return;

      setError("");
      setLoadingId(id);
      stopCurrentAudio();

      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/api/scripts/${id}/play`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let message = "Failed to generate voice.";
        try {
          const err = await res.json();
          message = err.error || err.message || message;
        } catch {
          // ignore parse error
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoadingId(null);
    }
  };

  const playCustomText = async (text) => {
    try {
      if (!text || !text.trim()) {
        setError("Please enter a script first.");
        return;
      }
      setError("");
      setLoadingId("custom");
      stopCurrentAudio();

      const res = await fetch("http://localhost:5000/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        let message = "Failed to generate voice.";
        try {
          const err = await res.json();
          message = err.details || err.message || message;
        } catch { }
        throw new Error(message);
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-2xl font-bold text-gray-800">Saved Scripts</h2>
              <button
                onClick={fetchScripts}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Refresh
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Click any script to generate and play the ElevenLabs voice.
            </p>

            {fetchError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {fetchError}
              </div>
            )}

            {scripts.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <p className="text-gray-500">No scripts found. Create some in the admin panel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scripts.map((script) => (
                  <button
                    key={script._id}
                    onClick={() => playScript(script.content, script._id)}
                    disabled={loadingId === script._id}
                    className="text-left rounded-xl border border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5 shadow hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-70"
                  >
                    <div className="font-bold text-xl mb-3">
                      {loadingId === script._id ? "Generating..." : script.title}
                    </div>
                    <div className="text-sm text-white/90 mb-2">
                      Type: {script.type}
                    </div>
                    <div className="text-lg text-white/95 leading-relaxed line-clamp-3">
                      {script.content}
                    </div>
                    {script.author && (
                      <div className="mt-3 text-xs text-white/70">
                        By: {script.author.name || script.author.email}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Custom Script</h2>
            <p className="text-sm text-gray-500 mb-4">
              Type any script and let the AI voice speak it.
            </p>

            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Type your script here..."
              className="w-full min-h-[180px] rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-600 px-4 py-3 text-sm break-words">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-4 flex-wrap">
              <button
                onClick={() => playScript(customText, "custom")}
                disabled={!customText.trim() || loadingId === "custom"}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {loadingId === "custom" ? "Generating..." : "Play Custom Script"}
              </button>

              <button
                onClick={stopCurrentAudio}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}