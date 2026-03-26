const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const CACHE_DIR = path.join(__dirname, "..", "uploads", "dynamic-cache");

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getCacheKey(text) {
  // Hash the text so the filename is safe regardless of content
  return crypto.createHash("md5").update(text.trim().toLowerCase()).digest("hex");
}

function getCachedPath(text) {
  ensureCacheDir();
  const key = getCacheKey(text);
  const filePath = path.join(CACHE_DIR, `${key}.mp3`);
  return { filePath, exists: fs.existsSync(filePath) };
}

module.exports = { getCachedPath };