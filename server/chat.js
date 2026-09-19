export const CHAT_MAX = 48;
export const CHAT_COOLDOWN_MS = 800;

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
