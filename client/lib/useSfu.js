"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Device } from "mediasoup-client";
import { createWsClient } from "./wsClient";

// Simulcast layers (low / mid / high) so the SFU can adapt per viewer.
const VIDEO_ENCODINGS = [
  { rid: "r0", maxBitrate: 100000, scaleResolutionDownBy: 4 },
  { rid: "r1", maxBitrate: 300000, scaleResolutionDownBy: 2 },
  { rid: "r2", maxBitrate: 900000, scaleResolutionDownBy: 1 },
];

/**
 * Connects to the mediasoup SFU over wss, publishes mic+cam, and consumes every
 * other participant. Returns local stream, remote peers, and media controls.
 */
export function useSfu({ wsUrl, roomId, name, getToken, enabled }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // peerId -> { name, stream, audioOn, videoOn }
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [status, setStatus] = useState("connecting"); // connecting | ready | error
  const [error, setError] = useState(null);

  const rpcRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioProducerRef = useRef(null);
  const videoProducerRef = useRef(null);

  // Add/replace a remote track on a peer's MediaStream (created on first track).
  const addPeerTrack = useCallback((peerId, peerName, track, kind) => {
    setPeers((prev) => {
      const cur = prev[peerId];
      const stream = cur?.stream || new MediaStream();
      stream
        .getTracks()
        .filter((t) => t.kind === kind)
        .forEach((t) => stream.removeTrack(t));
      stream.addTrack(track);
      return {
        ...prev,
        [peerId]: {
          name: peerName || cur?.name || "Guest",
          stream,
          audioOn: cur?.audioOn ?? true,
          videoOn: cur?.videoOn ?? true,
        },
      };
    });
  }, []);

  const setPeerMedia = useCallback((peerId, kind, on) => {
    setPeers((prev) => {
      const cur = prev[peerId];
      if (!cur) return prev;
      return {
        ...prev,
        [peerId]: {
          ...cur,
          ...(kind === "audio" ? { audioOn: on } : { videoOn: on }),
        },
      };
    });
  }, []);

  const removePeer = useCallback((peerId) => {
    setPeers((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !wsUrl || !roomId) return;
    let cancelled = false;

    const consume = async ({ producerId, peerId, name: peerName }) => {
      const rpc = rpcRef.current;
      const recvTransport = recvTransportRef.current;
      const device = deviceRef.current;
      if (!rpc || !recvTransport || !device) return;
      try {
        const params = await rpc.request("consume", {
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        });
        const consumer = await recvTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });
        await rpc.request("resumeConsumer", { consumerId: consumer.id });
        if (cancelled) {
          consumer.close();
          return;
        }
        addPeerTrack(peerId, peerName, consumer.track, params.kind);
      } catch (err) {
        console.error("consume failed:", err?.message || err);
      }
    };

    async function start() {
      try {
        const token = await getToken?.();
        const qs = new URLSearchParams({ roomId, name: name || "Guest" });
        if (token) qs.set("token", token);
        const rpc = createWsClient(`${wsUrl}?${qs.toString()}`);
        rpcRef.current = rpc;

        // Register notifications before any await so none are missed.
        rpc.on("newProducer", (d) => consume(d));
        rpc.on("peerClosed", ({ peerId }) => removePeer(peerId));
        rpc.on("producerPaused", ({ peerId, kind }) => setPeerMedia(peerId, kind, false));
        rpc.on("producerResumed", ({ peerId, kind }) => setPeerMedia(peerId, kind, true));

        await rpc.onceOpen;
        if (cancelled) return;

        // mediasoup Device.
        const routerRtpCapabilities = await rpc.request("getRouterRtpCapabilities");
        const device = new Device();
        await device.load({ routerRtpCapabilities });
        deviceRef.current = device;

        // Send transport (publishing).
        const sendParams = await rpc.request("createWebRtcTransport", { producing: true });
        const sendTransport = device.createSendTransport(sendParams);
        sendTransportRef.current = sendTransport;
        sendTransport.on("connect", ({ dtlsParameters }, cb, errb) => {
          rpc
            .request("connectWebRtcTransport", { transportId: sendTransport.id, dtlsParameters })
            .then(cb)
            .catch(errb);
        });
        sendTransport.on("produce", ({ kind, rtpParameters, appData }, cb, errb) => {
          rpc
            .request("produce", { transportId: sendTransport.id, kind, rtpParameters, appData })
            .then(({ id }) => cb({ id }))
            .catch(errb);
        });

        // Recv transport (subscribing).
        const recvParams = await rpc.request("createWebRtcTransport", { producing: false });
        const recvTransport = device.createRecvTransport(recvParams);
        recvTransportRef.current = recvTransport;
        recvTransport.on("connect", ({ dtlsParameters }, cb, errb) => {
          rpc
            .request("connectWebRtcTransport", { transportId: recvTransport.id, dtlsParameters })
            .then(cb)
            .catch(errb);
        });

        // Local media — publish if available, otherwise join view/listen-only.
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStreamRef.current = stream;
          setLocalStream(stream);

          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];
          if (audioTrack) {
            audioProducerRef.current = await sendTransport.produce({ track: audioTrack });
          }
          if (videoTrack) {
            videoProducerRef.current = await sendTransport.produce({
              track: videoTrack,
              encodings: VIDEO_ENCODINGS,
              codecOptions: { videoGoogleStartBitrate: 1000 },
            });
          }
        } catch (mediaErr) {
          console.warn("getUserMedia failed — joining view-only:", mediaErr?.name);
          setAudioOn(false);
          setVideoOn(false);
        }

        // Consume everyone already in the room.
        const existing = await rpc.request("getProducers");
        for (const p of existing) {
          if (cancelled) return;
          await consume(p);
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("SFU start failed:", err);
        setError(
          err?.message?.includes("WebSocket")
            ? "Cannot reach the media server."
            : err?.message || "Failed to connect."
        );
        setStatus("error");
      }
    }

    start();

    return () => {
      cancelled = true;
      try {
        audioProducerRef.current?.close();
        videoProducerRef.current?.close();
        sendTransportRef.current?.close();
        recvTransportRef.current?.close();
        rpcRef.current?.close();
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      audioProducerRef.current = null;
      videoProducerRef.current = null;
      sendTransportRef.current = null;
      recvTransportRef.current = null;
      rpcRef.current = null;
      deviceRef.current = null;
      localStreamRef.current = null;
      setLocalStream(null);
      setPeers({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, wsUrl, roomId]);

  const toggleAudio = useCallback(async () => {
    const producer = audioProducerRef.current;
    const rpc = rpcRef.current;
    if (!producer || !rpc) return;
    const next = !audioOn;
    try {
      if (next) {
        producer.resume();
        await rpc.request("resumeProducer", { producerId: producer.id });
      } else {
        producer.pause();
        await rpc.request("pauseProducer", { producerId: producer.id });
      }
      setAudioOn(next);
    } catch {
      /* ignore */
    }
  }, [audioOn]);

  const toggleVideo = useCallback(async () => {
    const producer = videoProducerRef.current;
    const rpc = rpcRef.current;
    if (!producer || !rpc) return;
    const next = !videoOn;
    try {
      if (next) {
        producer.resume();
        await rpc.request("resumeProducer", { producerId: producer.id });
      } else {
        producer.pause();
        await rpc.request("pauseProducer", { producerId: producer.id });
      }
      setVideoOn(next);
    } catch {
      /* ignore */
    }
  }, [videoOn]);

  const leave = useCallback(() => {
    try {
      rpcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }, []);

  return {
    localStream,
    peers,
    audioOn,
    videoOn,
    status,
    error,
    toggleAudio,
    toggleVideo,
    leave,
  };
}
