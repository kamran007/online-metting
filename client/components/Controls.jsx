"use client";

export default function Controls({
  audioOn,
  videoOn,
  onToggleAudio,
  onToggleVideo,
  onLeave,
}) {
  return (
    <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-gray-950/80 px-4 py-4 backdrop-blur">
      <CircleButton active={audioOn} onClick={onToggleAudio} label={audioOn ? "Mute" : "Unmute"}>
        {audioOn ? <MicIcon /> : <MicOffIcon />}
      </CircleButton>

      <CircleButton
        active={videoOn}
        onClick={onToggleVideo}
        label={videoOn ? "Stop video" : "Start video"}
      >
        {videoOn ? <CamIcon /> : <CamOffIcon />}
      </CircleButton>

      <button
        onClick={onLeave}
        title="Leave"
        className="flex h-12 items-center gap-2 rounded-full bg-red-600 px-6 font-medium text-white transition hover:bg-red-500"
      >
        <PhoneIcon />
        Leave
      </button>
    </div>
  );
}

function CircleButton({ active, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
        active ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-600 text-white hover:bg-red-500"
      }`}
    >
      {children}
    </button>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function MicIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...stroke}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 3l18 18M9 9v3a3 3 0 005.12 2.12M15 11V6a3 3 0 00-5.94-.6M5 11a7 7 0 0011 4.9M12 18v3" />
    </svg>
  );
}
function CamIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...stroke}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M22 8l-7 4 7 4V8z" />
    </svg>
  );
}
function CamOffIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 3l18 18M22 8l-7 4M15 11V8a2 2 0 00-2-2H7M4 6.5A2 2 0 002 8v8a2 2 0 002 2h9" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" {...stroke}>
      <path d="M21 16.5A19 19 0 017.5 3 2 2 0 019.6 1.1l1.7.4a2 2 0 011.5 1.7l.3 2a2 2 0 01-.6 1.7l-1 1a14 14 0 005.4 5.4l1-1a2 2 0 011.7-.6l2 .3a2 2 0 011.7 1.5l.4 1.7A2 2 0 0121 16.5z" />
    </svg>
  );
}
