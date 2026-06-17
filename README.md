# Meet — Real-Time Video Meeting App

Google Meet / Zoom–style web app. Sign in with Google (or join as a guest), create
or join a room, and talk to many people at once. Media is routed through a
**LiveKit SFU** (simulcast, dynacast, adaptive stream) for high performance.

Ships as a **single Next.js app** — token minting runs in a serverless API route,
so the whole thing deploys to **Vercel** with no separate backend.

## Stack

| Layer    | Tech                                                          |
| -------- | ------------------------------------------------------------ |
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Tailwind v4    |
| Media    | LiveKit SFU + `@livekit/components-react` / `livekit-client` |
| Backend  | Next.js Route Handler `/api/token` (Node serverless function)|
| Auth     | Firebase Authentication (Google) + Firebase Admin verify     |

## Architecture

```
browser (Next.js on Vercel)
   │  1. Firebase Google sign-in (or guest)
   │  2. POST /api/token { room, name, idToken }   ┌──────────────────────────┐
   ├───────────────────────────────────────────────►  /api/token (serverless) │
   │                                                │  • verify idToken (Admin)│
   │  3. { token, url }                             │  • mint LiveKit JWT       │
   │◄─────────────────────────────────────────────  └──────────────────────────┘
   │  4. connect(token) ──────────► LiveKit SFU ◄────────── other participants
                                    (media routing, simulcast, TURN, reconnect)
```

The API route **never touches media** — it verifies identity and mints a
short-lived, room-scoped LiveKit token. The SFU does signaling, NAT traversal
(built-in TURN), simulcast layer selection and reconnection.

### Why an SFU (vs P2P mesh)

Full-mesh sends each stream to every peer — `O(n²)` and it melts CPU/uplink past
~4 people. An SFU receives one upstream per publisher and forwards selectively, so
each client uploads **once**. With simulcast + dynacast it scales to dozens.

## Prerequisites

- Node.js 18.18+
- A Firebase project (Google sign-in)
- A LiveKit project — [LiveKit Cloud](https://cloud.livekit.io) free tier (or self-host)

## Local setup

```bash
cp client/.env.local.example client/.env.local   # fill Firebase + LiveKit values
npm install            # root (concurrently — optional)
npm run install:all    # client (+ optional server)
npm run dev            # Next app on http://localhost:3000  (API route included)
```

Open <http://localhost:3000>, sign in, **New meeting**, share the code. No separate
backend needed — `/api/token` runs inside the same dev server.

### Required env vars (`client/.env.local`)

| Variable                          | Public? | Purpose                                   |
| --------------------------------- | ------- | ----------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_*`          | yes     | Firebase web config (auth)                |
| `NEXT_PUBLIC_LIVEKIT_URL`         | yes     | LiveKit `wss://` URL (client fallback)    |
| `LIVEKIT_URL`                     | **no**  | LiveKit URL returned by the token route   |
| `LIVEKIT_API_KEY`                 | **no**  | LiveKit API key (secret)                  |
| `LIVEKIT_API_SECRET`              | **no**  | LiveKit API secret (secret)               |
| `FIREBASE_PROJECT_ID` *(opt)*     | **no**  | Firebase Admin — verify Google identities |
| `FIREBASE_CLIENT_EMAIL` *(opt)*   | **no**  | Firebase Admin service account            |
| `FIREBASE_PRIVATE_KEY` *(opt)*    | **no**  | Firebase Admin private key (`\n`-escaped) |

Without the `FIREBASE_*` admin vars the app still runs, but signed-in users are
accepted without server-side verification (fine for dev; set them for production).

## Deploy to Vercel

1. Push this repo to GitHub/GitLab.
2. Vercel → **New Project** → import the repo.
3. **Root Directory → `client`** (the Next app lives in `client/`, not the repo root).
4. Framework preset auto-detects **Next.js**. Build command / output: defaults.
5. **Settings → Environment Variables** — add every row from the table above
   (the non-public ones especially). Paste `FIREBASE_PRIVATE_KEY` as one line with
   literal `\n` escapes, or wrapped in quotes.
6. **Deploy.**
7. **Firebase console → Authentication → Settings → Authorized domains** → add your
   Vercel domain (e.g. `your-app.vercel.app`) so the Google popup works there.

Vercel serves HTTPS automatically, so `getUserMedia` (camera/mic) works with no
certificate setup. The `/api/token` route runs as a Node serverless function.

## Features

- Google sign-in (Firebase) with verified server-side identity, or guest mode
- Create a room (random code) or join by code
- Multi-party audio/video via SFU — mute, camera, **screen share**, chat,
  active-speaker focus, connection-quality indicators (LiveKit `VideoConference`)
- Adaptive stream + dynacast + simulcast + audio RED/DTX
- Automatic reconnection and NAT traversal (LiveKit TURN)

## Performance knobs

In `ROOM_OPTIONS` in [client/app/room/[roomId]/page.js](client/app/room/[roomId]/page.js):
`adaptiveStream`, `dynacast`, `publishDefaults.simulcast`, `videoCodec: "vp9"`
(use `"av1"` for better compression, `"h264"` for widest compatibility), `red`,
`dtx`.

## Notes

- `reactStrictMode` is **off** ([next.config.js](client/next.config.js)) — the
  LiveKit `GridLayout` breaks under React 19 StrictMode double-render.
- LiveKit tokens are short-lived (1h) and room-scoped; refresh by rejoining.
- Firebase web config is public by design; LiveKit secrets are server-side only.
- **`server/`** is an optional standalone Express token issuer for self-hosting or
  LAN testing without Vercel. Not needed for the Vercel deploy. To use it, set
  `NEXT_PUBLIC_TOKEN_ENDPOINT` to its URL.
