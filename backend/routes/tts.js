const express = require("express");
const router = express.Router();

// POST /api/tts/speak
router.post("/speak", async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Text is required.",
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const selectedVoiceId = voiceId || defaultVoiceId;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Missing ELEVENLABS_API_KEY in backend .env",
      });
    }

    if (!selectedVoiceId) {
      return res.status(500).json({
        success: false,
        message: "Missing ELEVENLABS_VOICE_ID in backend .env",
      });
    }

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();
      console.error("ElevenLabs error:", elevenResponse.status, errorText);

      return res.status(elevenResponse.status).json({
        success: false,
        message: "ElevenLabs request failed",
        details: errorText,
      });
    }

    const audioBuffer = Buffer.from(await elevenResponse.arrayBuffer());

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "no-store",
    });

    return res.send(audioBuffer);
  } catch (error) {
    console.error("TTS server error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while generating speech.",
      details: error.message,
    });
  }
});

module.exports = router;