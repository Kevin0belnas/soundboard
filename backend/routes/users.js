// routes/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

// Get all users (admin only) - using authMiddleware with ['admin'] role
router.get("/", authMiddleware(['admin']), async (req, res) => {
  try {
    console.log("Admin user accessing /api/users:", req.user); // Debug log

    const users = await User.find().select("-password").sort({ createdAt: -1 });
    console.log(`Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single user by ID (admin only)
router.get("/:id", authMiddleware(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user (admin only)
router.put("/:id", authMiddleware(['admin']), async (req, res) => {
  try {
    const { name, role, agentType, password } = req.body;
    
    // Build update object
    const updateData = { 
      name, 
      role, 
      agentType 
    };

    // If password is provided, hash it
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user (admin only)
router.delete("/:id", authMiddleware(['admin']), async (req, res) => {
  try {
    // Prevent deleting yourself
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;