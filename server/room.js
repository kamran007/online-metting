import * as mediasoup from "mediasoup";
import { config } from "./config.js";

// --- Worker pool (round-robin) ---
const workers = [];
let nextWorker = 0;

export async function createWorkers() {
  for (let i = 0; i < config.numWorkers; i++) {
    const worker = await mediasoup.createWorker(config.worker);
    worker.on("died", () => {
      console.error(`mediasoup worker ${worker.pid} died — exiting`);
      setTimeout(() => process.exit(1), 1000);
    });
    workers.push(worker);
  }
  console.log(`mediasoup: ${workers.length} worker(s) started`);
}

function getWorker() {
  const worker = workers[nextWorker];
  nextWorker = (nextWorker + 1) % workers.length;
  return worker;
}

// --- Rooms ---
const rooms = new Map(); // roomId -> Room

export async function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    const worker = getWorker();
    const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    room = new Room(roomId, router);
    rooms.set(roomId, room);
    console.log(`room created: ${roomId}`);
  }
  return room;
}

/**
 * A Room owns one mediasoup Router and a set of Peers.
 * Each Peer owns its WebRTC transports, producers and consumers.
 */
export class Room {
  constructor(id, router) {
    this.id = id;
    this.router = router;
    this.peers = new Map(); // peerId -> Peer
  }

  addPeer(peer) {
    this.peers.set(peer.id, peer);
  }

  getPeer(peerId) {
    return this.peers.get(peerId);
  }

  // Every producer in the room except the requesting peer's own.
  otherProducers(exceptPeerId) {
    const list = [];
    for (const peer of this.peers.values()) {
      if (peer.id === exceptPeerId) continue;
      for (const producer of peer.producers.values()) {
        list.push({
          producerId: producer.id,
          peerId: peer.id,
          name: peer.name,
          kind: producer.kind,
        });
      }
    }
    return list;
  }

  // Send a notification to every peer except `exceptPeerId`.
  broadcast(exceptPeerId, method, data) {
    for (const peer of this.peers.values()) {
      if (peer.id === exceptPeerId) continue;
      peer.notify(method, data);
    }
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.close();
    this.peers.delete(peerId);
    if (this.peers.size === 0) {
      this.router.close();
      rooms.delete(this.id);
      console.log(`room closed: ${this.id}`);
    }
  }
}

/**
 * Per-connection state. `send` is a function that serializes a notification
 * down the websocket.
 */
export class Peer {
  constructor(id, name, send) {
    this.id = id;
    this.name = name;
    this.send = send;
    this.transports = new Map(); // transportId -> WebRtcTransport
    this.producers = new Map(); // producerId -> Producer
    this.consumers = new Map(); // consumerId -> Consumer
  }

  notify(method, data) {
    this.send({ notification: true, method, data });
  }

  addTransport(t) {
    this.transports.set(t.id, t);
  }
  addProducer(p) {
    this.producers.set(p.id, p);
  }
  addConsumer(c) {
    this.consumers.set(c.id, c);
  }

  close() {
    for (const t of this.transports.values()) t.close(); // closes its producers/consumers too
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}
