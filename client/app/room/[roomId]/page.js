"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  LiveKitRoom,
  VideoConference,
  formatChatMessageLinks,
} from "@livekit/components-react";
import { VideoPresets } from "livekit-client";

// Same-origin Next API route by default; override only for the standalone server.
const TOKEN_ENDPOINT =
  process.env.NEXT_PUBLIC_TOKEN_ENDPOINT || "/api/token";

// Tuned for large rooms (~50 participants). The client cost is dominated by how
// many streams it must encode/decode, so:
//  - cap capture at 540p and publish only low+mid simulcast layers (cheap uplink)
//  - h264: hardware decode on virtually every device => low CPU when many tiles
//  - adaptiveStream + pagination => the browser only decodes the VISIBLE tiles
//  - dynacast => SFU stops sending layers nobody is viewing
const ROOM_OPTIONS = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h540.resolution,
  },
  publishDefaults: {
    simulcast: true,
    videoCodec: "h264",
    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
    red: true, // audio redundancy for packet-loss resilience
    dtx: true, // discontinuous transmission (silence) saves bandwidth
  },
};

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user, loading, signInWithGoogle, signInAsGuest, getIdToken } = useAuth();

  const room = useMemo(
    () => decodeURIComponent(String(roomId || "")),
    [roomId]
  );

  const [token, setToken] = useState(null);
  const [serverUrl, setServerUrl] = useState(
    process.env.NEXT_PUBLIC_LIVEKIT_URL || ""
  );
  const [error, setError] = useState(null);
  const [guestName, setGuestName] = useState("");

  // Fetch a LiveKit access token ONCE per (user, room). Minting again would hand
  // LiveKitRoom a new token and force a disconnect/reconnect ("client initiated
  // disconnect"), so we key on the stable uid and never re-mint after success.
  const uid = user?.uid;
  const displayName = user?.displayName;
  useEffect(() => {
    if (!uid || !room) return;
    let cancelled = false;

    (async () => {
      try {
        const idToken = await getIdToken();
        const res = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, name: displayName, idToken }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Token request failed (${res.status}).`);
        }
        const data = await res.json();
        if (cancelled) return;
        setToken(data.token);
        if (data.url) setServerUrl(data.url);
      } catch (e) {
        if (!cancelled)
          setError(
            e.message?.includes("fetch")
              ? "Cannot reach the token server. Is it running?"
              : e.message
          );
      }
    })();

    return () => {
      cancelled = true;
    };
    // getIdToken/displayName intentionally omitted — fetch is keyed on uid+room
    // and must run exactly once per join to keep the token stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, room]);

  const leave = useCallback(() => router.push("/"), [router]);

  // --- Gates ---
  if (loading) return <Centered>Loading…</Centered>;

  if (!user) {
    return (
      <Centered>
        <p className="mb-4 text-gray-300">Join this meeting</p>
        <button
          onClick={() =>
            signInWithGoogle().catch((e) =>
              setError(`${e.code || "error"}: ${e.message || e}`)
            )
          }
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500"
        >
          Sign in with Google
        </button>
        <div className="my-4 flex w-64 items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase text-gray-500">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <div className="flex w-72 gap-2">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signInAsGuest(guestName)}
            placeholder="Your name"
            className="flex-1 rounded-lg bg-gray-900 px-3 py-2.5 text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-blue-500"
          />
          <button
            onClick={() => signInAsGuest(guestName)}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/10"
          >
            Guest
          </button>
        </div>
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <p className="mb-4 max-w-md text-red-400">{error}</p>
        <button
          onClick={leave}
          className="rounded-lg px-5 py-2.5 font-medium text-white ring-1 ring-white/20 hover:bg-white/10"
        >
          Back home
        </button>
      </Centered>
    );
  }

  if (!token || !serverUrl) return <Centered>Connecting…</Centered>;

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-white">Meet</h1>
          <CopyCode code={room} />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect
          audio
          video
          options={ROOM_OPTIONS}
          data-lk-theme="default"
          style={{ height: "100%" }}
          onDisconnected={leave}
          onError={(e) => setError(e.message)}
        >
          <VideoConference chatMessageFormatter={formatChatMessageLinks} />
        </LiveKitRoom>
      </div>
    </div>
  );
}

function CopyCode({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      title="Copy meeting code"
      className="rounded-md bg-white/5 px-3 py-1 text-sm text-gray-300 ring-1 ring-white/10 hover:bg-white/10"
    >
      {copied ? "Copied!" : code}
    </button>
  );
}

function Centered({ children }) {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center px-4 text-center">
      {children}
    </main>
  );
}
