"use client";

import { useEffect, useRef } from "react";

export default function VideoTile({
  stream,
  name,
  muted = false,
  isLocal = false,
  audioOn = true,
  videoOn = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-900 ring-1 ring-white/10">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${videoOn ? "" : "hidden"} ${
          isLocal ? "scale-x-[-1]" : ""
        }`}
      />

      {!videoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-semibold text-white">
            {initial}
          </div>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
        {!audioOn && <MicOffIcon />}
        <span className="max-w-[10rem] truncate">
          {name}
          {isLocal ? " (You)" : ""}
        </span>
      </div>
    </div>
  );
}

function MicOffIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3l18 18M9 9v3a3 3 0 005.12 2.12M15 11V5a3 3 0 00-5.94-.6M17 11a5 5 0 01-.54 2.27M12 19v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
