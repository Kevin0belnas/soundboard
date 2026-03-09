const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const Script = require("../models/Script");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";
const AUDIO_DIR = path.join(__dirname, "..", "uploads", "audio");

// ---------------- AUTH MIDDLEWARE ----------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// ---------------- HELPERS ----------------
function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

function sanitizeFileName(value = "") {
  return value
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

async function getSavedVoiceSettings(apiKey, voiceId) {
  const settingsResponse = await fetch(
    `https://api.elevenlabs.io/v1/voices/${voiceId}/settings`,
    {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
    }
  );

  if (!settingsResponse.ok) {
    const rawError = await settingsResponse.text();
    throw new Error(rawError || "Failed to fetch ElevenLabs voice settings");
  }

  return settingsResponse.json();
}

async function generateAndSaveScriptAudio(scriptDoc, oldAudioFileName = "") {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in backend .env");
  }

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID in backend .env");
  }

  ensureAudioDir();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: scriptDoc.content.trim(),
        model_id: "eleven_multilingual_v2",
      }),
    }
  );

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(rawError || "ElevenLabs request failed");
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  if (oldAudioFileName) {
    const oldFilePath = path.join(AUDIO_DIR, oldAudioFileName);
    if (fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }
  }

  const safeTitle = sanitizeFileName(scriptDoc.title || "script");
  const fileName = `${scriptDoc._id}_${safeTitle}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);

  fs.writeFileSync(filePath, audioBuffer);

  scriptDoc.audioFileName = fileName;
  scriptDoc.audioUrl = `/audio/${fileName}`;
  scriptDoc.audioStatus = "ready";
  scriptDoc.audioError = "";
  await scriptDoc.save();

  return scriptDoc;
}

// ---------------- GET ALL SCRIPTS ----------------
router.get("/", authenticateToken, async (req, res) => {
  try {
    const scripts = await Script.find()
      .populate("author", "name email")
      .sort({ createdAt: -1 });

    res.json(scripts);
  } catch (error) {
    console.error("Error fetching scripts:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- CREATE SCRIPT ----------------
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, content, type } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    if (!req.user.userId) {
      return res.status(400).json({ error: "Invalid user token" });
    }

    const script = new Script({
      title,
      content,
      type: type || "general",
      author: req.user.userId,
      audioStatus: "generating",
      audioUrl: "",
      audioFileName: "",
      audioError: "",
    });

    const savedScript = await script.save();
    await savedScript.populate("author", "name email");

    res.status(201).json({
      success: true,
      message: "Script saved. Audio generation started.",
      script: savedScript,
    });

    try {
      await generateAndSaveScriptAudio(savedScript);
      console.log(`✅ Audio generated for script: ${savedScript._id}`);
    } catch (audioError) {
      console.error("❌ Audio generation error:", audioError.message);
      savedScript.audioStatus = "failed";
      savedScript.audioError = audioError.message;
      await savedScript.save();
    }
  } catch (error) {
    console.error("Error creating script:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// ---------------- UPDATE SCRIPT ----------------
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const scriptId = req.params.id;

    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    if (
      script.author.toString() !== req.user.userId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized to edit this script" });
    }

    const oldAudioFileName = script.audioFileName || "";

    const newTitle = title || script.title;
    const newContent = content || script.content;
    const newType = type || script.type;

    const shouldRegenerate =
      newTitle !== script.title ||
      newContent !== script.content ||
      newType !== script.type;

    script.title = newTitle;
    script.content = newContent;
    script.type = newType;

    if (shouldRegenerate) {
      script.audioStatus = "generating";
      script.audioError = "";
      script.audioUrl = "";
      script.audioFileName = "";
    }

    await script.save();
    await script.populate("author", "name email");

    res.json({
      success: true,
      message: shouldRegenerate
        ? "Script updated. Audio regeneration started."
        : "Script updated successfully.",
      script,
    });

    if (!shouldRegenerate) return;

    try {
      await generateAndSaveScriptAudio(script, oldAudioFileName);
      console.log(`✅ Audio regenerated for script: ${script._id}`);
    } catch (audioError) {
      console.error("❌ Audio regeneration failed:", audioError.message);
      script.audioStatus = "failed";
      script.audioError = audioError.message;
      await script.save();
    }
  } catch (error) {
    console.error("Error updating script:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- REGENERATE AUDIO ONLY ----------------
router.post("/:id/regenerate-audio", authenticateToken, async (req, res) => {
  try {
    const scriptId = req.params.id;

    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    if (
      script.author.toString() !== req.user.userId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized to regenerate this script audio" });
    }

    const oldAudioFileName = script.audioFileName || "";

    script.audioStatus = "generating";
    script.audioError = "";
    script.audioUrl = "";
    script.audioFileName = "";

    await script.save();
    await script.populate("author", "name email");

    res.json({
      success: true,
      message: "Audio regeneration started.",
      script,
    });

    try {
      await generateAndSaveScriptAudio(script, oldAudioFileName);
      console.log(`✅ Audio regenerated for script: ${script._id}`);
    } catch (audioError) {
      console.error("❌ Audio regeneration failed:", audioError.message);
      script.audioStatus = "failed";
      script.audioError = audioError.message;
      await script.save();
    }
  } catch (error) {
    console.error("Error regenerating script audio:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- DELETE SCRIPT ----------------
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const scriptId = req.params.id;
    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }

    if (
      script.author.toString() !== req.user.userId &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized to delete this script" });
    }

    if (script.audioFileName) {
      const filePath = path.join(AUDIO_DIR, script.audioFileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Script.findByIdAndDelete(scriptId);

    res.json({ message: "Script deleted successfully" });
  } catch (error) {
    console.error("Error deleting script:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;