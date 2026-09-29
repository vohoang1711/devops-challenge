const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 5432),
  max: Number(process.env.DB_POOL_MAX || 10),
  connectionTimeoutMillis: 2000, // fail fast instead of hanging when the pool is busy
  idleTimeoutMillis: 30000,
});

// Idle clients emit "error" when Postgres restarts. Without a listener, Node crashes.
pool.on("error", (err) => console.error("pg pool error:", err.message));

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false, // fail immediately if Redis is down
});
redis.on("error", (err) => console.error("redis error:", err.message));

app.get("/api/users", async (req, res) => {
  try {
    // pool.query acquires a client and always releases it, even on error
    const result = await pool.query("SELECT NOW()");

    // The cache write is best effort and must not fail or delay the request
    redis.set("last_call", Date.now()).catch((err) =>
      console.warn("redis set failed:", err.message)
    );

    res.json({ ok: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

// Liveness: the process is up
app.get("/status", (req, res) => {
  res.json({ status: "ok" });
});

// Readiness: the database is reachable (used by the Compose health check)
app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (err) {
    res.status(503).json({ status: "not ready" });
  }
});

const server = app.listen(3000, () => console.log("API running on 3000"));

// Graceful shutdown so in-flight requests finish when the container stops
const shutdown = () => {
  server.close(async () => {
    await pool.end().catch(() => {});
    redis.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
