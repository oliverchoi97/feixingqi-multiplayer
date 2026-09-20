import { parseSongCommand, sanitizeSongQuery, takeSong, SONG_COOLDOWN_MS } from "../shared/song.js";

// YouTube Data API v3 search.list. Set YOUTUBE_API_KEY or GOOGLE_API_KEY in the
// environment (never commit a key). On Render: Dashboard → Environment → add
// YOUTUBE_API_KEY, and enable YouTube Data API v3 on the Google Cloud project.

export { parseSongCommand, sanitizeSongQuery, takeSong, SONG_COOLDOWN_MS };

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function youtubeApiKey() {
  return String(process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export async function searchYouTubeVideo(query, { fetchImpl = fetch, key = youtubeApiKey() } = {}) {
  if (!key) return { ok: false, error: "插歌未設定 API key" };
  const q = sanitizeSongQuery(query);
  if (!q) return { ok: false, error: "請輸入歌名，例如 /song 周杰倫 晴天" };
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("relevanceLanguage", "zh-Hant");
  url.searchParams.set("q", q);
  url.searchParams.set("key", key);
  let res;
  try {
    res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch {
    return { ok: false, error: "插歌搜尋失敗，請稍後再試" };
  }
  if (!res.ok) return { ok: false, error: "插歌搜尋失敗，請稍後再試" };
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "找不到這首歌" };
  }
  const item = data?.items?.[0];
  const videoId = item?.id?.videoId;
  const title = decodeEntities(item?.snippet?.title || q).slice(0, 80);
  if (!VIDEO_ID_RE.test(String(videoId || ""))) return { ok: false, error: "找不到這首歌" };
  return { ok: true, videoId, title };
}
