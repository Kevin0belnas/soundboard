const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const Script = require("../models/Script");
const Log = require("../models/Log");

const { AUDIO_DIR, saveScriptAudioFile, generateTempAudio } = require("../services/ttsService");
const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

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
async function generateAndSaveScriptAudio(scriptDoc, oldAudioFileName = "") {
  return saveScriptAudioFile(scriptDoc, oldAudioFileName);
}

const createLog = async (req, action, details) => {
  try {
    const log = new Log({
      action,
      user: req.user?.userId,
      details,
      ip: req.ip || req.connection.remoteAddress,
    });
    await log.save();
    console.log(`Log created: ${action}`);
  } catch (error) {
    console.error("Error creating log:", error);
  }
};

// ---------------- GET ALL SCRIPTS ----------------
router.get("/", authenticateToken, async (req, res) => {
  try {  
    let query = {};

    if (req.user.role !== "admin") {
      const User = require("../models/User");
      const admins = await User.find({ role: "admin" }).select("_id");
      const adminIds = admins.map((admin) => admin._id);

      query = {
        $or: [{ author: req.user.userId }, { author: { $in: adminIds } }],
      };
    }

    const scripts = await Script.find(query)
      .populate("author", "_id name email")
      .sort({ createdAt: -1 });

    res.json(scripts);
  } catch (error) {
    console.error("Error fetching scripts:", error);
    await createLog(req, "error", {
      error: error.message,
      action: "fetch_scripts",
    });
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

    let finalType = type || "general";

    if (req.user.role === "closer") {
      finalType = "closer";
    } else if (req.user.role === "opener") {
      finalType = "opener";
    }

    const script = new Script({
      title,
      content,
      type: finalType,
      author: req.user.userId,
      audioStatus: "generating",
      audioUrl: "",
      audioFileName: "",
      audioError: "",
    });

    const savedScript = await script.save();
    await savedScript.populate("author", "_id name email");

    res.status(201).json({
      success: true,
      message: "Script saved. Audio generation started.",
      script: savedScript,
    });

    try {
      await generateAndSaveScriptAudio(savedScript);
      console.log(`Audio generated for script: ${savedScript._id}`);
    } catch (audioError) {
      console.error("Audio generation error:", audioError.message);
      savedScript.audioStatus = "failed";
      savedScript.audioError = audioError.message;
      await savedScript.save();
    }
  } catch (error) {
    console.error("Error creating script:", error);

    await createLog(req, "error", {
      error: error.message,
      action: "create_script",
      body: req.body,
    });

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

    const isAuthor = script.author.toString() === req.user.userId;
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      await createLog(req, "unauthorized", {
        scriptId,
        userId: req.user.userId,
        action: "update_script",
        message: "User attempted to update a script they did not create",
      });
      return res.status(403).json({ error: "Only the creator or admin can edit this script" });
    }

    const oldValues = {
      title: script.title,
      content: script.content,
      type: script.type,
    };

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
    script.updatedAt = Date.now();

    if (shouldRegenerate) {
      script.audioStatus = "generating";
      script.audioError = "";
    }

    await script.save();
    await script.populate("author", "_id name email");

    await createLog(req, "update_script", {
      scriptId: script._id,
      title: script.title,
      oldValues,
      newValues: { title: newTitle, content: newContent, type: newType },
      message: `Updated script: ${script.title}`,
    });

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
      console.log(`Audio regenerated for script: ${script._id}`);
    } catch (audioError) {
      console.error("Audio regeneration failed:", audioError.message);
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
    await script.populate("author", "_id name email");

    res.json({
      success: true,
      message: "Audio regeneration started.",
      script,
    });

    try {
      await generateAndSaveScriptAudio(script, oldAudioFileName);
      console.log(`Audio regenerated for script: ${script._id}`);
    } catch (audioError) {
      console.error("Audio regeneration failed:", audioError.message);
      script.audioStatus = "failed";
      script.audioError = audioError.message;
      await script.save();
    }
  } catch (error) {
    console.error("Error regenerating script audio:", error);

    await createLog(req, "error", {
      error: error.message,
      scriptId: req.params.id,
      action: "regenerate_audio",
    });

    res.status(500).json({ error: error.message });
  }
});

// ---------------- GENERATE TEMPORARY PERSONALIZED AUDIO ----------------
router.post("/generate-audio-temp", authenticateToken, async (req, res) => {
  try {
    const { sectionText, scriptId, voiceId: requestVoiceId } = req.body;

    if (!sectionText) {
      return res.status(400).json({ error: "SectionText is required" });
    }

    // Use voiceId from request if provided, otherwise look up agent's cloned voice
    let voiceId = requestVoiceId || null;
    if (!voiceId && req.user?.userId) {
      const User = require("../models/User");
      const user = await User.findById(req.user.userId).select("elevenlabsVoiceId voiceStatus");
      console.log(`[generate-audio-temp] user voiceStatus: ${user?.voiceStatus} | elevenlabsVoiceId: ${user?.elevenlabsVoiceId}`);
      if (user?.voiceStatus === "cloned" && user?.elevenlabsVoiceId) {
        voiceId = user.elevenlabsVoiceId;      
      }
    }
    console.log(`[generate-audio-temp] final voiceId: ${voiceId || "default"}`);

    const result = await generateTempAudio(sectionText, scriptId || "audio", voiceId);

    res.json({
      success: true,
      audioUrl: result.audioUrl,
      message: "Personalized audio generated successfully",
    });
  } catch (error) {
    console.error("Error generating temporary audio:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to generate audio",
    });
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

    const isAuthor = script.author.toString() === req.user.userId;
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      await createLog(req, "unauthorized", {
        scriptId,
        userId: req.user.userId,
        action: "delete_script",
        message: "User attempted to delete a script they did not create",
      });
      return res.status(403).json({ error: "Only the creator or admin can delete this script" });
    }

    if (script.audioFileName) {
      const filePath = path.join(AUDIO_DIR, script.audioFileName); 
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const deletedScriptInfo = {
      id: script._id,
      title: script.title,
      type: script.type,
    }; 

    await Script.findByIdAndDelete(scriptId);

    await createLog(req, "delete_script", {
      scriptId: deletedScriptInfo.id,
      title: deletedScriptInfo.title,
      type: deletedScriptInfo.type,
      message: `Deleted script: ${deletedScriptInfo.title}`,
    });

    res.json({ message: "Script deleted successfully" });
  } catch (error) {
    console.error("Error deleting script:", error);

    await createLog(req, "error", {
      error: error.message,
      scriptId: req.params.id,
      action: "delete_script",
    });

    res.status(500).json({ error: error.message });
  }
});

module.exports = router;