const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const AsteriskDevice = require("../models/AsteriskDevice");
const { generateAsteriskTTS } = require("../services/ttsService");
const {
  originateConferenceCall,
  originateLeadToConference,
  queueTtsToConference,
  hangupConference,
  waitForLeadAnswered,
} = require("../services/amiService");

const router = express.Router();

const activeCalls = new Map();

function sanitizePhoneNumber(phone = "") {
  return String(phone).replace(/[^\d+]/g, "");
}

function estimatePlaybackMs(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return 4000;

  const words = clean.split(/\s+/).filter(Boolean).length;
  const wpm = 145;
  const minutes = words / wpm;
  const ms = Math.ceil(minutes * 60 * 1000) + 1500;

  return Math.max(ms, 3000);
}

function normalizeObjectId(id) {
  const value = String(id || "").trim();
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

async function buildPlaybackFileFromText(text, prefix = "crm", meta = {}) {
  const safePrefix = sanitizeFileBase(prefix || "crm");
  const fileBase = `${safePrefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const ttsResult = await generateAsteriskTTS(text, fileBase, meta);

  const playbackFile =
    typeof ttsResult === "string" ? ttsResult : ttsResult.playbackFile;

  const wavPath = typeof ttsResult === "string" ? null : ttsResult.wavPath;
  const remotePath =
    typeof ttsResult === "string" ? null : ttsResult.remotePath;

  return {
    playbackFile,
    wavPath,
    remotePath,
    fromCache: !!ttsResult?.fromCache,
  };
}

async function getUserAsteriskDevice(userId) {
  const userObjectId = normalizeObjectId(userId);

  if (!userObjectId) {
    throw new Error("Valid userId is required");
  }

  const device = await AsteriskDevice.findOne({
    userId: userObjectId,
    isActive: true,
  });

  if (!device) {
    throw new Error(
      "No active Asterisk device found for this account. Add or enable the agent's Asterisk device first."
    );
  }

  return device;
}

async function processTtsQueue(callId) {
  const call = activeCalls.get(callId);
  if (!call || call.ended || call.ttsBusy) return;

  const item = call.ttsQueue.shift();
  if (!item) {
    call.status = "bridged";
    call.currentTts = null;
    return;
  }

  call.ttsBusy = true;
  call.status = "playing-tts";
  call.currentTts = {
    scriptId: item.scriptId,
    title: item.title,
    queuedAt: item.queuedAt,
  };

  try {
    await queueTtsToConference({
      callId: call.callId,
      confId: call.confId,
      ttsFile: item.ttsFile,
    });

    setTimeout(() => {
      const latest = activeCalls.get(callId);
      if (!latest || latest.ended) return;

      latest.ttsBusy = false;
      latest.currentTts = null;
      latest.status = latest.ttsQueue.length > 0 ? "queued-tts" : "bridged";

      processTtsQueue(callId).catch((err) => {
        console.error("Queue processing error:", err);
      });
    }, item.durationMs);
  } catch (error) {
    console.error("Conference TTS play error:", error);

    call.ttsBusy = false;
    call.currentTts = null;
    call.status = call.ttsQueue.length > 0 ? "queued-tts" : "bridged";

    processTtsQueue(callId).catch((err) => {
      console.error("Queue retry error:", err);
    });
  }
}

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

    const userObjectId = normalizeObjectId(userId);

    if (!userObjectId || !extension) {
      return res.status(400).json({
        success: false,
        message: "userId and extension are required",
      });
    }

    const finalSipChannel = sipChannel || `SIP/${extension}`;

    const device = await AsteriskDevice.findOneAndUpdate(
      { userId: userObjectId },
      {
        userId: userObjectId,
        extension: cleanExtension,
        sipChannel: finalSipChannel,
        didNumber: didNumber ? String(didNumber).trim() : "",
        callerIdName: callerIdName ? String(callerIdName).trim() : "",
        isActive: Boolean(isActive),
      },
      {
        upsert: true,
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
      message: error.message || "Failed to save Asterisk device",
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

    const starterTts = await buildPlaybackFileFromText(text, "crm_starter", {
      sourceType: "starter",
      sourceId: scriptId || "",
    });

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
      remotePath: starterTts.remotePath,
      wavPath: starterTts.wavPath,
      ttsBusy: true,
      currentTts: {
        scriptId: scriptId || "starter",
        title: scriptTitle || "Starter Script",
      },
      ttsQueue: [
        {
          scriptId: scriptId || "starter",
          title: scriptTitle || "Starter Script",
          ttsFile: starterTts.playbackFile,
          durationMs: estimatePlaybackMs(text),
          queuedAt: new Date(),
          remotePath: starterTts.remotePath,
          wavPath: starterTts.wavPath,
        },
      ],
      ended: false,
    });

    setTimeout(async () => {
      try {
        const activeCall = activeCalls.get(callId);
        if (!activeCall || activeCall.ended) return;

        // IMPORTANT: start listening BEFORE we originate the lead leg
        const leadAnsweredPromise = waitForLeadAnswered({
          callId,
          timeoutMs: 45000,
        });

        await originateLeadToConference({
          callId,
          confId,
          phoneNumber: cleanedPhone,
          callerIdName: device.callerIdName || "CRM",
        });

        activeCall.status = "dialing-lead";

        await leadAnsweredPromise;

        const latest = activeCalls.get(callId);
        if (!latest || latest.ended) return;

        latest.status = "bridged";
        latest.ttsBusy = false;
        latest.currentTts = null;

        processTtsQueue(callId).catch((err) => {
          console.error("Starter queue processing error:", err);
        });
      } catch (err) {
        console.error("Lead answer wait error:", err);

        const latest = activeCalls.get(callId);
        if (latest && !latest.ended) {
          latest.status = "lead-no-answer";
          latest.ttsQueue = [];
          latest.ttsBusy = false;
          latest.currentTts = null;
        }
      }
    }, 2500);

    return res.json({
      success: true,
      message:
        "Call started. Starter TTS will play only after the lead answers.",
      callId,
      confId,
      starterTtsFile: starterTts.playbackFile,
      remotePath: starterTts.remotePath,
      fromCache: starterTts.fromCache,
      agentExtension: device.extension,
      sipChannel: device.sipChannel,
      phoneNumber: cleanedPhone,
      status: "dialing-agent",
    });
  } catch (error) {
    console.error("Asterisk TTS call error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to start call",
    });
  }
});

router.post("/play-tts-in-call", async (req, res) => {
  try {
    const { callId, text, scriptId, title } = req.body;

    if (!callId || !text) {
      return res.status(400).json({
        success: false,
        message: "callId and text are required",
      });
    }

    const activeCall = activeCalls.get(callId);

    if (!activeCall || activeCall.ended) {
      return res.status(404).json({
        success: false,
        message: "Live call not found",
      });
    }

    const safeScriptId = sanitizeFileBase(scriptId || "script");

    const generated = await buildPlaybackFileFromText(
      text,
      `crm_script_${safeScriptId}`,
      {
        sourceType: "subscript",
        sourceId: scriptId || "",
      }
    );

    const queueItem = {
      scriptId: scriptId || `script_${Date.now()}`,
      title: title || "Script",
      ttsFile: generated.playbackFile,
      durationMs: estimatePlaybackMs(text),
      queuedAt: new Date(),
      remotePath: generated.remotePath,
      wavPath: generated.wavPath,
    };

    activeCall.ttsQueue.push(queueItem);

    if (activeCall.ttsBusy) {
      activeCall.status = "queued-tts";
    } else {
      processTtsQueue(callId).catch((err) => {
        console.error("Manual play queue error:", err);
      });
    }

    return res.json({
      success: true,
      message: activeCall.ttsBusy
        ? "Script added to queue"
        : "Script is now being played in the live call",
      callId,
      confId: activeCall.confId,
      queueLength: activeCall.ttsQueue.length,
      ttsBusy: activeCall.ttsBusy,
      playbackFile: generated.playbackFile,
      fromCache: generated.fromCache,
    });
  } catch (error) {
    console.error("Play TTS in call error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to play script in call",
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