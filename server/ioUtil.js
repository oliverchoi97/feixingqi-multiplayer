/** Socket.IO 4 Namespace.sockets is a Map; some adapters nest `.sockets`. */
export function nspSocketMap(nsp) {
  if (!nsp) return new Map();
  const sockets = nsp.sockets;
  if (sockets?.sockets && typeof sockets.sockets.get === "function") return sockets.sockets;
  if (sockets && typeof sockets.get === "function") return sockets;
  return new Map();
}

export function eachRoomSocket(nsp, code, fn) {
  if (!nsp || !code) return;
  const seen = new Set();
  const map = nspSocketMap(nsp);
  const room = nsp.adapter?.rooms?.get(String(code));
  if (room) {
    for (const id of room) {
      const sock = map.get(id);
      if (!sock) continue;
      seen.add(id);
      fn(sock);
    }
  }
  return seen;
}

/** Per-viewer lobby/state emit so the host sees joiners immediately. */
export function broadcastViews(nsp, room, emitFor) {
  const map = nspSocketMap(nsp);
  const seen = eachRoomSocket(nsp, room.code, (sock) => {
    emitFor(sock, sock.data?.playerId);
  }) || new Set();
  for (const p of room.players || []) {
    if (!p.socketId || p.type === "ai" || seen.has(p.socketId)) continue;
    const sock = map.get(p.socketId);
    if (sock) emitFor(sock, p.playerId);
  }
}
