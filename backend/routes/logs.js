const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Log = require("../models/Log");

const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

// Middleware to verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "Access denied" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Get all logs (protected)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const logs = await Log.find()
      .populate("user", "name email")
      .sort({ timestamp: -1 });
    
    // Keep all original fields - don't transform or remove anything
    res.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;