const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const Script = require("../models/Script");
const Log = require("../models/Log");
const { parseScript } = require("../utils/parseScript");
const { generateSegment } = require("../utils/generateSegment");
const { stitchAudio } = require("../utils/stitchAudio");
const { getCachedPath } = require("../utils/dynamicCache");

const DYNAMIC_PLACEHOLDER = /\[[^\]]+\]/;
const OPENER_NAME_PATTERN = /\[Opener Name\]/gi;
const OPENER_NAME_CONTEXT = /\b(as|like|what)\s+\[Opener Name\]\s+(mentioned|said|told us|explained)/gi;
const STAGE_DIRECTION =
  /^(\[PAUSE[^\]]*\]|Pause\.?(\s+Let them agree\.?)?(\s+Let them answer\.?)?(\s+Then transition\.?)?|Let them answer\.?|Then transition\.?|Wait for (response|answer|reply)\.?|Transition\.?|Note:.*)$/i;

function parseScriptSectionsBackend(content) {
  if (!content) return [];
  const lines = content.split("\n");
  const sections = [];
  let currentTitle = null;
  let currentLines = [];

  const isHeader = (line) => {
    const t = line.trim();
    return (
      t.length > 0 &&
      t.length < 80 &&
      !t.startsWith("•") &&
      !t.startsWith("-") &&
      !/[.!?,:"\]]$/.test(t) &&
      /^[A-Z]/.test(t) &&
      !t.includes("[PAUSE]")
    );
  };

  for (const line of lines) {
    if (isHeader(line)) {
      if (currentTitle)
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      else if (currentLines.join("").trim())
        sections.push({
          title: "Intro",
          content: currentLines.join("\n").trim(),
        });
      currentTitle = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle)
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  if (sections.length === 0)
    sections.push({ title: "Script", content: content.trim() });
  return sections;
}

function stripStageDirections(text) {
  return text
    .split("\n")
    .filter((line) => !STAGE_DIRECTION.test(line.trim()))
    .join("\n")
    .trim();
}

function stripOpenerName(text) {
  // "as [Opener Name] mentioned" → "as mentioned"
  // "like [Opener Name] said" → "as mentioned"
  // "what [Opener Name] mentioned" → "as mentioned"
  let result = text.replace(OPENER_NAME_CONTEXT, "as mentioned");
  // fallback: bare [Opener Name] still remaining → remove entirely
  result = result.replace(OPENER_NAME_PATTERN, "").replace(/\s{2,}/g, " ").trim();
  return result;
}

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";
const AUDIO_DIR = path.join(__dirname, "..", "uploads", "audio");

const SILENCE_PATH = path.join(AUDIO_DIR, "..", "silence_100ms.mp3");

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

// function sanitizeFileName(value = "") {
//   return value
//     .replace(/[^a-zA-Z0-9-_]/g, "_")
//     .replace(/_+/g, "_")
//     .replace(/^_+|_+$/g, "")
//     .slice(0, 80);
// }

// async function getSavedVoiceSettings(apiKey, voiceId) {
//   const settingsResponse = await fetch(
//     `https://api.elevenlabs.io/v1/voices/${voiceId}/settings`,
//     {
//       method: "GET",
//       headers: {
//         "xi-api-key": apiKey,
//       },
//     },
//   );

//   if (!settingsResponse.ok) {
//     const rawError = await settingsResponse.text();
//     throw new Error(rawError || "Failed to fetch ElevenLabs voice settings");
//   }

//   return settingsResponse.json();
// }

async function generateAndSaveScriptAudio(
  scriptDoc,
  oldAudioFileName = "",
  forceRegenerate = false,
) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in backend .env");
  }

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID in backend .env");
  }

  ensureAudioDir();

  const segments = parseScript(scriptDoc.content);
  const isCloser = scriptDoc.type === "closer";

  // Generate static segments which will be saved as numbered files
  const staticDir = path.join(AUDIO_DIR, "static");
  if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true });

  const savedSegments = [];

  for (const seg of segments) {
    if (seg.type === "static") {
      const segText = isCloser ? stripOpenerName(seg.text) : seg.text;
      const fileName = `${scriptDoc._id}_seg${seg.index}.mp3`;
      const filePath = path.join(staticDir, fileName);

      // Only regenerate if file doesn't exist, or force regeneration on content change
      if (!fs.existsSync(filePath) || forceRegenerate) {
        await generateSegment(segText, filePath);
      }

      savedSegments.push({ ...seg, fileName });
    } else {
      // Dynamic segments
      savedSegments.push({ ...seg, fileName: "" });
    }
  }

  // Delete old audio file if any
  if (oldAudioFileName) {
    const oldPath = path.join(AUDIO_DIR, oldAudioFileName);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  // Clean up old static segments for this script
  const existingStatics = fs
    .readdirSync(staticDir)
    .filter((f) => f.startsWith(`${scriptDoc._id}_seg`));
  const newStaticNames = savedSegments
    .filter((s) => s.type === "static")
    .map((s) => s.fileName);

  for (const old of existingStatics) {
    if (!newStaticNames.includes(old)) {
      fs.unlinkSync(path.join(staticDir, old));
    }
  }

  // Save segments into the script document
  scriptDoc.segments = savedSegments;

  // Generate static section audio files
  const sectionDir = path.join(AUDIO_DIR, "sections");
  if (!fs.existsSync(sectionDir)) fs.mkdirSync(sectionDir, { recursive: true });

  const sections = parseScriptSectionsBackend(scriptDoc.content);
  const sectionAudios = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    // Skip sections with dynamic placeholders (but not [ref:...] tags)
    const contentWithoutRefs = sec.content.replace(/\[ref:[a-f0-9]{24}\]/gi, "");
    if (DYNAMIC_PLACEHOLDER.test(contentWithoutRefs)) continue;

    let cleaned = stripStageDirections(sec.content);
    if (isCloser) cleaned = stripOpenerName(cleaned);
    // remove any [ref:...] tags from the text before TTS
    cleaned = cleaned.replace(/\[ref:[a-f0-9]{24}\]/gi, "").trim();
    if (!cleaned) continue;

    const fileName = `${scriptDoc._id}_section${i}.mp3`;
    const filePath = path.join(sectionDir, fileName);

    if (!fs.existsSync(filePath) || forceRegenerate) {
      await generateSegment(cleaned, filePath);
    }
    sectionAudios.push({ sectionIndex: i, fileName });
  }

  // Clean up old section files for this script
  const existingSections = fs
    .readdirSync(sectionDir)
    .filter((f) => f.startsWith(`${scriptDoc._id}_section`));
  const newSectionNames = sectionAudios.map((s) => s.fileName);
  for (const old of existingSections) {
    if (!newSectionNames.includes(old))
      fs.unlinkSync(path.join(sectionDir, old));
  }

  scriptDoc.sectionAudios = sectionAudios;
  scriptDoc.audioStatus = "ready";
  scriptDoc.audioError = "";
  scriptDoc.audioUrl = "";
  scriptDoc.audioFileName = "";
  await scriptDoc.save();

  return scriptDoc;

  // const response = await fetch(
  //   `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
  //   {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       "xi-api-key": apiKey,
  //       Accept: "audio/mpeg",
  //     },
  //     body: JSON.stringify({
  //       text: scriptDoc.content.trim(),
  //       model_id: "eleven_multilingual_v2",
  //     }),
  //   }
  // );

  // if (!response.ok) {
  //   const rawError = await response.text();
  //   throw new Error(rawError || "ElevenLabs request failed");
  // }

  // const audioBuffer = Buffer.from(await response.arrayBuffer());

  // if (oldAudioFileName) {
  //   const oldFilePath = path.join(AUDIO_DIR, oldAudioFileName);
  //   if (fs.existsSync(oldFilePath)) {
  //     fs.unlinkSync(oldFilePath);
  //   }
  // }

  // const safeTitle = sanitizeFileName(scriptDoc.title || "script");
  // const fileName = `${scriptDoc._id}_${safeTitle}.mp3`;
  // const filePath = path.join(AUDIO_DIR, fileName);

  // fs.writeFileSync(filePath, audioBuffer);

  // scriptDoc.audioFileName = fileName;
  // scriptDoc.audioUrl = `/audio/${fileName}`;
  // scriptDoc.audioStatus = "ready";
  // scriptDoc.audioError = "";
  // await scriptDoc.save();

  // return scriptDoc;
}

// ---------------- GET ALL SCRIPTS ----------------
// Helper function to create logs
const createLog = async (req, action, details) => {
  try {
    const log = new Log({
      action,
      user: req.user.userId,
      details,
      ip: req.ip || req.connection.remoteAddress,
    });
    await log.save();
    console.log(`Log created: ${action}`);
  } catch (error) {
    console.error("Error creating log:", error);
  }
};

// Get all scripts (protected)
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
      return res
        .status(403)
        .json({ error: "Only the creator or admin can edit this script" });
    }

    // Store old values for logging
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

    // Update fields
    script.title = newTitle;
    script.content = newContent;
    script.type = type || script.type;
    script.updatedAt = Date.now();

    await script.save();
    await script.populate("author", "_id name email");

    // CREATE LOG ENTRY
    await createLog(req, "update_script", {
      scriptId: script._id,
      title: script.title,
      oldValues,
      newValues: { title, content, type },
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
      await generateAndSaveScriptAudio(script, oldAudioFileName, true);
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
      return res
        .status(403)
        .json({ error: "Not authorized to regenerate this script audio" });
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
      await generateAndSaveScriptAudio(script, oldAudioFileName, true);
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
      action: "update_script",
    });

    res.status(500).json({ error: error.message });
  }
});

// ---------------- SERVE STATIC SECTION AUDIO ----------------
router.get(
  "/:id/section-audio/:sectionIndex",
  authenticateToken,
  async (req, res) => {
    const script = await Script.findById(req.params.id);
    if (!script) return res.status(404).json({ error: "Script not found" });

    const idx = parseInt(req.params.sectionIndex);
    const entry = script.sectionAudios?.find((s) => s.sectionIndex === idx);
    if (!entry)
      return res
        .status(404)
        .json({ error: "No cached audio for this section" });

    const filePath = path.join(AUDIO_DIR, "sections", entry.fileName);
    if (!fs.existsSync(filePath))
      return res
        .status(404)
        .json({ error: "Audio file missing, please regenerate" });

    res.setHeader("Content-Type", "audio/mpeg");
    fs.createReadStream(filePath).pipe(res);
  },
);

// ---------------- GENERATE TEMPORARY PERSONALIZED AUDIO ----------------
router.post("/generate-audio-temp", authenticateToken, async (req, res) => {
  console.log("generate-audio-temp body:", JSON.stringify(req.body, null, 2));

  try {
    const { scriptId, sectionText, values } = req.body;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey)
      return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY" });
    if (!voiceId)
      return res.status(500).json({ error: "Missing ELEVENLABS_VOICE_ID" });

    ensureAudioDir();
    const tempDir = path.join(__dirname, "..", "uploads", "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Approach 1: Section-by-section generation for dynamic scripts without regenerating the whole script
    if (sectionText) {
      const cleaned = sectionText.trim();

      if (!cleaned) {
        return res
          .status(400)
          .json({ error: "sectionText is empty after trimming" });
      }

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
            text: cleaned,
            model_id: "eleven_turbo_v2_5",
          }),
        },
      );

      if (!response.ok) {
        const rawError = await response.text();
        throw new Error(rawError || "ElevenLabs request failed");
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const timestamp = Date.now();
      const fileName = `section_${scriptId || "x"}_${timestamp}.mp3`;
      const filePath = path.join(tempDir, fileName);

      fs.writeFileSync(filePath, audioBuffer);

      // Clean up temp files older than 1 hour
      fs.readdirSync(tempDir).forEach((file) => {
        const fp = path.join(tempDir, file);
        try {
          if (Date.now() - fs.statSync(fp).mtimeMs > 3600000) fs.unlinkSync(fp);
        } catch (_) {}
      });

      return res.json({
        success: true,
        audioUrl: `/temp/${fileName}`,
        message: "Section audio generated successfully",
      });
    }

    // Approach 2: Full stitch (existing, unchanged)
    if (!scriptId)
      return res.status(400).json({ error: "scriptId is required" });
    if (!values)
      return res.status(400).json({ error: "values map is required" });

    const script = await Script.findById(scriptId);
    if (!script) return res.status(404).json({ error: "Script not found" });
    if (!script.segments || script.segments.length === 0) {
      return res.status(400).json({
        error: "Script has no pre-generated segments. Please regenerate audio.",
      });
    }

    const staticDir = path.join(AUDIO_DIR, "static");
    const orderedPaths = [];

    for (const seg of script.segments) {
      if (seg.type === "static") {
        const filePath = path.join(staticDir, seg.fileName);
        if (!fs.existsSync(filePath)) {
          return res.status(500).json({
            error: `Static segment file missing: ${seg.fileName}. Please regenerate audio for this script.`,
          });
        }
        orderedPaths.push(filePath);
      } else if (seg.type === "dynamic") {
        const resolved = values[seg.text];
        if (!resolved) {
          return res.status(400).json({
            error: `Missing value for dynamic placeholder: ${seg.text}`,
          });
        }

        const { filePath, exists } = getCachedPath(resolved);
        if (!exists) {
          await generateSegment(resolved, filePath);
        }
        orderedPaths.push(filePath);
      }
      // pause segments are skipped

      // Silence buffer between segments
      if (fs.existsSync(SILENCE_PATH)) {
        orderedPaths.push(SILENCE_PATH);
      }
    }

    // Remove trailing silence
    if (orderedPaths[orderedPaths.length - 1] === SILENCE_PATH) {
      orderedPaths.pop();
    }

    // Stitch
    const timestamp = Date.now();
    const outputName = `stitched_${scriptId}_${timestamp}.mp3`;
    const outputPath = path.join(tempDir, outputName);

    stitchAudio(orderedPaths, outputPath);

    // Clean up temp files older than 1 hour
    fs.readdirSync(tempDir).forEach((file) => {
      const fp = path.join(tempDir, file);
      try {
        if (Date.now() - fs.statSync(fp).mtimeMs > 3600000) fs.unlinkSync(fp);
      } catch (_) {}
    });

    return res.json({
      success: true,
      audioUrl: `/temp/${outputName}`,
      message: "Stitched audio generated successfully",
    });
  } catch (error) {
    console.error("Stitching error:", error);
    res.status(500).json({ success: false, error: error.message });
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
      return res
        .status(403)
        .json({ error: "Only the creator or admin can delete this script" });
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
