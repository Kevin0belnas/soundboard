const mongoose = require("mongoose");

const ttsCacheSchema = new mongoose.Schema(
  {
    cacheKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
    },
    voiceId: {
      type: String,
      required: true,
      trim: true,
    },
    modelId: {
      type: String,
      required: true,
      default: "eleven_multilingual_v2",
      trim: true,
    },
    settingsHash: {
      type: String,
      required: true,
      trim: true,
    },
    playbackFile: {
      type: String,
      required: true,
      trim: true,
    },
    wavPath: {
      type: String,
      default: "",
      trim: true,
    },
    remotePath: {
      type: String,
      default: "",
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ["script", "subscript", "manual", "starter", "other"],
      default: "other",
    },
    sourceId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "tts_cache",
  }
);

module.exports = mongoose.models.TtsCache || mongoose.model("TtsCache", ttsCacheSchema);