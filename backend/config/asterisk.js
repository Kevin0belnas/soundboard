const AsteriskManager = require("asterisk-manager");

const ami = new AsteriskManager(
  Number(process.env.ASTERISK_AMI_PORT || 5038),
  process.env.ASTERISK_HOST,
  process.env.ASTERISK_AMI_USER,
  process.env.ASTERISK_AMI_PASSWORD,
  true
);

ami.keepConnected();

ami.on("connect", () => {
  console.log("✅ Connected to VICIdial/Asterisk AMI");
});

ami.on("error", (err) => {
  console.error("❌ AMI connection error:", err);
});

ami.on("close", () => {
  console.log("⚠️ AMI connection closed");
});

module.exports = ami;