const mongoose = require("mongoose");

const scriptSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["opener", "closer", "general"],
      default: "general",
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    voiceId: {
      type: String,
      default: "",
    },
    audioUrl: {
      type: String,
      default: "",
    },
    audioFileName: {
      type: String,
      default: "",
    },
    audioStatus: {
      type: String,
      enum: ["pending", "generating", "ready", "failed"],
      default: "pending",
    },
    audioError: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Script", scriptSchema);