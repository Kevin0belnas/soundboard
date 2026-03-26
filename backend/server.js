const path = require("path");
const dns = require("dns");

// Force Node to use public DNS (fixes: querySrv ECONNREFUSED)
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { testConnection } = require("./config/mysqldb"); 
const ttsRoutes = require("./routes/tts");

const app = express();

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

mongoose.connection.on("connected", () => console.log("Mongoose: connected"));
mongoose.connection.on("disconnected", () => console.log("Mongoose: disconnected"));
mongoose.connection.on("error", (e) => console.error("Mongoose error:", e?.message || e));

async function startServer() {
  try {
    console.log("CWD:", process.cwd());
    console.log("ENV loaded MONGO_URI?", Boolean(process.env.MONGO_URI));
    console.log("MONGO_URI:", process.env.MONGO_URI ? maskMongoUri(process.env.MONGO_URI) : "(missing)");
    
    // Log MySQL config (without showing password)
    console.log("MySQL Aiven Config:", {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER ? '***' : '(missing)',
      hasPassword: Boolean(process.env.DB_PASSWORD),
      ssl: process.env.DB_SSL
    });

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing. Check your .env file location/name.");
    }

    // Connect MongoDB first
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB connected");

    // Test MySQL Aiven connection
    const mysqlConnected = await testConnection();
    if (!mysqlConnected) {
      console.warn("MySQL Aiven connection failed - leads routes will return errors");
    } else {
      console.log("MySQL Aiven ready to serve leads data");
    }

    // Routes
    app.use("/api/auth", require("./routes/auth"));
    app.use("/api/scripts", require("./routes/scripts"));
    app.use("/api/logs", require("./routes/logs"));W
    app.use("/api/tts", ttsRoutes);
    app.use("/api/users",require("./routes/users"));
    app.use("/audio", express.static(path.join(__dirname, "uploads", "audio")));
    app.use("/temp", express.static(path.join(__dirname, "uploads", "temp")));
    app.use("/api/contacts", require("./routes/contacts")); // New contacts routes
    app.use("/api/asterisk", require("./routes/asterisk"));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

    // Health check
    app.get("/health", async (req, res) => {
      const mysqlStatus = await testConnection().catch(() => false);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        databases: {
          mongodb: {
            connected: mongoose.connection.readyState === 1,
            readyState: mongoose.connection.readyState
          },
          mysql: {
            connected: mysqlStatus,
            provider: "Aiven"
          }
        }
      });
    });

    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err?.message || err);
    process.exit(1);
  }
}

startServer();