const mongoose = require("mongoose");

const asteriskDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    extension: {
      type: String,
      required: true,
      trim: true,
    },
    sipChannel: {
      type: String,
      required: true,
      trim: true,
    },
    didNumber: {
      type: String,
      default: "",
      trim: true,
    },
    callerIdName: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AsteriskDevice", asteriskDeviceSchema);