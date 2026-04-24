const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ["admin", "opener", "closer"], 
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date 
  },
  voiceStatus: {
    type: String,
    enum: ["none", "pending_review", "cloning", "cloned", "rejected", "failed"],
    default: "none",
  },
  voiceName: {
    type: String,
    default: "",
  },
  elevenlabsVoiceId: {
    type: String,
    default: "",
  },
  voiceError: {
    type: String,
    default: "",
  },
  voiceSampleFiles: [
    {
      path: {
        type: String,
      },
      originalName: {
        type: String,
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      },
    },
  ],
  voiceSampleUrl: {
    type: String,
    default: "",
  },
});

// Method to compare password (optional but useful)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);