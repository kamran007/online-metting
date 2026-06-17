import os from "os";

const num = (v, d) => (v ? Number(v) : d);

export const config = {
  // ws/http signaling port
  listenPort: num(process.env.PORT, 4000),
  // Allowed browser origin(s) for the WebSocket upgrade. "*" disables the check.
  clientOrigin: process.env.CLIENT_ORIGIN || "*",

  // One mediasoup worker per CPU core by default.
  numWorkers: num(process.env.NUM_WORKERS, Object.keys(os.cpus()).length),

  worker: {
    // UDP/TCP port range the SFU uses for RTC media. MUST be open on the host
    // firewall (and published if running in Docker).
    rtcMinPort: num(process.env.RTC_MIN_PORT, 40000),
    rtcMaxPort: num(process.env.RTC_MAX_PORT, 40100),
    logLevel: process.env.MS_LOG_LEVEL || "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  },

  // Codecs the router will negotiate. Order matters: VP8 first, then H264.
  router: {
    mediaCodecs: [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { "x-google-start-bitrate": 1000 },
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "42e01f",
          "level-asymmetry-allowed": 1,
          "x-google-start-bitrate": 1000,
        },
      },
    ],
  },

  webRtcTransport: {
    // ip 0.0.0.0 = listen on all interfaces. announcedIp = the address clients
    // must reach the server on (your VPS public IP). Localhost dev: 127.0.0.1.
    listenIps: [
      {
        ip: process.env.LISTEN_IP || "0.0.0.0",
        announcedIp: process.env.ANNOUNCED_IP || "127.0.0.1",
      },
    ],
    initialAvailableOutgoingBitrate: 1000000,
    maxIncomingBitrate: 1500000,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  },
};
