const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AsteriskDevice = require("../models/AsteriskDevice");
const authMiddleware = require("../middleware/auth");

function buildSipChannel(extension = "", sipChannel = "") {
  const cleanExtension = String(extension || "").trim();
  const cleanSipChannel = String(sipChannel || "").trim();
  if (cleanSipChannel) return cleanSipChannel;
  if (cleanExtension) return `SIP/${cleanExtension}`;
  return "";
}

async function attachAsteriskDevices(users) {
  const userIds = users.map((u) => String(u._id));

  const devices = await AsteriskDevice.find({
    userId: { $in: userIds },
  }).lean();

  const deviceMap = new Map(devices.map((d) => [String(d.userId), d]));

  return users.map((user) => ({
    ...user.toObject(),
    asteriskDevice: deviceMap.get(String(user._id)) || null,
  }));
}

// Get all users (admin only)
router.get("/", authMiddleware(["admin"]), async (req, res) => {
  try {
    console.log("Admin user accessing /api/users:", req.user);

    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const usersWithDevices = await attachAsteriskDevices(users);

    console.log(`Found ${usersWithDevices.length} users`);
    res.json(usersWithDevices);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get(
  "/:id/name",
  authMiddleware(["admin", "opener", "closer"]),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select("name role");
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ name: user.name, role: user.role });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get single user by ID (admin only)
router.get("/:id", authMiddleware(["admin"]), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const device = await AsteriskDevice.findOne({
      userId: String(user._id),
    }).lean();

    res.json({
      ...user.toObject(),
      asteriskDevice: device || null,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user (admin only)
router.put("/:id", authMiddleware(["admin"]), async (req, res) => {
  try {
    const {
      name,
      role,
      password,
      extension,
      sipChannel,
      didNumber,
      callerIdName,
      isActive,
    } = req.body;

    const updateData = {
      name,
      role,
    };

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const hasAsteriskPayload =
      extension !== undefined ||
      sipChannel !== undefined ||
      didNumber !== undefined ||
      callerIdName !== undefined ||
      isActive !== undefined;

    if (hasAsteriskPayload) {
      const cleanExtension = String(extension || "").trim();

      if (cleanExtension) {
        await AsteriskDevice.findOneAndUpdate(
          { userId: String(user._id) },
          {
            userId: String(user._id),
            extension: cleanExtension,
            sipChannel: buildSipChannel(cleanExtension, sipChannel),
            didNumber: String(didNumber || "").trim(),
            callerIdName:
              String(callerIdName || "").trim() || `${user.name} (Sales)`,
            isActive:
              typeof isActive === "boolean" ? isActive : Boolean(isActive),
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
          }
        );
      }
    }

    const updatedDevice = await AsteriskDevice.findOne({
      userId: String(user._id),
    }).lean();

    res.json({
      ...user.toObject(),
      asteriskDevice: updatedDevice || null,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Delete user (admin only)
router.delete("/:id", authMiddleware(["admin"]), async (req, res) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await AsteriskDevice.deleteOne({ userId: String(user._id) });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;