const express = require("express");
const crypto = require("crypto");
const AsteriskDevice = require("../models/AsteriskDevice");
const { generateAsteriskTTS } = require("../services/ttsService");
const {
  originateMicroSIPCall,
  hangupByExtensionPrefix,
} = require("../services/amiService");

const router = express.Router();

const activeCalls = new Map();

router.post("/map-device", async (req, res) => {
  try {
    const {
      userId,
      extension,
      sipChannel,
      didNumber,
      callerIdName,
      isActive = true,
    } = req.body;

    if (!userId || !extension) {
      return res.status(400).json({
        success: false,
        message: "userId and extension are required",
      });
    }

    const finalSipChannel = sipChannel || `SIP/${extension}`;

    const device = await AsteriskDevice.findOneAndUpdate(
      { userId },
      {
        userId,
        extension: String(extension).trim(),
        sipChannel: String(finalSipChannel).trim(),
        didNumber: didNumber || "",
        callerIdName: callerIdName || "",
        isActive: Boolean(isActive),
      },
      {
        upsert: true,
        new: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "SIP device mapped successfully",
      data: device,
    });
  } catch (error) {
    console.error("Map device error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to map SIP device",
    });
  }    
});

router.post("/call-with-tts", async (req, res) => {
  try {
    const { leadId, phoneNumber, agentId, text } = req.body;

    if (!agentId || !phoneNumber || !text) {
      return res.status(400).json({
        success: false,
        message: "agentId, phoneNumber and text are required",
      });
    }

    const device = await AsteriskDevice.findOne({
      userId: agentId,
      isActive: true,
    });

    console.log("Mapped device found:", device);

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "No active SIP mapping found for this user. Click 'Map My SIP' first.",
      });
    }

    const cleanedPhone = String(phoneNumber).replace(/[^\d+]/g, "");

    if (!cleanedPhone) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    const callId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const fileBase = `crm_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const ttsResult = await generateAsteriskTTS(text, fileBase);

    const playbackFile =
      typeof ttsResult === "string" ? ttsResult : ttsResult.playbackFile;

    const wavPath =
      typeof ttsResult === "string" ? null : ttsResult.wavPath;

    const remotePath =
      typeof ttsResult === "string" ? null : ttsResult.remotePath;

    console.log("Generated TTS:");
    console.log("playbackFile:", playbackFile);
    console.log("wavPath:", wavPath);
    console.log("remotePath:", remotePath);

    await originateMicroSIPCall({
      callId,
      sipChannel: device.sipChannel,
      agentExtension: device.extension,
      phoneNumber: cleanedPhone,
      ttsFile: playbackFile,
      callerIdName: device.callerIdName || "CRM",
    });

    activeCalls.set(callId, {
      callId,
      leadId: leadId || null,
      phoneNumber: cleanedPhone,
      agentId,
      agentExtension: device.extension,
      sipChannel: device.sipChannel,
      ttsFile: playbackFile,
      wavPath,
      remotePath,
      status: "dialing-microsip",
      createdAt: new Date(),
    });

    return res.json({
      success: true,
      message:
        "MicroSIP is being dialed. After answer, the lead will be called and TTS will play in-call.",
      callId,
      ttsFile: playbackFile,
      remotePath,
      agentExtension: device.extension,
      sipChannel: device.sipChannel,
      phoneNumber: cleanedPhone,
    });
  } catch (error) {
    console.error("Asterisk TTS call error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to start call",
    });
  }
});


router.post("/hangup", async (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        success: false,
        message: "callId is required",
      });
    }

    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    const result = await hangupByExtensionPrefix(activeCall.agentExtension);

    activeCalls.delete(callId);

    return res.json({
      success: true,
      message: "Call hangup requested",
      data: result,
    });
  } catch (error) {
    console.error("Hangup error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to hang up call",
    });
  }
});

module.exports = router;