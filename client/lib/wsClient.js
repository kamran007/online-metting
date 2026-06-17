"use client";

/**
 * Minimal request/response + notification layer over a raw WebSocket.
 *
 * Wire format:
 *   request:      { id, method, data }
 *   response:     { id, ok, data } | { id, ok:false, error }
 *   notification: { notification:true, method, data }
 */
export function createWsClient(url) {
  const ws = new WebSocket(url);
  const pending = new Map(); // id -> { resolve, reject }
  const listeners = new Map(); // method -> Set<cb>
  let nextId = 1;

  const onceOpen = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("WebSocket connection failed")));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.notification) {
      const set = listeners.get(msg.method);
      if (set) set.forEach((cb) => cb(msg.data));
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new Error(msg.error || "rpc error"));
  });

  return {
    ws,
    onceOpen,
    request(method, data) {
      return new Promise((resolve, reject) => {
        if (ws.readyState !== ws.OPEN) {
          reject(new Error("socket not open"));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, data }));
      });
    },
    on(method, cb) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(cb);
      return () => listeners.get(method)?.delete(cb);
    },
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
