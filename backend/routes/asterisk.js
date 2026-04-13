const express = require("express");
const crypto = require("crypto");
const AsteriskDevice = require("../models/AsteriskDevice");
const { generateAsteriskTTS, sanitizeFileBase } = require("../services/ttsService");
const {
  originateConferenceCall,
  originateLeadToConference,
  queueTtsToConference,
  hangupConference,
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

async function buildPlaybackFileFromText(text, prefix = "crm") {
  const safePrefix = sanitizeFileBase(prefix || "crm");
  const fileBase = `${safePrefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const ttsResult = await generateAsteriskTTS(text, fileBase);

  const playbackFile =
    typeof ttsResult === "string" ? ttsResult : ttsResult.playbackFile;

  const wavPath = typeof ttsResult === "string" ? null : ttsResult.wavPath;
  const remotePath =
    typeof ttsResult === "string" ? null : ttsResult.remotePath;

  return {
    playbackFile,
    wavPath,
    remotePath,
  };
}

async function getUserAsteriskDevice(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new Error("Valid userId is required");
  }

  const device = await AsteriskDevice.findOne({
    userId: normalizedUserId,
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

    const normalizedUserId = String(userId || "").trim();

    if (!normalizedUserId || !extension) {
      return res.status(400).json({
        success: false,
        message: "Valid userId and extension are required",
      });
    }

    const cleanExtension = String(extension).trim();
    const finalSipChannel = String(
      sipChannel || `SIP/${cleanExtension}`
    ).trim();

    const device = await AsteriskDevice.findOneAndUpdate(
      { userId: normalizedUserId },
      {
        userId: normalizedUserId,
        extension: cleanExtension,
        sipChannel: finalSipChannel,
        didNumber: didNumber ? String(didNumber).trim() : "",
        callerIdName: callerIdName ? String(callerIdName).trim() : "",
        isActive: Boolean(isActive),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Asterisk device saved successfully",
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

router.get("/device/:userId", async (req, res) => {
  try {
    const device = await getUserAsteriskDevice(req.params.userId);

    return res.json({
      success: true,
      data: device,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message || "Device not found",
    });
  }
});

router.post("/call-with-tts", async (req, res) => {
  try {
    const { leadId, phoneNumber, agentId, text, scriptId, scriptTitle } =
      req.body;

    if (!agentId || !phoneNumber || !text) {
      return res.status(400).json({
        success: false,
        message: "agentId, phoneNumber and text are required",
      });
    }

    const device = await getUserAsteriskDevice(agentId);

    const cleanedPhone = sanitizePhoneNumber(phoneNumber);
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

    const confId = `crm_${callId.replace(/[^a-zA-Z0-9_]/g, "")}`;

    const starterTts = await buildPlaybackFileFromText(text, "crm_starter");

    await originateConferenceCall({
      callId,
      confId,
      sipChannel: device.sipChannel,
      agentExtension: device.extension,
      phoneNumber: cleanedPhone,
      starterTtsFile: starterTts.playbackFile,
      callerIdName: device.callerIdName || "CRM",
    });

    activeCalls.set(callId, {
      callId,
      confId,
      leadId: leadId || null,
      phoneNumber: cleanedPhone,
      agentId: String(device.userId),
      agentExtension: device.extension,
      sipChannel: device.sipChannel,
      starterTtsFile: starterTts.playbackFile,
      status: "dialing-agent",
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

        await originateLeadToConference({
          callId,
          confId,
          phoneNumber: cleanedPhone,
          callerIdName: device.callerIdName || "CRM",
        });

        activeCall.status = "dialing-lead";

        setTimeout(() => {
          const latest = activeCalls.get(callId);
          if (!latest || latest.ended) return;

          latest.ttsBusy = false;
          latest.currentTts = null;
          latest.status =
            latest.ttsQueue.length > 0 ? "queued-tts" : "bridged";

          processTtsQueue(callId).catch((err) => {
            console.error("Starter queue processing error:", err);
          });
        }, 5000);
      } catch (err) {
        console.error("Lead originate error:", err);
      }
    }, 2500);

    return res.json({
      success: true,
      message:
        "Call started using the Asterisk device linked to this account.",
      callId,
      confId,
      starterTtsFile: starterTts.playbackFile,
      remotePath: starterTts.remotePath,
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
      `crm_script_${safeScriptId}`
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
    });
  } catch (error) {
    console.error("Play TTS in call error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to play script in call",
    });
  }
});

router.get("/live-call/:callId", async (req, res) => {
  try {
    const { callId } = req.params;
    const activeCall = activeCalls.get(callId);

    if (!activeCall) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    return res.json({
      success: true,
      data: {
        callId: activeCall.callId,
        confId: activeCall.confId,
        leadId: activeCall.leadId,
        phoneNumber: activeCall.phoneNumber,
        agentId: activeCall.agentId,
        agentExtension: activeCall.agentExtension,
        sipChannel: activeCall.sipChannel,
        status: activeCall.status,
        ttsBusy: activeCall.ttsBusy,
        currentTts: activeCall.currentTts,
        queue: activeCall.ttsQueue.map((item) => ({
          scriptId: item.scriptId,
          title: item.title,
          queuedAt: item.queuedAt,
        })),
        createdAt: activeCall.createdAt,
      },
    });
  } catch (error) {
    console.error("Get live call error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get live call",
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

    activeCall.ended = true;
    activeCall.ttsQueue = [];
    activeCall.status = "ended";

    const result = await hangupConference(activeCall.confId);

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