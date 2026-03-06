import { useRef, useState } from "react";

const DEMO_SCRIPTS = [
  {
    id: 1,
    title: "Greeting",
    text: "Good morning sir, this is our daily report.",
  },
  {
    id: 2,
    title: "Update",
    text: "We updated the product insertion flow and integrated the client side RPC.",
  },
  {
    id: 3,
    title: "Database",
    text: "We also updated the database and verified the latest changes.",
  },
  {
    id: 4,
    title: "Closing",
    text: "That is all for today. Thank you.",
  },
];

export default function VoiceSoundBoard() {
  const [loadingId, setLoadingId] = useState(null);
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState("");
  const audioRef = useRef(null);

  const stopCurrentAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const playScript = async (text, id = "custom") => {
    try {
      if (!text || !text.trim()) {
        setError("Please enter a script first.");
        return;
      }

      setError("");
      setLoadingId(id);
      stopCurrentAudio();

      const res = await fetch("http://localhost:5000/api/tts/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        let message = "Failed to generate voice.";
        try {
          const err = await res.json();
          message = err.details || err.message || message;
        } catch {
          // ignore parse error
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Saved Scripts</h2>
            <p className="text-sm text-gray-500 mb-6">
              Click any script to generate and play the ElevenLabs voice.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DEMO_SCRIPTS.map((script) => (
                <button
                  key={script.id}
                  onClick={() => playScript(script.text, script.id)}
                  disabled={loadingId === script.id}
                  className="text-left rounded-xl border border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-5 shadow hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-70"
                >
                  <div className="font-bold text-xl mb-3">
                    {loadingId === script.id ? "Generating..." : script.title}
                  </div>
                  <div className="text-lg text-white/95 leading-relaxed">
                    {script.text}
                  </div>
                </button>
              ))}
            </div>
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