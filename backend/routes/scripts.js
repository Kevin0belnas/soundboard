const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Script = require("../models/Script");
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

// Helper function to create logs
const createLog = async (req, action, details) => {
  try {
    const log = new Log({
      action,
      user: req.user.userId,
      details,
      ip: req.ip || req.connection.remoteAddress
    });
    await log.save();
    console.log(`✅ Log created: ${action}`);
  } catch (error) {
    console.error("❌ Error creating log:", error);
  }
};

// Get all scripts (protected)
router.get("/", authenticateToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.role !== "admin") {
      const User = require("../models/User");
      const admins = await User.find({ role: "admin" }).select("_id");
      const adminIds = admins.map((admin) => admin._id);

      query = {
        $or: [
          { author: req.user.userId },
          { author: { $in: adminIds } }
        ]
      };
    }

    const scripts = await Script.find(query)
      .populate("author", "_id name email")
      .sort({ createdAt: -1 });

    res.json(scripts);
  } catch (error) {
    console.error("Error fetching scripts:", error);
    await createLog(req, "error", {
      error: error.message,
      action: "fetch_scripts"
    });
    res.status(500).json({ error: error.message });
  }
});

// Create script (protected)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, content, type } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    if (!req.user.userId) {
      return res.status(400).json({ error: "Invalid user token" });
    }

    let finalType = type || "general";

    if (req.user.role === "closer") {
      finalType = "closer";
    } else if (req.user.role === "opener") {
      finalType = "opener";
    }

    const scriptData = {
      title,
      content,
      type: finalType,
      author: req.user.userId
    };

    const script = new Script(scriptData);
    const savedScript = await script.save();

    await savedScript.populate("author", "_id name email");

    await createLog(req, "create_script", {
      scriptId: savedScript._id,
      title: savedScript.title,
      type: savedScript.type,
      message: `Created script: ${savedScript.title}`
    });

    res.status(201).json(savedScript);
  } catch (error) {
    console.error("❌ Error creating script:", error);

    await createLog(req, "error", {
      error: error.message,
      action: "create_script",
      body: req.body
    });

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// Update script (protected)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, content, type } = req.body;
    const scriptId = req.params.id;

    const script = await Script.findById(scriptId);

    if (!script) {
      await createLog(req, "error", {
        error: "Script not found",
        scriptId,
        action: "update_script"
      });
      return res.status(404).json({ error: "Script not found" });
    }

    const isAuthor = script.author.toString() === req.user.userId;
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      await createLog(req, "unauthorized", {
        scriptId,
        userId: req.user.userId,
        action: "update_script",
        message: "User attempted to update a script they did not create"
      });
      return res.status(403).json({ error: "Only the creator or admin can edit this script" });
    }

    const oldValues = {
      title: script.title,
      content: script.content,
      type: script.type
    };

    script.title = title || script.title;
    script.content = content || script.content;

    if (req.user.role === "closer") {
      script.type = "closer";
    } else if (req.user.role === "opener") {
      script.type = "opener";
    } else {
      script.type = type || script.type;
    }

    script.updatedAt = Date.now();

    await script.save();
    await script.populate("author", "_id name email");

    await createLog(req, "update_script", {
      scriptId: script._id,
      title: script.title,
      oldValues,
      newValues: { title, content, type: script.type },
      message: `Updated script: ${script.title}`
    });

    res.json(script);
  } catch (error) {
    console.error("Error updating script:", error);

    await createLog(req, "error", {
      error: error.message,
      scriptId: req.params.id,
      action: "update_script"
    });

    res.status(500).json({ error: error.message });
  }
});

// Delete script (protected)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const scriptId = req.params.id;

    const script = await Script.findById(scriptId);

    if (!script) {
      await createLog(req, "error", {
        error: "Script not found",
        scriptId,
        action: "delete_script"
      });
      return res.status(404).json({ error: "Script not found" });
    }

    const isAuthor = script.author.toString() === req.user.userId;
    const isAdmin = req.user.role === "admin";

    if (!isAuthor && !isAdmin) {
      await createLog(req, "unauthorized", {
        scriptId,
        userId: req.user.userId,
        action: "delete_script",
        message: "User attempted to delete a script they did not create"
      });
      return res.status(403).json({ error: "Only the creator or admin can delete this script" });
    }

    const deletedScriptInfo = {
      id: script._id,
      title: script.title,
      type: script.type
    };

    await Script.findByIdAndDelete(scriptId);

    await createLog(req, "delete_script", {
      scriptId: deletedScriptInfo.id,
      title: deletedScriptInfo.title,
      type: deletedScriptInfo.type,
      message: `Deleted script: ${deletedScriptInfo.title}`
    });

    res.json({ message: "Script deleted successfully" });
  } catch (error) {
    console.error("Error deleting script:", error);

    await createLog(req, "error", {
      error: error.message,
      scriptId: req.params.id,
      action: "delete_script"
    });

    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
