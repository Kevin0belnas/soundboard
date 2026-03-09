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
    enum: ["user", "admin", "editor"], 
    default: "user" 
  },
  agentType: {
    type: String,
    enum: ["opener", "closer", "general"],
    default: "general"
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date 
  }
});

// Method to compare password (optional but useful)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);