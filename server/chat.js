export const CHAT_MAX = 48;
export const CHAT_COOLDOWN_MS = 800;
export const CHAT_LOG_MAX = 80;

export function sanitizeChat(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX);
}

export function takeChat(gate, raw, now = Date.now()) {
  const text = sanitizeChat(raw);
  if (!text) return { ok: false, error: "請輸入內容" };
  if (gate.lastChatAt && now - gate.lastChatAt < CHAT_COOLDOWN_MS) {
    return { ok: false, error: "說慢一點" };
  }
  gate.lastChatAt = now;
  return { ok: true, text };
}

export function appendRoomChat(room, msg, { matchOnly = true } = {}) {
  if (!room) return null;
  if (matchOnly && !room.game) return null;
  if (!Array.isArray(room.chatLog)) room.chatLog = [];
  const entry = {
    nickname: String(msg?.nickname || "玩家").slice(0, 12),
    text: sanitizeChat(msg?.text),
    playerId: msg?.playerId ? String(msg.playerId).slice(0, 32) : "",
    at: Number(msg?.at) || Date.now(),
  };
  if (!entry.text) return null;
  room.chatLog.push(entry);
  if (room.chatLog.length > CHAT_LOG_MAX) {
    room.chatLog.splice(0, room.chatLog.length - CHAT_LOG_MAX);
  }
  return entry;
}

export function clearRoomChat(room) {
  if (!room) return;
  room.chatLog = [];
}

export function publicChatLog(room) {
  return (room?.chatLog || []).map((m) => ({
    nickname: m.nickname,
    text: m.text,
    playerId: m.playerId,
    at: m.at,
  }));
}
