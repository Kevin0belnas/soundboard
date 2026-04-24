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
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
};

// Multer 
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

  for (const file of sampleFiles) {
    if (!fs.existsSync(file.path)) {
      throw new Error(`Sample file not found: ${file.originalName}`);
    }
    form.append("files[]", fs.createReadStream(file.path), file.originalName);
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
    }
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
    }
  );

  return response.data; 
}

// Agent uploads their voice sample
router.post("/upload", authenticateToken, (req, res, next) => {
    // inject userId into params so multer filename uses it
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
  }
);

// Admin gets all agents with their voice submission status
router.get("/admin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "admin" } }).select(
      "name email role voiceStatus voiceName elevenLabsVoiceId voiceError voiceSampleUrl voiceSampleFiles"
    );
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin triggers ElevenLabs cloning for an agent
router.post("/admin/:id/clone", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.voiceSampleFiles?.length) {
      return res.status(400).json({ error: "No voice sample found for this agent" });
    }

    user.voiceStatus = "cloning";
    user.voiceError = "";
    await user.save();

    res.json({
      success: true,
      message: "Cloning started",
      voiceStatus: "cloning",
    });

    // Background clone
    try {
      const voiceName = req.body.voiceName || user.voiceName || user.name;
      const result = await cloneVoiceWithElevenLabs(voiceName, user.voiceSampleFiles);

      user.voiceStatus = "cloned";
      user.elevenLabsVoiceId = result.voice_id;
      user.voiceName = voiceName;
      user.voiceError = "";
      await user.save();

      console.log(`Voice cloned for ${user.name}: ${result.voice_id}`);
    } catch (cloneErr) {
      console.error("Clone failed:", cloneErr.response?.data || cloneErr.message);
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
});

// Admin rejects a submitted sample
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
});

// Agent gets their own cloned voice info
router.get("/my-cloned", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "voiceStatus voiceName elevenLabsVoiceId voiceError voiceSampleUrl"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      success: true,
      voiceStatus: user.voiceStatus || "none",
      voiceName: user.voiceName || "",
      elevenLabsVoiceId: user.elevenLabsVoiceId || "",
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

    if (!text?.trim()) return res.status(400).json({ error: "Text is required" });
    if (!voiceId) return res.status(400).json({ error: "voiceId is required" });

    const mp3Bytes = await generateSpeech(voiceId, text);

    // Save to temp dir and return URL
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

    // Delete from ElevenLabs
    if (user.elevenLabsVoiceId) {
      const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
      if (apiKey) {
        await axios
          .delete(`https://api.elevenlabs.io/v1/voices/${user.elevenLabsVoiceId}`, {
            headers: { "xi-api-key": apiKey },
          })
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
































// const express = require("express");
// const multer = require("multer");
// const axios = require("axios");
// const FormData = require("form-data");
// const fs = require("fs");

// const router = express.Router();
// const upload = multer({ dest: "uploads/voices/" });

// router.post("/clone", upload.array("files", 5), async (req, res) => {
//   try {
//     const { name } = req.body;

//     if (!name || !req.files || req.files.length === 0) {
//       return res.status(400).json({
//         error: "Voice name and audio files are required",
//       });
//     }

//     const form = new FormData();
//     form.append("name", name);
//     form.append("remove_background_noise", "true");

//     req.files.forEach((file) => {
//       form.append("files", fs.createReadStream(file.path), file.originalname);
//     });

//     const response = await axios.post(
//       "https://api.elevenlabs.io/v1/voices/ivc",
//       form,
//       {
//         headers: {
//           "xi-api-key": process.env.ELEVENLABS_API_KEY,
//           ...form.getHeaders(),
//         },
//       }
//     );

//     res.json({
//       message: "Voice cloned successfully",
//       voiceId: response.data.voice_id,
//       data: response.data,
//     });
//   } catch (error) {
//     console.error("ElevenLabs clone error:", error.response?.data || error.message);

//     res.status(500).json({
//       error: "Failed to clone voice",
//       details: error.response?.data || error.message,
//     });
//   } finally {
//     if (req.files) {
//       req.files.forEach((file) => {
//         fs.unlink(file.path, () => {});
//       });
//     }
//   }
// });

// router.post("/tts", async (req, res) => {
//   try {
//     const { voiceId, text } = req.body;

//     const response = await axios.post(
//       `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
//       {
//         text,
//         model_id: "eleven_multilingual_v2",
//       },
//       {
//         headers: {
//           "xi-api-key": process.env.ELEVENLABS_API_KEY,
//           "Content-Type": "application/json",
//         },
//         responseType: "arraybuffer",
//       }
//     );

//     res.setHeader("Content-Type", "audio/mpeg");
//     res.send(response.data);
//   } catch (error) {
//     console.error("TTS error:", error.response?.data || error.message);

//     res.status(500).json({
//       error: "Failed to generate TTS",
//     });
//   }
// });

// module.exports = router;