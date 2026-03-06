const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Log = require("../models/Log"); // Import Log model

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// Helper function to create logs
const createLog = async (action, details, req = null) => {
  try {
    const logData = {
      action,
      details,
      ip: req?.ip || req?.connection?.remoteAddress || "unknown",
      userAgent: req?.get("user-agent")
    };

    // If there's a user ID in the details, add it to the log
    if (details?.userId) {
      logData.user = details.userId;
    }

    const log = new Log(logData);
    await log.save();
    console.log(`✅ Auth log created: ${action}`);
  } catch (error) {
    console.error("❌ Error creating auth log:", error);
    // Don't throw - logging should not break the main operation
  }
};

// Login route - UPDATED WITH LOGGING
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Use the User model
    const user = await User.findOne({ email });
    
    if (!user) {
      // Log failed login attempt (user not found)
      await createLog("login_failed", {
        email,
        reason: "User not found",
        ip: req.ip
      }, req);
      
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      // Log failed login attempt (wrong password)
      await createLog("login_failed", {
        userId: user._id,
        email: user.email,
        reason: "Invalid password",
        ip: req.ip
      }, req);
      
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role, 
        name: user.name 
      }, 
      JWT_SECRET, 
      { expiresIn: "8h" }
    );

    // LOG SUCCESSFUL LOGIN
    await createLog("login_success", {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      message: `User ${user.name} logged in successfully`
    }, req);

    res.json({ 
      token, 
      role: user.role, 
      name: user.name,
      userId: user._id 
    });
    
  } catch (error) {
    console.error("Login error:", error);
    
    // LOG ERROR
    await createLog("login_error", {
      error: error.message,
      stack: error.stack,
      body: req.body
    }, req);
    
    res.status(500).json({ error: "Internal server error" });
  }
});

// Register route - UPDATED WITH LOGGING
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Log registration attempt with existing email
      await createLog("registration_failed", {
        email,
        reason: "User already exists",
        ip: req.ip
      }, req);
      
      return res.status(400).json({ error: "User already exists" });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      name,
      role: role || "user"
    });
    
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    
    // LOG SUCCESSFUL REGISTRATION
    await createLog("registration_success", {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      message: `New user registered: ${user.name}`
    }, req);
    
    res.status(201).json({ 
      token, 
      role: user.role, 
      name: user.name,
      userId: user._id 
    });
    
  } catch (error) {
    console.error("Registration error:", error);
    
    // LOG ERROR
    await createLog("registration_error", {
      error: error.message,
      stack: error.stack,
      body: req.body
    }, req);
    
    res.status(500).json({ error: "Internal server error" });
  }
});

// Logout route (optional - for tracking)
router.post("/logout", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // LOG LOGOUT
        await createLog("logout", {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          message: `User ${decoded.name} logged out`
        }, req);
      } catch (err) {
        // Token might be expired, but we still want to log the logout attempt
        await createLog("logout_attempt", {
          message: "Logout attempt with invalid/expired token"
        }, req);
      }
    }
    
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user info (protected)
router.get("/me", async (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // LOG PROFILE VIEW
    await createLog("profile_view", {
      userId: user._id,
      email: user.email,
      name: user.name,
      message: `User viewed their profile`
    }, req);

    res.json(user);
  } catch (error) {
    console.error("Auth error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;