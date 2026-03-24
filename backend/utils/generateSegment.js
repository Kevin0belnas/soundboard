const fs = require("fs");

async function generateSegment(text, filePath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) throw new Error("Missing ElevenLabs env");

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
        text: text.trim(),
        model_id: "eleven_turbo_v2_5",
        // model_id: "eleven_multilingual_v2", mas need daghan credits
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error: ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);
}

module.exports = { generateSegment };
