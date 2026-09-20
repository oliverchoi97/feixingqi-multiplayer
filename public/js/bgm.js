import { resolvePlaylistResumeIndex } from "./playlist-resume.js";

const PLAYLIST_ID = "PLxj77DstROao_Y-Ypu-P0jAiNMwK2hHAr";
const PREF_KEY = "giml-bgm";
const API_SRC = "https://www.youtube.com/iframe_api";
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

let player = null;
let wantSound = loadPref();
let soundOn = false;
let failed = false;
let gestureArmed = false;
let skipErrors = 0;
let mode = "playlist";
let playlistIndex = 0;
let playlistVideoId = "";
let playlistOffset = 0;
let resumePending = false;
let resumeAttempts = 0;
let pendingSong = null;

const root = mount();
const toggle = root.querySelector("#bgm-toggle");
const errEl = root.querySelector("#bgm-error");

toggle.addEventListener("click", onToggle);
paint();
loadYouTubeApi()
  .then(createPlayer)
  .catch(() => fail("音樂無法載入。"));

export function playSong(payload) {
  const videoId = String(payload?.videoId || "");
  if (!VIDEO_ID_RE.test(videoId)) return;
  pendingSong = { videoId, title: String(payload?.title || "").slice(0, 80) };
  if (player) startPendingSong();
}

export function bindSongSocket(socket) {
  if (!socket?.on) return;
  socket.on("song", playSong);
}

export async function searchAndPlaySong(query) {
  const q = String(query || "").trim();
  const res = await fetch(`/api/song?q=${encodeURIComponent(q)}`);
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "插歌失敗" };
  }
  if (!data?.ok) return { ok: false, error: data?.error || "插歌失敗" };
  playSong(data);
  return data;
}

function loadPref() {
  try {
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function savePref(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

function mount() {
  const existing = document.getElementById("bgm-root");
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = "bgm-root";
  el.className = "bgm-root";
  el.innerHTML = `
    <div class="bgm-player" aria-hidden="true">
      <div id="bgm-yt"></div>
    </div>
    <button type="button" class="bgm-toggle" id="bgm-toggle" aria-pressed="false">開啟音樂</button>
    <p class="bgm-error" id="bgm-error" hidden></p>
  `;
  document.body.appendChild(el);
  return el;
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      resolve();
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = API_SRC;
      s.async = true;
      s.onerror = () => reject(new Error("api"));
      document.head.appendChild(s);
    }
    const t0 = Date.now();
    const tick = () => {
      if (window.YT?.Player) {
        resolve();
        return;
      }
      if (Date.now() - t0 > 10000) {
        reject(new Error("timeout"));
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

function createPlayer() {
  player = new window.YT.Player("bgm-yt", {
    width: 48,
    height: 48,
    playerVars: {
      autoplay: 1,
      mute: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      iv_load_policy: 3,
      cc_load_policy: 0,
      loop: 1,
      listType: "playlist",
      list: PLAYLIST_ID,
      origin: location.origin,
    },
    events: {
      onReady,
      onStateChange,
      onError,
    },
  });
}

function onReady(e) {
  const p = e.target;
  const iframe = p.getIframe?.();
  if (iframe) {
    iframe.setAttribute("allow", "autoplay; encrypted-media");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
  }
  const list = typeof p.getPlaylist === "function" ? p.getPlaylist() : null;
  if (!list || !list.length) {
    p.loadPlaylist({ listType: "playlist", list: PLAYLIST_ID, index: 0 });
  }
  p.mute();
  p.setVolume(44);
  try {
    p.setLoop(true);
    p.setShuffle(false);
  } catch {
    /* older API */
  }
  p.playVideo();
  if (wantSound) {
    tryUnmute();
    armGestureUnmute();
  }
  startPendingSong();
  paint();
}

function rememberPlaylistPosition() {
  if (!player || mode !== "playlist") return;
  try {
    const idx = player.getPlaylistIndex?.();
    if (Number.isInteger(idx) && idx >= 0) playlistIndex = idx;
  } catch {
    /* player not in a playlist yet */
  }
  try {
    const id = player.getVideoData?.()?.video_id;
    if (VIDEO_ID_RE.test(String(id || ""))) playlistVideoId = id;
  } catch {
    /* ignore */
  }
  try {
    const t = Number(player.getCurrentTime?.());
    if (Number.isFinite(t) && t >= 0) playlistOffset = t;
  } catch {
    /* ignore */
  }
}

function startPendingSong() {
  if (!player || !pendingSong) return;
  const { videoId, title } = pendingSong;
  pendingSong = null;
  rememberPlaylistPosition();
  resumePending = false;
  resumeAttempts = 0;
  mode = "song";
  try {
    player.setLoop(false);
  } catch {
    /* ignore */
  }
  try {
    player.loadVideoById(videoId);
  } catch {
    resumePlaylist();
    return;
  }
  showNowPlaying(title);
  if (wantSound) tryUnmute();
  else {
    try {
      player.mute();
    } catch {
      /* ignore */
    }
  }
}

function resumePlaylist() {
  if (!player) return;
  mode = "playlist";
  showNowPlaying("");
  resumePending = true;
  resumeAttempts = 0;
  const index = resolvePlaylistResumeIndex(playlistIndex, playlistVideoId, []);
  // loadVideoById drops playlist context. Reload at the interrupted index (same
  // item), never index 0 just because the insert ended. IFrame startSeconds is
  // often ignored after a single-video load, so that item restarts from 0s;
  // finishPlaylistResume() then playVideoAt() if loadPlaylist ignored `index`.
  try {
    player.loadPlaylist({
      listType: "playlist",
      list: PLAYLIST_ID,
      index,
      startSeconds: playlistOffset > 1 ? Math.floor(playlistOffset) : 0,
    });
    player.setLoop(true);
  } catch {
    try {
      player.playVideo();
    } catch {
      /* ignore */
    }
  }
  if (wantSound) tryUnmute();
  else {
    try {
      player.mute();
    } catch {
      /* ignore */
    }
  }
}

function finishPlaylistResume() {
  if (!resumePending || !player) return;
  const list = typeof player.getPlaylist === "function" ? player.getPlaylist() || [] : [];
  if (!list.length) return;
  const want = resolvePlaylistResumeIndex(playlistIndex, playlistVideoId, list);
  playlistIndex = want;
  let have = -1;
  try {
    have = player.getPlaylistIndex();
  } catch {
    have = -1;
  }
  if (have !== want && typeof player.playVideoAt === "function") {
    resumeAttempts += 1;
    if (resumeAttempts > 4) {
      resumePending = false;
      return;
    }
    try {
      player.playVideoAt(want);
    } catch {
      resumePending = false;
    }
    return;
  }
  resumePending = false;
  resumeAttempts = 0;
}

function showNowPlaying(title) {
  const text = String(title || "").trim();
  errEl.classList.toggle("bgm-now", Boolean(text));
  if (!text) {
    if (!failed) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    return;
  }
  errEl.hidden = false;
  errEl.textContent = `▶ ${text}`;
}

function onStateChange(e) {
  const YT = window.YT;
  if (!player || !YT) return;
  if (e.data === YT.PlayerState.ENDED) {
    loopPlaylist();
    return;
  }
  if (e.data === YT.PlayerState.PLAYING) {
    skipErrors = 0;
    if (mode === "playlist") {
      finishPlaylistResume();
      if (!resumePending) rememberPlaylistPosition();
    }
    if (wantSound && player.isMuted()) armGestureUnmute();
    return;
  }
  if (e.data === YT.PlayerState.CUED) {
    if (mode === "playlist" && resumePending) {
      finishPlaylistResume();
      if (resumeAttempts > 0) return;
    }
    player.playVideo();
  }
}

function loopPlaylist() {
  if (!player) return;
  if (mode === "song") {
    resumePlaylist();
    return;
  }
  const list = typeof player.getPlaylist === "function" ? player.getPlaylist() || [] : [];
  const idx = typeof player.getPlaylistIndex === "function" ? player.getPlaylistIndex() : 0;
  try {
    player.setLoop(true);
  } catch {
    /* ignore */
  }
  if (list.length && idx >= list.length - 1) player.playVideoAt(0);
  else if (typeof player.nextVideo === "function" && list.length) player.nextVideo();
  else player.playVideo();
}

function onError() {
  if (mode === "song") {
    resumePlaylist();
    return;
  }
  skipErrors += 1;
  if (skipErrors > 12) {
    fail("音樂無法播放。播放清單可能已設為私人，或影片禁止嵌入。");
    return;
  }
  try {
    player?.nextVideo();
  } catch {
    fail("音樂無法播放。播放清單可能已設為私人，或影片禁止嵌入。");
  }
}

function fail(message) {
  failed = true;
  soundOn = false;
  errEl.hidden = false;
  errEl.textContent = message;
  toggle.disabled = true;
  paint();
}

function tryUnmute() {
  if (failed) return false;
  wantSound = true;
  savePref(true);
  if (!player) {
    soundOn = false;
    paint();
    return false;
  }
  soundOn = true;
  paint();
  try {
    player.unMute();
    player.setVolume(44);
    player.playVideo();
  } catch {
    soundOn = false;
    paint();
    return false;
  }
  setTimeout(() => {
    if (!player || failed || !wantSound) return;
    if (player.isMuted()) {
      soundOn = false;
      paint();
      armGestureUnmute();
    }
  }, 500);
  return true;
}

function muteNow() {
  wantSound = false;
  soundOn = false;
  gestureArmed = false;
  savePref(false);
  try {
    player?.mute();
  } catch {
    /* ignore */
  }
  paint();
}

function onToggle() {
  if (failed) return;
  if (soundOn) {
    muteNow();
    return;
  }
  wantSound = true;
  savePref(true);
  if (!tryUnmute()) armGestureUnmute();
  paint();
}

function armGestureUnmute() {
  if (gestureArmed || soundOn || failed) return;
  gestureArmed = true;
  const resume = (e) => {
    if (!wantSound || soundOn) return;
    if (e.target?.closest?.("#bgm-toggle")) return;
    tryUnmute();
  };
  window.addEventListener("pointerdown", resume, { once: true, capture: true });
  window.addEventListener("keydown", resume, { once: true, capture: true });
}

function paint() {
  if (failed) {
    toggle.textContent = "音樂無法播放";
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "音樂無法播放");
    return;
  }
  if (soundOn) {
    toggle.textContent = "靜音";
    toggle.setAttribute("aria-pressed", "true");
    toggle.setAttribute("aria-label", "關閉背景音樂");
    if (!errEl.classList.contains("bgm-now")) errEl.hidden = true;
    return;
  }
  toggle.textContent = "開啟音樂";
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", "開啟背景音樂");
}
