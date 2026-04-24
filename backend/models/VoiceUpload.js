const mongoose = require("mongoose");

const VoiceUploadSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    voiceName: {
      type: String,
      required: true,
      trim: true,
    },

    sampleFiles: [
      {
        originalName: String,
        fileName: String,
        filePath: String,
        mimeType: String,
        size: Number,
      },
    ],

    status: {
      type: String,
      enum: [
        "pending_review",
        "approved",
        "cloning",
        "cloned",
        "rejected",
        "failed",
      ],
      default: "pending_review",
    },

    elevenLabsVoiceId: {
      type: String,
      default: null,
    },

    adminNotes: {
      type: String,
      default: "",
    },

    clonedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("VoiceUpload", VoiceUploadSchema);
