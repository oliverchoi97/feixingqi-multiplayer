export const SONG_QUERY_MAX = 56;
export const SONG_COOLDOWN_MS = 20_000;
export const SONG_INPUT_MAX = 72;

export function sanitizeSongQuery(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SONG_QUERY_MAX);
}

export function parseSongCommand(raw) {
  const text = String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = text.match(/^\/song\s*(.*)$/i);
  if (!m) return { ok: false, isSong: false };
  const query = sanitizeSongQuery(m[1]);
  if (!query) {
    return { ok: false, isSong: true, error: "請輸入歌名，例如 /song 周杰倫 晴天" };
  }
  return { ok: true, isSong: true, query };
}

export function takeSong(gates, raw, now = Date.now()) {
  const parsed = parseSongCommand(raw);
  if (!parsed.isSong) return parsed;
  if (!parsed.ok) return parsed;
  const list = (Array.isArray(gates) ? gates : [gates]).filter(Boolean);
  for (const g of list) {
    if (g.lastSongAt && now - g.lastSongAt < SONG_COOLDOWN_MS) {
      return { ok: false, isSong: true, error: "插歌太頻繁，請稍等一下" };
    }
  }
  for (const g of list) g.lastSongAt = now;
  return parsed;
}
