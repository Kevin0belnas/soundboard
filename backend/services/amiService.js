const net = require("net");
const AmiClient = require("asterisk-ami-client");

let eventClient = null;
let eventClientPromise = null;

async function getEventClient() {
  if (eventClient) return eventClient;
  if (eventClientPromise) return eventClientPromise;

  const host = process.env.ASTERISK_HOST || "127.0.0.1";
  const port = Number(process.env.ASTERISK_AMI_PORT || 5038);
  const username = process.env.ASTERISK_AMI_USER;
  const secret = process.env.ASTERISK_AMI_PASSWORD;

  if (!username || !secret) {
    throw new Error("Missing ASTERISK_AMI_USER or ASTERISK_AMI_PASSWORD");
  }

  eventClientPromise = (async () => {
    const client = new AmiClient({
      reconnect: true,
      keepAlive: true,
    });

    client.on("disconnect", () => {
      console.warn("[AMI EVENT] disconnected");
    });

    client.on("reconnection", () => {
      console.log("[AMI EVENT] reconnecting...");
    });

    client.on("internalError", (err) => {
      console.error("[AMI EVENT] internal error:", err);
    });

    await client.connect(username, secret, { host, port });
    eventClient = client;
    console.log(`[AMI EVENT] connected to ${host}:${port}`);
    return client;
  })();

  try {
    return await eventClientPromise;
  } finally {
    eventClientPromise = null;
  }
}

async function waitForLeadAnswered({ callId, timeoutMs = 45000 }) {
  const client = await getEventClient();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      client.removeListener("event", handler);
    };

    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };

    const timer = setTimeout(() => {
      done(reject, new Error("Timed out waiting for lead answer"));
    }, timeoutMs);

    const handler = (event) => {
      const eventName = event?.Event || event?.event;
      const userEvent = event?.UserEvent || event?.userevent;
      const eventCallId = event?.CallId || event?.callid;

      if (
        String(eventName).toLowerCase() === "userevent" &&
        String(userEvent) === "CRMLeadAnswered" &&
        String(eventCallId) === String(callId)
      ) {
        console.log("[AMI EVENT] Lead answered event received:", event);
        done(resolve, event);
      }
    };

    client.on("event", handler);
  });
}

function amiLoginAndSend(actionPayload, options = {}) {
  const host = process.env.ASTERISK_HOST || "127.0.0.1";
  const port = Number(process.env.ASTERISK_AMI_PORT || 5038);
  const username = process.env.ASTERISK_AMI_USER;
  const secret = process.env.ASTERISK_AMI_PASSWORD;
  const timeoutMs = options.timeoutMs || 10000;

  if (!username || !secret) {
    return Promise.reject(
      new Error("Missing ASTERISK_AMI_USER or ASTERISK_AMI_PASSWORD")
    );
  }

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    let stage = "waiting_login";
    let buffer = "";
    let finished = false;

    const cleanup = () => {
      try {
        socket.end();
      } catch (_) {}
      try {
        socket.destroy();
      } catch (_) {}
    };

    const done = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const fail = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    };

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const loginPayload =
        `Action: Login\r\n` +
        `Username: ${username}\r\n` +
        `Secret: ${secret}\r\n` +
        `Events: off\r\n\r\n`;

      socket.write(loginPayload);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();

      if (stage === "waiting_login") {
        if (buffer.includes("Authentication failed")) {
          return fail(new Error("AMI authentication failed"));
        }

        if (buffer.includes("Authentication accepted")) {
          stage = "waiting_action";
          buffer = "";
          socket.write(actionPayload);
          return;
        }
      }

      if (stage === "waiting_action") {
        if (buffer.includes("\r\n\r\n")) {
          const actionResponse = buffer;
          const logoffPayload = `Action: Logoff\r\n\r\n`;
          socket.write(logoffPayload);
          return done(actionResponse);
        }
      }
    });

    socket.on("timeout", () => fail(new Error("AMI socket timeout")));
    socket.on("error", (err) => fail(err));
    socket.on("close", () => {
      if (!finished) fail(new Error("AMI socket closed before completion"));
    });
  });
}

function buildAmiVariables(variables = {}) {
  return Object.entries(variables)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `Variable: ${key}=${value}\r\n`)
    .join("");
}

async function originateToContext({
  actionId,
  channel,
  context,
  extension = "s",
  priority = 1,
  timeout = 30000,
  callerId,
  variables = {},
}) {
  if (!channel) throw new Error("channel is required");
  if (!context) throw new Error("context is required");

  const action =
    `Action: Originate\r\n` +
    `ActionID: ${actionId}\r\n` +
    `Channel: ${channel}\r\n` +
    `Context: ${context}\r\n` +
    `Exten: ${extension}\r\n` +
    `Priority: ${priority}\r\n` +
    `Async: true\r\n` +
    `Timeout: ${timeout}\r\n` +
    (callerId ? `CallerID: ${callerId}\r\n` : "") +
    buildAmiVariables(variables) +
    `\r\n`;

  const response = await amiLoginAndSend(action, {
    timeoutMs: Math.max(timeout + 3000, 12000),
  });

  if (!/Response:\s*Success/i.test(response)) {
    throw new Error(`AMI originate failed: ${response}`);
  }

  return {
    success: true,
    raw: response,
  };
}

async function originateConferenceCall({
  callId,
  confId,
  sipChannel,
  agentExtension,
  phoneNumber,
  starterTtsFile,
  callerIdName,
}) {
  const channel = sipChannel || `SIP/${agentExtension}`;
  const callerId = callerIdName
    ? `${callerIdName} <${agentExtension}>`
    : `CRM <${agentExtension}>`;

  return originateToContext({
    actionId: callId,
    channel,
    context: "crm-call-tts",
    extension: "s",
    priority: 1,
    timeout: 30000,
    callerId,
    variables: {
      CRM_CALL_ID: callId,
      CRM_CONF_ID: confId,
      APP_AGENT_EXTENSION: agentExtension,
      APP_PHONE_NUMBER: phoneNumber,
      TTS_FILE: starterTtsFile,
    },
  });
}

async function originateLeadToConference({
  callId,
  confId,
  phoneNumber,
  callerIdName,
}) {
  if (!phoneNumber) {
    throw new Error("phoneNumber is required");
  }

  const callerId = callerIdName ? `${callerIdName} <0000>` : `CRM <0000>`;

  return originateToContext({
    actionId: `${callId}_lead_${Date.now()}`,
    channel: `Local/s@crm-dial-lead`,
    context: "crm-dial-lead",
    extension: "s",
    priority: 1,
    timeout: 45000,
    callerId,
    variables: {
      CRM_CALL_ID: callId,
      CRM_CONF_ID: confId,
      APP_PHONE_NUMBER: phoneNumber,
    },
  });
}

async function queueTtsToConference({ callId, confId, ttsFile }) {
  if (!confId) throw new Error("confId is required");
  if (!ttsFile) throw new Error("ttsFile is required");

  return originateToContext({
    actionId: `${callId}_tts_${Date.now()}`,
    channel: `Local/s@crm-play-tts`,
    context: "crm-play-tts",
    extension: "s",
    priority: 1,
    timeout: 30000,
    callerId: `CRM-TTS <0000>`,
    variables: {
      CRM_CALL_ID: callId,
      CRM_CONF_ID: confId,
      TTS_FILE: ttsFile,
    },
  });
}

async function runAmiCommand(command) {
  const action = `Action: Command\r\nCommand: ${command}\r\n\r\n`;
  return amiLoginAndSend(action, { timeoutMs: 12000 });
}

async function hangupConference(confId) {
  if (!confId) throw new Error("confId is required");

  const raw = await runAmiCommand(`confbridge kick ${confId} all`);

  return {
    success: true,
    raw,
    confId,
  };
}

module.exports = {
  amiLoginAndSend,
  originateToContext,
  originateConferenceCall,
  originateLeadToConference,
  queueTtsToConference,
  hangupConference,
  waitForLeadAnswered,
};