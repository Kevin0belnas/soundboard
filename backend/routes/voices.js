const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access denied" });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  next();
};

// Multer middleware for handling multipart/form-data
const VOICES_DIR = path.join(__dirname, "..", "uploads", "voices");
fs.mkdirSync(VOICES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VOICES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `voice_${req.params.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".mp3", ".wav", ".webm", ".m4a", ".ogg"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(null, true);
    }
    cb(new Error("Only audio files are allowed"));
  },
});

// ElevenLabs helpers
async function cloneVoiceWithElevenLabs(voiceName, sampleFiles) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

  const form = new FormData();
  form.append("name", voiceName);
  form.append("remove_background_noise", "true");
  form.append("has_isolated_audio", "true");  

  let filesAppended = 0;
  for (const file of sampleFiles) {
    console.log(
      `Checking sample file: ${file.path} — exists: ${fs.existsSync(file.path)}`,
    );
    if (!fs.existsSync(file.path)) {
      throw new Error(
        `Sample file not found on disk: ${file.path}. Agent may need to re-upload.`,
      );
    }
    form.append("files", fs.createReadStream(file.path), {
      filename: file.originalName,
      contentType: "audio/mpeg",
    });
    filesAppended++;
  }

  console.log(
    `Sending ${filesAppended} file(s) to ElevenLabs for voice: ${voiceName}`,
  );

  if (filesAppended === 0) {
    throw new Error("No valid sample files found to send to ElevenLabs");
  }

  const response = await axios.post(
    "https://api.elevenlabs.io/v1/voices/add",
    form,
    {
      headers: {
        "xi-api-key": apiKey,
        ...form.getHeaders(),
      },
      timeout: 60000,
    },
  );

  return response.data;
}

async function generateSpeech(voiceId, text) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      text,
      model_id: "eleven_multilingual_v2",
    },
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer",
      timeout: 60000,
    },
  );

  return response.data;
}

// Agent uploads their voice sample
router.post("/upload", authenticateToken, (req, res, next) => {
    req.params.id = req.user.userId;
    next();
  },

  upload.array("files", 5),

  async (req, res) => {
    try {
      if (!req.files?.length) {
        return res.status(400).json({ error: "No audio files uploaded" });
      }

      const { voiceName } = req.body;
      if (!voiceName?.trim()) {
        return res.status(400).json({ error: "Voice name is required" });
      }

      const user = await User.findById(req.user.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Delete old sample files
      if (user.voiceSampleFiles?.length) {
        user.voiceSampleFiles.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }

      const sampleFiles = req.files.map((f) => ({
        path: f.path,
        originalName: f.originalname,
        uploadedAt: new Date(),
      }));

      user.voiceName = voiceName.trim();
      user.voiceStatus = "pending_review";
      user.voiceError = "";
      user.elevenLabsVoiceId = "";
      user.voiceSampleFiles = sampleFiles;
      user.voiceSampleUrl = `/uploads/voices/${req.files[0].filename}`;
      await user.save();

      res.json({
        success: true,
        message: "Voice sample submitted. Waiting for admin review.",
        voiceStatus: "pending_review",
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Gets all agents with their voice submission status
router.get("/admin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).select(
      "name email role voiceStatus voiceName elevenlabsVoiceId voiceError voiceSampleUrl voiceSampleFiles",
    );
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Triggers ElevenLabs cloning for an agent
router.post("/admin/:id/clone", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!user.voiceSampleFiles?.length) {
        return res
          .status(400)
          .json({ error: "No voice sample found for this agent" });
      }

      user.voiceStatus = "cloning";
      user.voiceError = "";
      await user.save();

      res.json({
        success: true,
        message: "Cloning started",
        voiceStatus: "cloning",
      });

      try {
        const voiceName = req.body.voiceName || user.voiceName || user.name;
        const result = await cloneVoiceWithElevenLabs(
          voiceName,
          user.voiceSampleFiles,
        );

        console.log("Elevenlabs clone result:", result);

        const clonedVoiceId = result.voice_id || result.voiceId || result.id;

        if (!clonedVoiceId) {
          throw new Error(
            `ElevenLabs clone succeeded but no voice_id returned: ${JSON.stringify(result)}`,
          );
        }

        user.voiceStatus = "cloned";
        user.elevenlabsVoiceId = clonedVoiceId;
        user.voiceName = voiceName;
        user.voiceError = "";
        await user.save();

        console.log(`Voice cloned for ${user.name}: ${clonedVoiceId}`);
      } catch (cloneErr) {
        console.error("Clone failed:", cloneErr.response?.data || cloneErr.message, );
        user.voiceStatus = "failed";
        user.voiceError =
          cloneErr.response?.data?.detail?.message ||
          cloneErr.message ||
          "Cloning failed";
        await user.save();
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Rejects a submitted sample
router.patch("/admin/:id/reject", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      user.voiceStatus = "rejected";
      user.voiceError = req.body.reason || "Sample rejected by admin";
      await user.save();

      res.json({ success: true, message: "Sample rejected" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Agent gets their own cloned voice info
router.get("/my-cloned", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "voiceStatus voiceName elevenlabsVoiceId voiceError voiceSampleUrl",
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      voiceStatus: user.voiceStatus || "none",
      voiceName: user.voiceName || "",
      elevenLabsVoiceId: user.elevenlabsVoiceId || "",
      voiceError: user.voiceError || "",
      voiceSampleUrl: user.voiceSampleUrl || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate TTS using agent's cloned voice
router.post("/tts/generate", authenticateToken, async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text?.trim())
      return res.status(400).json({ error: "Text is required" });
    if (!voiceId) return res.status(400).json({ error: "voiceId is required" });

    const mp3Bytes = await generateSpeech(voiceId, text);

    const TEMP_DIR = path.join(__dirname, "..", "uploads", "temp");
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const fileName = `tts_${req.user.userId}_${Date.now()}.mp3`;
    const filePath = path.join(TEMP_DIR, fileName);
    fs.writeFileSync(filePath, mp3Bytes);

    res.json({
      success: true,
      audioUrl: `/uploads/temp/${fileName}`,
    });
  } catch (err) {
    console.error("TTS generate error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.detail?.message || err.message,
    });
  }
});

// Remove voice
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.userId !== req.params.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.elevenLabsVoiceId) {
      const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
      if (apiKey) {
        await axios
          .delete(
            `https://api.elevenlabs.io/v1/voices/${user.elevenLabsVoiceId}`,
            {
              headers: { "xi-api-key": apiKey },
            },
          )
          .catch(() => {});
      }
    }

    // Delete local files
    if (user.voiceSampleFiles?.length) {
      user.voiceSampleFiles.forEach((f) => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }

    user.voiceStatus = "none";
    user.voiceName = "";
    user.elevenLabsVoiceId = "";
    user.voiceError = "";
    user.voiceSampleUrl = "";
    user.voiceSampleFiles = [];
    await user.save();

    res.json({ success: true, message: "Voice removed" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
