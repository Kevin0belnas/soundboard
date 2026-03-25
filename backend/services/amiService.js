const net = require("net");

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
      console.log(`AMI connecting to ${host}:${port}`);

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
          console.log("AMI login accepted");
          stage = "waiting_action";
          buffer = ""; // IMPORTANT: clear login response buffer
          socket.write(actionPayload);
          return;
        }
      }

      if (stage === "waiting_action") {
        // Wait until a full AMI response block is present
        if (buffer.includes("\r\n\r\n")) {
          const actionResponse = buffer;
          console.log("AMI action response:\n", actionResponse);

          const logoffPayload = `Action: Logoff\r\n\r\n`;
          socket.write(logoffPayload);

          return done(actionResponse);
        }
      }
    });

    socket.on("timeout", () => {
      fail(new Error("AMI socket timeout"));
    });

    socket.on("error", (err) => {
      fail(err);
    });

    socket.on("close", () => {
      if (!finished) {
        fail(new Error("AMI socket closed before completion"));
      }
    });
  });
}

async function originateMicroSIPCall({
  callId,
  sipChannel,
  agentExtension,
  phoneNumber,
  ttsFile,
  callerIdName,
}) {
  const channel = sipChannel || `SIP/${agentExtension}`;
  const callerId = callerIdName
    ? `${callerIdName} <${agentExtension}>`
    : `CRM <${agentExtension}>`;

  console.log("Starting originate with:");
  console.log("callId:", callId);
  console.log("channel:", channel);
  console.log("agentExtension:", agentExtension);
  console.log("phoneNumber:", phoneNumber);
  console.log("ttsFile:", ttsFile);

  const action =
    `Action: Originate\r\n` +
    `ActionID: ${callId}\r\n` +
    `Channel: ${channel}\r\n` +
    `Context: crm-call-tts\r\n` +
    `Exten: s\r\n` +
    `Priority: 1\r\n` +
    `Async: true\r\n` +
    `Timeout: 30000\r\n` +
    `CallerID: ${callerId}\r\n` +
    `Variable: CRM_CALL_ID=${callId}\r\n` +
    `Variable: APP_AGENT_EXTENSION=${agentExtension}\r\n` +
    `Variable: APP_PHONE_NUMBER=${phoneNumber}\r\n` +
    `Variable: TTS_FILE=${ttsFile}\r\n\r\n`;

  const response = await amiLoginAndSend(action);

  if (!/Response:\s*Success/i.test(response)) {
    throw new Error(`AMI originate failed: ${response}`);
  }

  return {
    success: true,
    raw: response,
  };
}

async function listChannelsRaw() {
  const action =
    `Action: Command\r\n` +
    `Command: core show channels concise\r\n\r\n`;

  return amiLoginAndSend(action, { timeoutMs: 12000 });
}

async function hangupByExtensionPrefix(agentExtension) {
  const raw = await listChannelsRaw();
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);

  const matchedChannels = [];

  for (const line of lines) {
    const parts = line.split("!");
    const channelName = parts[0];

    if (channelName && channelName.startsWith(`SIP/${agentExtension}-`)) {
      matchedChannels.push(channelName);
    }
  }

  console.log("Matched channels for hangup:", matchedChannels);

  for (const channel of matchedChannels) {
    const action =
      `Action: Hangup\r\n` +
      `Channel: ${channel}\r\n\r\n`;

    await amiLoginAndSend(action);
  }

  return {
    success: true,
    channels: matchedChannels,
  };
}

module.exports = {
  amiLoginAndSend,
  originateMicroSIPCall,
  hangupByExtensionPrefix,
};