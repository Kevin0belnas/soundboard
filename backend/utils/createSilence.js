// Run once to create a 100ms silence file for dynamic segments with no text
const { execSync } = require("child_process");
const path = require("path");
const fs   = require("fs");
const ffmpegPath = require("ffmpeg-static");

const outDir = path.join(__dirname, "..", "uploads", "audio");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const silencePath = path.join(outDir, "silence_100ms.mp3");

execSync(
  `"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -acodec libmp3lame "${silencePath}"`
);

console.log("Silence file created at:", silencePath);