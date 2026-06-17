# Meet — Real-Time Video Meeting App

Google Meet / Zoom–style web app. Sign in with Google (or join as guest), create or
join a room, talk to many people at once. Media is routed by a **custom mediasoup
SFU** with **WebSocket (wss) signaling** — built from scratch, no third-party media
service.

## Stack

| Layer     | Tech                                                        |
| --------- | ----------------------------------------------------------- |
| Frontend  | Next.js 16 (App Router), React 19, Tailwind v4              |
| Media     | WebRTC + **mediasoup SFU** + `mediasoup-client`             |
| Signaling | Node.js + `ws` (raw WebSocket, custom RPC)                  |
| Auth      | Firebase Authentication (Google) + optional Admin verify    |

## How it works

```
browser (mediasoup-client)
   │  1. Firebase Google sign-in (or guest)
   │  2. WebSocket connect: wss://sfu?roomId&name&token
   ├──────────────────────────────────────────────►  SFU (Node + ws + mediasoup)
   │     getRouterRtpCapabilities                     • 1 Router per room
   │     createWebRtcTransport (send + recv)          • verifies Firebase token
   │     produce(mic, cam)  ── RTP/UDP ─────────────► • receives each stream once
   │     consume(others)    ◄─ RTP/UDP ─────────────  • forwards selectively (SFU)
```

- **Signaling** (SDP/ICE/DTLS params, produce/consume) flows over the WebSocket.
- **Media** (audio/video RTP) flows over UDP/SRTP directly between each browser and
  the SFU — *not* over the WebSocket. Each client uploads its stream **once**; the
  SFU forwards to everyone. This is what scales to ~50 (vs mesh's ~4).
- Video is published with **3 simulcast layers** so the SFU can send a lower layer
  to viewers who don't need full resolution.

## Repo layout

| Path      | What                                                         |
| --------- | ------------------------------------------------------------ |
| `client/` | Next.js app (UI, auth, `useSfu` hook, `wsClient`). → Vercel. |
| `server/` | mediasoup SFU + ws signaling. → a VPS (needs UDP + a public IP). |

## Prerequisites

- Node.js 18.18+
- A Firebase project (Google sign-in)

## Local development

mediasoup runs natively on Windows/macOS/Linux (prebuilt worker), so no Docker is
needed locally.

```bash
cp client/.env.local.example client/.env.local   # Firebase config + NEXT_PUBLIC_WS_URL
cp server/.env.example server/.env                # PORT, ANNOUNCED_IP=127.0.0.1, ...
npm run install:all
npm run dev        # SFU on ws://localhost:4000  +  client on http://localhost:3000
```

Open <http://localhost:3000>, sign in, **New meeting**, share the code. For two
local participants, open a second browser/profile to the same room URL.

Defaults that matter for local:
- `server/.env`: `ANNOUNCED_IP=127.0.0.1`, TLS off → `ws://`.
- `client/.env.local`: `NEXT_PUBLIC_WS_URL=ws://localhost:4000` (must match).

## Production deployment

Two pieces deploy to two places — the SFU **cannot** run on Vercel (it needs a
stateful process, a public IP, and an open UDP range).

### 1. SFU → a VPS (DigitalOcean / Hetzner / EC2 …) with `docker compose`

`server/docker-compose.yml` runs the SFU **and Caddy** (auto Let's Encrypt TLS,
reverse-proxying `wss://` → the SFU's ws). Media (UDP) goes straight to the host.

```bash
# DNS first: A record  sfu.yourdomain.com  ->  <VPS public IP>

# on the VPS (Docker + compose plugin installed)
git clone <your repo> && cd <repo>/server
cp .env.example .env
# edit .env:
#   ANNOUNCED_IP=<VPS public IP>
#   CLIENT_ORIGIN=https://your-app.vercel.app
#   SFU_DOMAIN=sfu.yourdomain.com
#   (leave SSL_CERT_FILE/SSL_KEY_FILE commented — Caddy does TLS)

# firewall: signaling/TLS + media
sudo ufw allow 80,443/tcp
sudo ufw allow 40000:40100/udp

docker compose up -d --build
```

- **`ANNOUNCED_IP` must be the VPS public IP** — without it ICE fails.
- Do **not** open port 4000 publicly; Caddy reaches it on localhost.
- Verify: `https://sfu.yourdomain.com/health` → `{"ok":true}`.
- *(Optional)* Firebase Admin: add `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
  `FIREBASE_PRIVATE_KEY` to `.env` to verify Google identities server-side.

### 2. Client → Vercel

- Root Directory: `client`.
- Env vars: the `NEXT_PUBLIC_FIREBASE_*` set, plus
  `NEXT_PUBLIC_WS_URL=wss://sfu.yourdomain.com`.
- Firebase → **Authentication → Authorized domains** → add `your-app.vercel.app`.

> Until the SFU is reachable over `wss://`, the deployed client cannot connect a
> call (it would try `ws://localhost:4000`). Local dev works as-is.

## Features

- Google sign-in (Firebase) + optional server-verified identity, or guest mode
- Create / join rooms by code
- Multi-party audio/video via SFU; mute, camera on/off, leave
- Simulcast publishing; view/listen-only fallback if no camera/mic
- Live remote mute & camera-off indicators

## Signaling protocol (server/index.js ⇄ client/lib/wsClient.js)

Request `{ id, method, data }` → response `{ id, ok, data }`. Server notifications
`{ notification:true, method, data }`. Methods: `getRouterRtpCapabilities`,
`createWebRtcTransport`, `connectWebRtcTransport`, `produce`, `getProducers`,
`consume`, `resumeConsumer`, `pauseProducer`, `resumeProducer`. Notifications:
`welcome`, `newProducer`, `peerClosed`, `producerPaused`, `producerResumed`,
`consumerClosed`.

## Tuning

- `server/config.js` — codecs (VP8/H264/opus), RTC port range, bitrates, worker count.
- `client/lib/useSfu.js` — `VIDEO_ENCODINGS` simulcast layers.
- One mediasoup Router per room; one worker per CPU core (round-robin).
