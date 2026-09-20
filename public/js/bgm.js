const PLAYLIST_ID = "PLxj77DstROao_Y-Ypu-P0jAiNMwK2hHAr";
const PREF_KEY = "giml-bgm";
const API_SRC = "https://www.youtube.com/iframe_api";

let player = null;
let wantSound = loadPref();
let soundOn = false;
let failed = false;
let gestureArmed = false;
let skipErrors = 0;

const root = mount();
const toggle = root.querySelector("#bgm-toggle");
const errEl = root.querySelector("#bgm-error");

toggle.addEventListener("click", onToggle);
paint();
loadYouTubeApi()
  .then(createPlayer)
  .catch(() => fail("音樂無法載入。"));

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
  paint();
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
    if (wantSound && player.isMuted()) armGestureUnmute();
    return;
  }
  if (e.data === YT.PlayerState.CUED) {
    player.playVideo();
  }
}

function loopPlaylist() {
  if (!player) return;
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
  if (!player || failed) return false;
  try {
    player.unMute();
    player.setVolume(44);
    player.playVideo();
    soundOn = !player.isMuted();
  } catch {
    soundOn = false;
  }
  if (soundOn) {
    wantSound = true;
    savePref(true);
  }
  paint();
  return soundOn;
}

function muteNow() {
  wantSound = false;
  soundOn = false;
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
    errEl.hidden = true;
    return;
  }
  toggle.textContent = "開啟音樂";
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", "開啟背景音樂");
}
