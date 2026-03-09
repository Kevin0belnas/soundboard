// server.js
const path = require("path");
const dns = require("dns");

// ✅ Force Node to use public DNS (fixes: querySrv ECONNREFUSED)
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const ttsRoutes = require("./routes/tts");

const app = express();

// Middleware

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------
// Debug helpers
// -----------------------------
function maskMongoUri(uri = "") {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, "$1***$3");
}

mongoose.connection.on("connected", () => console.log("✅ Mongoose: connected"));
mongoose.connection.on("disconnected", () => console.log("⚠️ Mongoose: disconnected"));
mongoose.connection.on("error", (e) => console.error("❌ Mongoose error:", e?.message || e));

async function startServer() {
  try {
    console.log("CWD:", process.cwd());
    console.log("ENV loaded MONGO_URI?", Boolean(process.env.MONGO_URI));
    console.log("MONGO_URI:", process.env.MONGO_URI ? maskMongoUri(process.env.MONGO_URI) : "(missing)");

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing. Check your .env file location/name.");
    }

    // ✅ Connect DB first (fail fast)
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      // optional: keep these if you want faster initial connect behavior
      // connectTimeoutMS: 10000,
    });

    console.log("✅ MongoDB connected");

    // Routes (only after DB is connected)
    app.use("/api/auth", require("./routes/auth"));
    app.use("/api/scripts", require("./routes/scripts"));
    app.use("/api/logs", require("./routes/logs"));
    app.use("/api/tts", ttsRoutes);
    app.use("/api/users",require("./routes/users"));
    app.use("/audio", express.static(path.join(__dirname, "uploads", "audio")));


    // Health check
    app.get("/health", (req, res) => {
      res.json({
        ok: true,
        dbReadyState: mongoose.connection.readyState, // 1 = connected
      });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ Failed to start server:", err?.message || err);
    process.exit(1);
  }
}


startServer();