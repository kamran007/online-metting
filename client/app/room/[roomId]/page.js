"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useSfu } from "@/lib/useSfu";
import VideoTile from "@/components/VideoTile";
import Controls from "@/components/Controls";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user, loading, signInWithGoogle, signInAsGuest, getIdToken } = useAuth();
  const [guestName, setGuestName] = useState("");

  const room = useMemo(() => decodeURIComponent(String(roomId || "")), [roomId]);
  const enabled = !!user && !!room;

  const {
    localStream,
    peers,
    audioOn,
    videoOn,
    status,
    error,
    toggleAudio,
    toggleVideo,
    leave,
  } = useSfu({
    wsUrl: WS_URL,
    roomId: room,
    name: user?.displayName,
    getToken: getIdToken,
    enabled,
  });

  const onLeave = useCallback(() => {
    leave();
    router.push("/");
  }, [leave, router]);

  // --- Gates ---
  if (loading) return <Centered>Loading…</Centered>;

  if (!user) {
    return (
      <Centered>
        <p className="mb-4 text-gray-300">Join this meeting</p>
        <button
          onClick={() =>
            signInWithGoogle().catch((e) => alert(`${e.code || "error"}: ${e.message || e}`))
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

  if (status === "error") {
    return (
      <Centered>
        <p className="mb-4 max-w-md text-red-400">{error}</p>
        <button
          onClick={onLeave}
          className="rounded-lg px-5 py-2.5 font-medium text-white ring-1 ring-white/20 hover:bg-white/10"
        >
          Back home
        </button>
      </Centered>
    );
  }

  const remote = Object.entries(peers);
  const tileCount = remote.length + 1;
  const cols =
    tileCount <= 1 ? "grid-cols-1" : tileCount <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-white">Meet</h1>
          <CopyCode code={room} />
        </div>
        <span className="text-sm text-gray-400">
          {tileCount} {tileCount === 1 ? "participant" : "participants"}
          {status !== "ready" && " · connecting…"}
        </span>
      </header>

      <section className="flex-1 overflow-auto p-4">
        <div className={`mx-auto grid max-w-6xl gap-4 ${cols}`}>
          <VideoTile
            stream={localStream}
            name={user.displayName || "You"}
            muted
            isLocal
            audioOn={audioOn}
            videoOn={videoOn}
          />
          {remote.map(([id, p]) => (
            <VideoTile
              key={id}
              stream={p.stream}
              name={p.name}
              audioOn={p.audioOn}
              videoOn={p.videoOn}
            />
          ))}
        </div>

        {remote.length === 0 && (
          <p className="mt-8 text-center text-sm text-gray-500">
            You&apos;re the only one here. Share the code{" "}
            <span className="font-mono text-gray-300">{room}</span> to invite others.
          </p>
        )}
      </section>

      <Controls
        audioOn={audioOn}
        videoOn={videoOn}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onLeave={onLeave}
      />
    </main>
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
    <main className="flex h-dvh flex-col items-center justify-center px-4 text-center">
      {children}
    </main>
  );
}
