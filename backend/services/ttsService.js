const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const util = require("util");
const { execFile } = require("child_process");
const SftpClient = require("ssh2-sftp-client");
const TtsCache = require("../models/TtsCache");

const execFileAsync = util.promisify(execFile);

function sanitizeFileBase(fileBase = "tts") {
  return (
    String(fileBase)
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "tts"
  );
}

function buildSettingsHash({ modelId, voiceSettings }) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        modelId,
        voiceSettings,
      })
    )
    .digest("hex");
}

function buildTtsCacheKey({ text, voiceId, modelId, voiceSettings }) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        text: String(text || "").trim(),
        voiceId,
        modelId,
        voiceSettings,
      })
    )
    .digest("hex");
}

async function uploadToAsteriskServer(localPath, remoteFileName) {
  const sftp = new SftpClient();

  const host = process.env.ASTERISK_HOST;
  const port = Number(process.env.ASTERISK_SSH_PORT || 22);
  const username = process.env.ASTERISK_SSH_USER;
  const password = process.env.ASTERISK_SSH_PASSWORD;
  const remoteDir =
    process.env.ASTERISK_REMOTE_SOUNDS_DIR || "/var/lib/asterisk/sounds/tts";

  if (!host || !username || !password) {
    throw new Error(
      "Missing ASTERISK_HOST / ASTERISK_SSH_USER / ASTERISK_SSH_PASSWORD"
    );
  }

  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file does not exist: ${localPath}`);
  }

  const safeRemoteFileName =
    sanitizeFileBase(path.basename(remoteFileName, path.extname(remoteFileName))) +
    path.extname(remoteFileName || ".wav");

  const remotePath = `${remoteDir.replace(/\/+$/, "")}/${safeRemoteFileName}`;

  try {
    await sftp.connect({
      host,
      port,
      username,
      password,
    });

    const exists = await sftp.exists(remoteDir);
    if (!exists) {
      await sftp.mkdir(remoteDir, true);
    }

    await sftp.put(localPath, remotePath);
    return remotePath;
  } catch (error) {
    throw new Error(`SFTP upload failed: ${error.message}`);
  } finally {
    try {
      await sftp.end();
    } catch (_) {}
  }
}

async function generateFreshTTS({
  text,
  fileBaseName,
  apiKey,
  voiceId,
  modelId,
  voiceSettings,
}) {
  const localTempDir = path.join(__dirname, "..", "uploads", "tts");
  const ffmpegPath =
    (process.env.FFMPEG_PATH || "").trim() ||
    (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

  fs.mkdirSync(localTempDir, { recursive: true });

  const safeFileBase = sanitizeFileBase(fileBaseName || "tts");
  const mp3Path = path.join(localTempDir, `${safeFileBase}.mp3`);
  const wavPath = path.join(localTempDir, `${safeFileBase}.wav`);

  const response = await axios({
    method: "post",
    url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    responseType: "arraybuffer",
    timeout: 60000,
    data: {
      text: String(text),
      model_id: modelId,
      voice_settings: voiceSettings,
    },
  });

  fs.writeFileSync(mp3Path, response.data);

  await execFileAsync(ffmpegPath, [
    "-y",
    "-i",
    mp3Path,
    "-ar",
    "8000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ]);

  const remoteFileName = `${safeFileBase}.wav`;
  const remotePath = await uploadToAsteriskServer(wavPath, remoteFileName);

  try {
    fs.unlinkSync(mp3Path);
  } catch (_) {}

  return {
    playbackFile: `tts/${safeFileBase}`,
    wavPath,
    remotePath,
  };
}

async function generateAsteriskTTS(text, fileBaseName, meta = {}) {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();
  const modelId = "eleven_multilingual_v2";
  const voiceSettings = {
    stability: 0.4,
    similarity_boost: 0.8,
  };

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID");
  }

  if (!text || !String(text).trim()) {
    throw new Error("TTS text is required");
  }

  const cleanText = String(text).trim();

  const cacheKey = buildTtsCacheKey({
    text: cleanText,
    voiceId,
    modelId,
    voiceSettings,
  });

  const settingsHash = buildSettingsHash({
    modelId,
    voiceSettings,
  });

  const existing = await TtsCache.findOne({ cacheKey }).lean();

  if (existing) {
    return {
      playbackFile: existing.playbackFile,
      wavPath: existing.wavPath,
      remotePath: existing.remotePath,
      fromCache: true,
    };
  }

  const fresh = await generateFreshTTS({
    text: cleanText,
    fileBaseName,
    apiKey,
    voiceId,
    modelId,
    voiceSettings,
  });

  try {
    await TtsCache.create({
      cacheKey,
      text: cleanText,
      voiceId,
      modelId,
      settingsHash,
      playbackFile: fresh.playbackFile,
      wavPath: fresh.wavPath || "",
      remotePath: fresh.remotePath || "",
      sourceType: meta.sourceType || "other",
      sourceId: meta.sourceId || "",
    });
  } catch (error) {
    if (error?.code === 11000) {
      const cached = await TtsCache.findOne({ cacheKey }).lean();
      if (cached) {
        return {
          playbackFile: cached.playbackFile,
          wavPath: cached.wavPath,
          remotePath: cached.remotePath,
          fromCache: true,
        };
      }
    }
    throw error;
  }

  return {
    ...fresh,
    fromCache: false,
  };
}

module.exports = {
  generateAsteriskTTS,
  sanitizeFileBase,
  buildTtsCacheKey,
};