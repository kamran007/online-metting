import "dotenv/config"; // MUST be first — populates process.env before config.js reads it
import http from "http";
import https from "https";
import fs from "fs";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { createWorkers, getOrCreateRoom, Peer } from "./room.js";

// --- Optional Firebase Admin (verify Google ID tokens => trusted name) ---
let adminAuth = null;
let adminTried = false;
async function getAdminAuth() {
  if (adminAuth) return adminAuth;
  if (adminTried) return null;
  adminTried = true;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!(projectId && clientEmail && privateKey)) return null;
  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    if (!getApps().length) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }
    adminAuth = getAuth();
    return adminAuth;
  } catch (err) {
    console.error("Firebase Admin init failed:", err?.message || err);
    return null;
  }
}

// --- WebRTC transport helper ---
async function createWebRtcTransport(router) {
  const { listenIps, enableUdp, enableTcp, preferUdp, initialAvailableOutgoingBitrate } =
    config.webRtcTransport;
  const transport = await router.createWebRtcTransport({
    listenIps,
    enableUdp,
    enableTcp,
    preferUdp,
    initialAvailableOutgoingBitrate,
  });
  if (config.webRtcTransport.maxIncomingBitrate) {
    try {
      await transport.setMaxIncomingBitrate(config.webRtcTransport.maxIncomingBitrate);
    } catch {
      /* ignore */
    }
  }
  return transport;
}

// --- RPC method handlers. Each returns the response data or throws. ---
const handlers = {
  getRouterRtpCapabilities: (room) => room.router.rtpCapabilities,

  createWebRtcTransport: async (room, peer, { producing }) => {
    const transport = await createWebRtcTransport(room.router);
    peer.addTransport(transport);
    if (producing) peer.sendTransport = transport;
    else peer.recvTransport = transport;
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  },

  connectWebRtcTransport: async (room, peer, { transportId, dtlsParameters }) => {
    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error("transport not found");
    await transport.connect({ dtlsParameters });
    return {};
  },

  produce: async (room, peer, { transportId, kind, rtpParameters, appData }) => {
    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error("transport not found");
    const producer = await transport.produce({ kind, rtpParameters, appData });
    peer.addProducer(producer);

    producer.on("transportclose", () => peer.producers.delete(producer.id));

    // Tell everyone else a new stream is available to consume.
    room.broadcast(peer.id, "newProducer", {
      producerId: producer.id,
      peerId: peer.id,
      name: peer.name,
      kind: producer.kind,
    });
    return { id: producer.id };
  },

  // Existing producers for a freshly-joined peer to consume.
  getProducers: (room, peer) => room.otherProducers(peer.id),

  consume: async (room, peer, { producerId, rtpCapabilities }) => {
    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error("cannot consume");
    }
    const transport = peer.recvTransport;
    if (!transport) throw new Error("no recv transport");

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // resume after the client is ready (best practice)
    });
    peer.addConsumer(consumer);

    consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
    consumer.on("producerclose", () => {
      peer.consumers.delete(consumer.id);
      peer.notify("consumerClosed", { consumerId: consumer.id });
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  },

  resumeConsumer: async (room, peer, { consumerId }) => {
    const consumer = peer.consumers.get(consumerId);
    if (consumer) await consumer.resume();
    return {};
  },

  pauseProducer: async (room, peer, { producerId }) => {
    const producer = peer.producers.get(producerId);
    if (producer) await producer.pause();
    room.broadcast(peer.id, "producerPaused", { peerId: peer.id, kind: producer?.kind });
    return {};
  },

  resumeProducer: async (room, peer, { producerId }) => {
    const producer = peer.producers.get(producerId);
    if (producer) await producer.resume();
    room.broadcast(peer.id, "producerResumed", { peerId: peer.id, kind: producer?.kind });
    return {};
  },
};

async function start() {
  await createWorkers();

  // HTTP(S) for /health + the WebSocket upgrade.
  const certFile = process.env.SSL_CERT_FILE;
  const keyFile = process.env.SSL_KEY_FILE;
  const useTls = certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile);
  const requestHandler = (req, res) => {
    if (req.url?.startsWith("/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  };
  const server = useTls
    ? https.createServer(
        { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) },
        requestHandler
      )
    : http.createServer(requestHandler);

  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    // Origin check.
    if (config.clientOrigin !== "*") {
      const allowed = config.clientOrigin.split(",").map((s) => s.trim());
      if (req.headers.origin && !allowed.includes(req.headers.origin)) {
        ws.close(1008, "origin not allowed");
        return;
      }
    }

    const url = new URL(req.url, "http://localhost");
    const roomId = url.searchParams.get("roomId");
    const qName = url.searchParams.get("name") || "";
    const idToken = url.searchParams.get("token") || "";
    if (!roomId) {
      ws.close(1008, "roomId required");
      return;
    }

    // Resolve display name (verified when Firebase Admin is configured).
    let name = qName || "Guest";
    if (idToken) {
      const auth = await getAdminAuth();
      if (auth) {
        try {
          const decoded = await auth.verifyIdToken(idToken);
          name = decoded.name || qName || "User";
        } catch {
          ws.close(1008, "invalid token");
          return;
        }
      }
    }

    const room = await getOrCreateRoom(roomId);
    const peerId = randomUUID();
    const send = (obj) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };
    const peer = new Peer(peerId, name, send);
    room.addPeer(peer);

    // Hand the client its own id so it can ignore its own producers, etc.
    send({ notification: true, method: "welcome", data: { peerId, name } });

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      const { id, method, data } = msg;
      const handler = handlers[method];
      if (!handler) {
        send({ id, ok: false, error: `unknown method: ${method}` });
        return;
      }
      try {
        const result = await handler(room, peer, data || {});
        send({ id, ok: true, data: result });
      } catch (err) {
        console.error(`rpc ${method} failed:`, err?.message || err);
        send({ id, ok: false, error: err?.message || "error" });
      }
    });

    const cleanup = () => {
      room.broadcast(peer.id, "peerClosed", { peerId: peer.id });
      room.removePeer(peer.id);
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  server.listen(config.listenPort, () => {
    console.log(
      `SFU signaling (${useTls ? "wss" : "ws"}) on :${config.listenPort} — ` +
        `announcedIp ${config.webRtcTransport.listenIps[0].announcedIp}, ` +
        `RTC ports ${config.worker.rtcMinPort}-${config.worker.rtcMaxPort}`
    );
  });
}

start().catch((err) => {
  console.error("SFU failed to start:", err);
  process.exit(1);
});
