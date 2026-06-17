import http from "http";
import https from "https";
import fs from "fs";
import { randomUUID } from "crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import admin from "firebase-admin";

dotenv.config();

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";

// CLIENT_ORIGIN: single origin, comma-separated list, or "*".
const rawOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
const corsOrigin =
  rawOrigin === "*"
    ? true
    : rawOrigin.includes(",")
    ? rawOrigin.split(",").map((s) => s.trim())
    : rawOrigin;

// --- Optional Firebase Admin (verifies client ID tokens => trusted identity) ---
let adminReady = false;
try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    adminReady = true;
    console.log("Firebase Admin ready — Google identities will be verified.");
  } else {
    console.warn(
      "Firebase Admin NOT configured — issuing tokens without server-side identity verification (dev/guest mode)."
    );
  }
} catch (err) {
  console.error("Firebase Admin init failed:", err.message);
}

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ ok: true, livekit: Boolean(API_KEY && API_SECRET), adminReady })
);

/**
 * POST /token  { room, name, idToken? }
 * Returns a short-lived LiveKit access token scoped to `room`.
 * If Firebase Admin is configured and a valid idToken is supplied, identity is
 * the verified Firebase uid; otherwise the caller is treated as an unverified
 * guest (identity prefixed "guest-").
 */
app.post("/token", async (req, res) => {
  try {
    if (!API_KEY || !API_SECRET) {
      return res
        .status(500)
        .json({ error: "Server missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET." });
    }

    const { room, name, idToken } = req.body || {};
    if (!room || typeof room !== "string" || room.length > 128) {
      return res.status(400).json({ error: "Valid 'room' is required." });
    }

    let identity;
    let displayName = (typeof name === "string" && name.trim()) || "";

    if (idToken) {
      if (adminReady) {
        try {
          const decoded = await admin.auth().verifyIdToken(idToken);
          identity = decoded.uid;
          displayName = decoded.name || displayName || "User";
        } catch {
          return res.status(401).json({ error: "Invalid or expired ID token." });
        }
      } else {
        // Token sent but server can't verify it — accept as unverified user.
        identity = `user-${randomUUID()}`;
      }
    } else {
      identity = `guest-${randomUUID()}`;
    }
    if (!displayName) displayName = identity.startsWith("guest") ? "Guest" : "User";

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: displayName,
      ttl: "1h",
    });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    res.json({ token, url: LIVEKIT_URL, identity, name: displayName });
  } catch (err) {
    console.error("token error:", err);
    res.status(500).json({ error: "Failed to mint token." });
  }
});

// HTTPS when cert files are provided (LAN testing over https/wss); else HTTP.
let server;
const certFile = process.env.SSL_CERT_FILE;
const keyFile = process.env.SSL_KEY_FILE;
let scheme = "http";
if (certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile)) {
  server = https.createServer(
    { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) },
    app
  );
  scheme = "https";
} else {
  server = http.createServer(app);
}

server.listen(PORT, HOST, () => {
  console.log(
    `Token server (${scheme}) on ${HOST}:${PORT} — CORS: ${rawOrigin} — LiveKit: ${
      LIVEKIT_URL || "(set LIVEKIT_URL)"
    }`
  );
});
