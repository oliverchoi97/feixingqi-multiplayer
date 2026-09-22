import { bindChatBar, setChatOpen, spawnDanmaku } from "./danmaku.js";
import { bindSongSocket } from "./bgm.js";
import { bindSessionButtons, setInMatch } from "./session-nav.js";

const KIND = document.body.dataset.kind;
const PATH = document.body.dataset.path;
const socket = window.io("/party");
const $ = (id) => document.getElementById(id);

const screens = {
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  play: $("screen-play"),
};

let me = loadSession();
let lobby = null;
let game = null;
let readyOn = false;
let lastChatAt = 0;
let timerId = 0;

const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
if (me.nickname) $("nickname").value = me.nickname;

$("btn-create").onclick = () => {
  saveNick();
  socket.emit("create", { kind: KIND, nickname: me.nickname, playerId: me.playerId });
};
$("btn-join").onclick = joinTyped;
$("join-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinTyped();
});
$("btn-ready").onclick = () => {
  readyOn = !readyOn;
  socket.emit("ready", readyOn);
};
$("btn-start").onclick = () => socket.emit("start");
$("btn-copy").onclick = async () => {
  if (!lobby) return;
  const url = `${location.origin}${PATH}?room=${lobby.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("已複製房間連結");
  } catch {
    prompt("複製這個連結", url);
  }
};
$("btn-leave").onclick = () => location.assign(PATH);
$("btn-guess")?.addEventListener("click", sendGuess);
$("guess-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendGuess();
});
$("btn-play-card")?.addEventListener("click", () => socket.emit("move", { play: true }));
$("btn-slap")?.addEventListener("click", () => socket.emit("move", { slap: true }));
$("btn-draw")?.addEventListener("click", () => socket.emit("move", { draw: true }));
$("btn-random-fleet")?.addEventListener("click", () => socket.emit("move", { fleet: null }));
$("btn-set-secret")?.addEventListener("click", sendSecret);
$("btn-random-secret")?.addEventListener("click", () => socket.emit("move", { random: true }));
$("secret-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendSecret();
});

const chatLog = bindChatBar($("chat-bar"), { onSend: sendChat });
bindSongSocket(socket);
bindSessionButtons({
  socket,
  lobbyPath: PATH,
  hasRoom: () => Boolean(lobby || game),
  onGoLobby: () => {
    game = null;
    $("winner-modal").hidden = true;
    chatLog.clear();
    if (lobby) {
      show("lobby");
      renderLobby(lobby);
    } else show("home");
  },
});

socket.on("joined", (payload) => {
  me.playerId = payload.playerId;
  me.room = payload.code;
  saveSession();
  history.replaceState({}, "", `${PATH}?room=${payload.code}`);
});
socket.on("lobby", (view) => {
  const leftPlay = Boolean(game);
  lobby = view;
  game = null;
  readyOn = view.ready;
  $("winner-modal").hidden = true;
  if (leftPlay) chatLog.clear();
  show("lobby");
  renderLobby(view);
});
socket.on("started", () => show("play"));
socket.on("state", (view) => {
  game = view;
  lobby = lobby || { code: view.code };
  show("play");
  renderPlay(view);
  if (view.phase === "ended") {
    $("winner-title").textContent = endTitle(view);
    $("winner-modal").hidden = false;
  }
});
socket.on("errorMsg", (msg) => toast(msg));
socket.on("chat", (msg) => {
  spawnDanmaku($("danmaku-layer"), { name: msg.nickname, text: msg.text }, escapeHtml);
  chatLog.append(msg);
});
socket.on("chatLog", (list) => chatLog.replace(list));

if (me.playerId && params.get("room")) {
  saveNick();
  socket.emit("join", { code: params.get("room"), kind: KIND, nickname: me.nickname, playerId: me.playerId });
}

function joinTyped() {
  saveNick();
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return toast("請輸入房間代碼");
  socket.emit("join", { code, kind: KIND, nickname: me.nickname, playerId: me.playerId });
}

function renderLobby(view) {
  $("lobby-code").textContent = view.code;
  $("btn-ready").textContent = view.ready ? "取消準備" : "準備";
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = lobbyHint(view);
  $("lobby-seats").innerHTML = view.players
    .map((p) => {
      const tag = p.you ? "你" : p.connected ? "在線" : "離線";
      const ready = p.ready ? "已準備" : "未準備";
      const host = p.isHost ? "（房主）" : "";
      return `<div class="seat"><i class="swatch ${p.isHost ? "red" : "blue"}"></i><div>${escapeHtml(p.name)}${host}</div><span>${tag} · ${ready}</span></div>`;
    })
    .join("");
}

function lobbyHint(view) {
  if (view.canStart) return "可以開局。";
  if (KIND === "hammintoi") return `至少 ${view.min} 人連線。空位不會由電腦補上。`;
  if (KIND === "oldmaid") return "預設四人。一人也可開，空位由電腦補上。";
  if (KIND === "battleship") return "兩人對戰。一人也可開，空位由電腦補上。佈署 60 秒、射擊每回合 30 秒。";
  return "兩人以上時由房主出四位密碼，其餘人輪流猜。一人對電腦則系統出題。先 4A 者勝。";
}

function renderPlay(view) {
  $("game-code").textContent = view.code;
  $("turn-banner").textContent = playBanner(view);
  $("player-list").innerHTML = (view.seats || [])
    .map((s) => {
      const extra = s.cards != null ? `${s.cards} 張` : s.active ? "行動中" : "";
      return `<div class="player${s.active ? " active" : ""}"><i class="swatch ${s.you ? "red" : "blue"}"></i><div>${escapeHtml(s.name)}${s.you ? "（你）" : s.type === "ai" ? "（電腦）" : ""}</div><span>${extra}</span></div>`;
    })
    .join("");
  $("play-event").textContent = view.lastEvent || "";
  tickTimer(view);
  hideKindUi();
  if (view.kind === "oneatwob") render1a2b(view);
  if (view.kind === "battleship") renderSea(view);
  if (view.kind === "hammintoi") renderSlap(view);
  if (view.kind === "oldmaid") renderMaid(view);
}

function hideKindUi() {
  for (const id of ["panel-1a2b", "panel-sea", "panel-slap", "panel-maid"]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
}

function playBanner(view) {
  if (view.phase === "ended") return endTitle(view);
  if (view.kind === "oneatwob" && view.phase === "set") {
    return view.yourSet ? "請設定四位不重複數字" : `${view.setterName || "出題者"} 正在出題`;
  }
  if (view.kind === "battleship" && view.phase === "place") {
    return view.youReady ? "等待對手鎖定陣形" : "佈署艦艇（60 秒）";
  }
  if (view.kind === "battleship" && view.phase === "shot") {
    return view.yourTurn ? "開火（30 秒）" : "等待對手射擊（30 秒）";
  }
  if (view.slapOpen) return "對子！快冚棉胎";
  return view.yourTurn ? "輪到你" : "等待對手";
}

function endTitle(view) {
  if (view.loser) return `${view.loser.name} 抽到烏龜`;
  if (view.winner) return `${view.winner.name} 獲勝`;
  return "這一局結束";
}

function render1a2b(view) {
  const box = $("panel-1a2b");
  box.hidden = false;
  const setRow = $("set-row-1a2b");
  if (setRow) setRow.hidden = view.phase !== "set" || !view.yourSet;
  $("guess-row-1a2b").hidden = !view.yourTurn || view.phase !== "playing";
  $("history-1a2b").innerHTML = (view.history || [])
    .map((h) => `<li>${escapeHtml(h.name)}　${h.guess}　${h.a}A${h.b}B</li>`)
    .join("");
}

function renderSea(view) {
  const box = $("panel-sea");
  box.hidden = false;
  $("btn-random-fleet").hidden = view.phase !== "place" || view.youReady;
  paintGrid($("sea-own"), view.own?.grid || [], view.size, { ships: true, disabled: true });
  const foe = view.phase === "ended" ? view.foeShots : view.own?.shots || [];
  paintGrid($("sea-foe"), foe, view.size, {
    shots: true,
    disabled: !view.yourTurn || view.phase !== "shot",
    onClick: (x, y) => socket.emit("move", { x, y }),
  });
}

function paintGrid(el, cells, size, { ships, shots, disabled, onClick } = {}) {
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.innerHTML = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = cells[y * size + x] || 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sea-cell";
      if (ships && v) btn.classList.add("ship");
      if (shots && v === 1) btn.classList.add("miss");
      if (shots && v === 2) btn.classList.add("hit");
      btn.disabled = !!disabled;
      btn.onclick = () => onClick?.(x, y);
      el.appendChild(btn);
    }
  }
}

function renderSlap(view) {
  const box = $("panel-slap");
  box.hidden = false;
  $("btn-play-card").hidden = !view.yourTurn;
  $("btn-slap").hidden = !view.slapOpen;
  $("btn-slap").disabled = view.youSlapped;
  $("pile-card").textContent = view.top ? `${view.top.suit}${view.top.rank}` : "空";
  $("hand-count").textContent = `你還有 ${view.handCount} 張`;
}

function renderMaid(view) {
  const box = $("panel-maid");
  box.hidden = false;
  $("btn-draw").hidden = !view.yourTurn;
  $("maid-hand").innerHTML = (view.hand || [])
    .map((c) => `<span class="card-chip">${c.suit}${c.rank}</span>`)
    .join("");
}

function tickTimer(view) {
  clearInterval(timerId);
  const el = $("clock");
  if (!el) return;
  const end = view.phase === "place" ? view.placeEndsAt : view.phase === "shot" ? view.shotEndsAt : view.slapUntil;
  if (!end) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const tick = () => {
    const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    el.textContent = `${s} 秒`;
  };
  tick();
  timerId = setInterval(tick, 250);
}

function sendGuess() {
  const input = $("guess-input");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("move", { guess: text });
  input.value = "";
}

function sendSecret() {
  const input = $("secret-input");
  const text = input?.value.trim() || "";
  if (!text) return toast("請輸入四位不重複數字");
  socket.emit("move", { secret: text });
  if (input) input.value = "";
}

function sendChat(text) {
  if (/^\/song/i.test(text)) {
    socket.emit("chat", text);
    return true;
  }
  const now = Date.now();
  if (now - lastChatAt < 800) {
    toast("說慢一點");
    return false;
  }
  lastChatAt = now;
  socket.emit("chat", text);
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  setChatOpen($("chat-bar"), name === "lobby" || name === "play");
  setInMatch(name === "play");
}

function toast(msg) {
  const el = $("toast");
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function saveNick() {
  me.nickname = $("nickname").value.trim() || "玩家";
  saveSession();
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(`giml-${KIND}`) || "{}");
  } catch {
    return {};
  }
}

function saveSession() {
  try {
    sessionStorage.setItem(`giml-${KIND}`, JSON.stringify({ nickname: me.nickname, playerId: me.playerId, room: me.room }));
  } catch {
    /* private */
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
