const { execSync } = require("child_process");
const fs = require("fs"); 
const ffmpegPath = require("ffmpeg-static");

function stitchAudio(inputPaths, outputPath) {
  // Build a ffmpeg concat list file
  const listContent = inputPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  const listFile = outputPath + ".txt";
  fs.writeFileSync(listFile, listContent);

  try {
    execSync(
      `"${ffmpegPath}" -y -f concat -safe 0 -i "${listFile}" -acodec libmp3lame -q:a 4 "${outputPath}"`,
      { stdio: "pipe" }
    );
  } finally {
    // Clean up the temp list file
    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  }
}

module.exports = { stitchAudio };