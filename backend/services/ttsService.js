const fs = require("fs");
const path = require("path");
const axios = require("axios");
const util = require("util");
const { execFile } = require("child_process");
const SftpClient = require("ssh2-sftp-client");

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
    console.log("Uploading WAV to Asterisk server...");
    console.log("localPath:", localPath);
    console.log("remotePath:", remotePath);

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
    console.log("Upload complete:", remotePath);

    return remotePath;
  } catch (error) {
    throw new Error(`SFTP upload failed: ${error.message}`);
  } finally {
    try {
      await sftp.end();
    } catch (_) {}
  }
}

async function generateAsteriskTTS(text, fileBaseName) {
  const apiKey = (process.env.ELEVENLABS_API_KEY || "").trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim();

  const localTempDir = path.join(__dirname, "..", "uploads", "tts");
  const ffmpegPath =
    (process.env.FFMPEG_PATH || "").trim() ||
    (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  if (!voiceId) {
    throw new Error("Missing ELEVENLABS_VOICE_ID");
  }

  if (!text || !String(text).trim()) {
    throw new Error("TTS text is required");
  }

  const safeFileBase = sanitizeFileBase(fileBaseName || "tts");

  fs.mkdirSync(localTempDir, { recursive: true });

  const mp3Path = path.join(localTempDir, `${safeFileBase}.mp3`);
  const wavPath = path.join(localTempDir, `${safeFileBase}.wav`);

  console.log(
    "ElevenLabs key loaded:",
    apiKey ? `yes (${apiKey.length} chars)` : "no"
  );
  console.log("ElevenLabs voice loaded:", voiceId || "missing");
  console.log("Using ffmpeg path:", ffmpegPath);
  console.log("Safe TTS file base:", safeFileBase);

  try {
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
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
        },
      },
    });

    fs.writeFileSync(mp3Path, response.data);
  } catch (error) {
    const status = error.response?.status;
    const responseData = error.response?.data;

    if (status === 401) {
      throw new Error(
        "ElevenLabs 401 Unauthorized. Check ELEVENLABS_API_KEY and restart the backend."
      );
    }

    if (status === 400) {
      throw new Error(
        `ElevenLabs 400 Bad Request. Check ELEVENLABS_VOICE_ID or request payload. ${
          typeof responseData === "string"
            ? responseData
            : JSON.stringify(responseData || {})
        }`
      );
    }

    throw new Error(
      `ElevenLabs request failed${status ? ` (${status})` : ""}: ${
        typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData || error.message)
      }`
    );
  }

  try {
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
  } catch (error) {
    throw new Error(
      `FFmpeg conversion failed: ${error.message || "Unknown FFmpeg error"}`
    );
  }

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

module.exports = {
  generateAsteriskTTS,
  sanitizeFileBase,
};