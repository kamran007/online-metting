const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OFF: @livekit/components-react GridLayout breaks under React 19 StrictMode
  // double-render ("Element not part of the array ..._camera_placeholder").
  reactStrictMode: false,
  // LAN devices hitting the dev server (HMR/_next assets).
  allowedDevOrigins: ["192.168.68.*"],
  // Pin the workspace root (root + client both have lockfiles).
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

module.exports = nextConfig;
