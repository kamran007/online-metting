import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// firebase-admin + livekit-server-sdk need the Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL =
  process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "";
const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS || 50);

// LiveKit RoomService over HTTPS (derived from the wss URL). Used to pre-create
// a room with a hard participant cap so the SFU rejects the (N+1)th joiner.
let roomSvc = null;
function getRoomService() {
  if (roomSvc) return roomSvc;
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) return null;
  const httpUrl = LIVEKIT_URL.replace(/^ws/, "http"); // wss:// -> https://
  roomSvc = new RoomServiceClient(httpUrl, API_KEY, API_SECRET);
  return roomSvc;
}

// firebase-admin is imported lazily (dynamic import) so a bundling/runtime
// issue with it can never crash the route at import time — guests and the
// LiveKit token mint keep working even if Admin is unavailable.
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

export async function GET() {
  const auth = await getAdminAuth();
  return NextResponse.json({
    ok: true,
    livekit: Boolean(API_KEY && API_SECRET),
    adminReady: Boolean(auth),
  });
}

export async function POST(req) {
  try {
    if (!API_KEY || !API_SECRET) {
      return NextResponse.json(
        { error: "Server missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET." },
        { status: 500 }
      );
    }

    const { room, name, idToken } = await req.json().catch(() => ({}));
    if (!room || typeof room !== "string" || room.length > 128) {
      return NextResponse.json({ error: "Valid 'room' is required." }, { status: 400 });
    }

    let identity;
    let displayName = (typeof name === "string" && name.trim()) || "";

    if (idToken) {
      const auth = await getAdminAuth();
      if (auth) {
        try {
          const decoded = await auth.verifyIdToken(idToken);
          identity = decoded.uid;
          displayName = decoded.name || displayName || "User";
        } catch {
          return NextResponse.json(
            { error: "Invalid or expired ID token." },
            { status: 401 }
          );
        }
      } else {
        identity = `user-${randomUUID()}`;
      }
    } else {
      identity = `guest-${randomUUID()}`;
    }
    if (!displayName) displayName = identity.startsWith("guest") ? "Guest" : "User";

    // Ensure the room exists with a hard participant cap. Idempotent; non-fatal
    // (the room would auto-create on join anyway, just without the cap).
    const svc = getRoomService();
    if (svc) {
      try {
        await svc.createRoom({
          name: room,
          maxParticipants: MAX_PARTICIPANTS,
          emptyTimeout: 300,
        });
      } catch {
        /* already exists or transient — ignore */
      }
    }

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
    return NextResponse.json({ token, url: LIVEKIT_URL, identity, name: displayName });
  } catch (err) {
    console.error("token route error:", err);
    return NextResponse.json({ error: "Failed to mint token." }, { status: 500 });
  }
}
