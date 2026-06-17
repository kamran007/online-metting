"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

function randomRoomId() {
  // 3 groups of 3 lowercase letters, e.g. abc-defg-hij
  const a = () =>
    Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 3) || "xyz";
  return `${a()}-${a()}${a()}-${a()}`.slice(0, 12);
}

export default function Home() {
  const { user, loading, signInWithGoogle, signInAsGuest, signOut } = useAuth();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [authError, setAuthError] = useState(null);

  const handleGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthError(`${e.code || "error"}: ${e.message || e}`);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 text-center shadow-xl ring-1 ring-white/10">
          <h1 className="text-3xl font-bold text-white">Meet</h1>
          <p className="mt-2 text-gray-400">
            Secure video meetings in your browser.
          </p>
          <button
            onClick={handleGoogle}
            className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          {authError && (
            <p className="mt-3 wrap-break-word text-left text-xs text-red-400">
              {authError}
            </p>
          )}

          <div className="my-5 flex items-center gap-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase text-gray-500">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex gap-2">
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signInAsGuest(guestName)}
              placeholder="Your name"
              className="flex-1 rounded-lg bg-gray-800 px-4 py-2.5 text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-blue-500"
            />
            <button
              onClick={() => signInAsGuest(guestName)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/10"
            >
              Join as guest
            </button>
          </div>
          <p className="mt-2 text-left text-xs text-gray-500">
            Guest mode is for local/LAN testing — no real authentication.
          </p>
        </div>
      </main>
    );
  }

  const createRoom = () => router.push(`/room/${randomRoomId()}`);
  const joinRoom = () => {
    const id = code.trim().replace(/\s+/g, "");
    if (id) router.push(`/room/${encodeURIComponent(id)}`);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-bold text-white">Meet</h1>
        <div className="flex items-center gap-3">
          {user.photoURL && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full"
            />
          )}
          <span className="text-sm text-gray-300">{user.displayName}</span>
          <button
            onClick={() => signOut()}
            className="rounded-md px-3 py-1 text-sm text-gray-300 hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <h2 className="text-3xl font-bold text-white">
            Start or join a meeting
          </h2>
          <p className="mt-2 text-gray-400">
            Create a new room or enter a meeting code to join.
          </p>

          <div className="mt-8 space-y-4">
            <button
              onClick={createRoom}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-500"
            >
              New meeting
            </button>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs uppercase text-gray-500">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                placeholder="Enter meeting code"
                className="flex-1 rounded-lg bg-gray-900 px-4 py-3 text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-blue-500"
              />
              <button
                onClick={joinRoom}
                disabled={!code.trim()}
                className="rounded-lg px-5 py-3 font-medium text-white ring-1 ring-white/20 transition enabled:hover:bg-white/10 disabled:opacity-40"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
