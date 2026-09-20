import { bindChatBar, setChatOpen, spawnDanmaku } from "./danmaku.js";
import { bindSongSocket } from "./bgm.js";
import { bindSessionButtons, setInMatch } from "./session-nav.js";

const socket = window.io("/draw");
const $ = (id) => document.getElementById(id);
const PATH = "/drawguess";

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
let drawing = false;
let lastPt = null;
let color = "#2a1f14";
let brush = 4;

const canvas = $("draw");
const ctx = canvas.getContext("2d");

const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
if (me.nickname) $("nickname").value = me.nickname;

$("btn-create").onclick = () => {
  saveNick();
  socket.emit("create", { nickname: me.nickname, playerId: me.playerId });
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
$("btn-guess").onclick = sendGuess;
$("guess-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendGuess();
});
$("btn-clear").onclick = () => socket.emit("clearCanvas");

document.querySelectorAll("[data-color]").forEach((btn) => {
  btn.onclick = () => {
    color = btn.dataset.color;
    brush = color === "#ffffff" ? 16 : 4;
    document.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b === btn));
  };
});

bindDraw();
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
  lobby = view;
  game = null;
  readyOn = view.ready;
  $("winner-modal").hidden = true;
  chatLog.clear();
  show("lobby");
  renderLobby(view);
});
socket.on("state", (view) => {
  const sameStrokes = game && game.strokes?.length === view.strokes?.length;
  game = view;
  lobby = lobby || { code: view.code };
  show("play");
  renderPlay(view, { replay: !sameStrokes });
  if (view.phase === "ended") {
    $("winner-title").textContent = view.winner
      ? `${view.winner.name} 最高分（${view.winner.score}）`
      : "這一局結束";
    $("winner-modal").hidden = false;
  }
});
socket.on("stroke", (s) => {
  if (!game) return;
  game.strokes.push(s);
  drawStroke(s);
});
socket.on("cleared", () => {
  if (game) game.strokes = [];
  clearCanvas();
});
socket.on("errorMsg", (msg) => toast(msg));
socket.on("chat", (msg) => {
  spawnDanmaku($("danmaku-layer"), { name: msg.nickname, text: msg.text }, escapeHtml);
  chatLog.append(msg);
});
socket.on("chatLog", (list) => chatLog.replace(list));

if (me.playerId && params.get("room")) {
  saveNick();
  socket.emit("join", { code: params.get("room"), nickname: me.nickname, playerId: me.playerId });
}

function joinTyped() {
  saveNick();
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return toast("請輸入房間代碼");
  socket.emit("join", { code, nickname: me.nickname, playerId: me.playerId });
}

function renderLobby(view) {
  $("lobby-code").textContent = view.code;
  $("btn-ready").textContent = view.ready ? "取消準備" : "準備";
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = view.canStart
    ? "可以開局。輪流當畫家，其他人猜詞。"
    : "至少兩人準備後開局。沒有電腦。";
  $("lobby-seats").innerHTML = view.players
    .map((p) => {
      const tag = p.you ? "你" : p.connected ? "在線" : "離線";
      const ready = p.ready ? "已準備" : "未準備";
      const host = p.isHost ? "（房主）" : "";
      return `<div class="seat"><i class="swatch red"></i><div>${escapeHtml(p.name)}${host}</div><span>${tag} · ${ready}</span></div>`;
    })
    .join("");
}

function renderPlay(view, { replay } = {}) {
  $("game-code").textContent = view.code;
  $("turn-banner").textContent =
    view.phase === "ended"
      ? "本局結束"
      : view.phase === "reveal"
        ? `答案是「${view.word}」`
        : view.youDrawer
          ? `你來畫：${view.word}`
          : `${view.drawerName} 作畫中 · ${view.hint}`;
  $("player-list").innerHTML = view.scores
    .map((p) => {
      const you = p.you ? "（你）" : "";
      const draw = p.playerId === view.drawerId ? " · 畫家" : "";
      return `<div class="player${p.playerId === view.drawerId ? " active" : ""}"><i class="swatch ${p.you ? "red" : "blue"}"></i><div>${escapeHtml(p.name)}${you}${draw}</div><span>${p.score} 分</span></div>`;
    })
    .join("");
  $("guess-row").hidden = view.youDrawer || view.phase !== "drawing";
  $("draw-tools").hidden = !view.youDrawer || view.phase !== "drawing";
  if (replay !== false) {
    clearCanvas();
    for (const s of view.strokes || []) drawStroke(s);
  }
}

function sendGuess() {
  const text = $("guess-input").value.trim();
  if (!text) return;
  socket.emit("guess", text);
  $("guess-input").value = "";
}

function bindDraw() {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  };
  const down = (e) => {
    if (!game?.youDrawer || game.phase !== "drawing") return;
    e.preventDefault();
    drawing = true;
    lastPt = pos(e);
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!drawing || !lastPt) return;
    e.preventDefault();
    const pt = pos(e);
    const stroke = { x1: lastPt.x, y1: lastPt.y, x2: pt.x, y2: pt.y, color, w: brush };
    socket.emit("stroke", stroke);
    drawStroke(stroke);
    lastPt = pt;
  };
  const up = () => {
    drawing = false;
    lastPt = null;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
}

function clearCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStroke(s) {
  ctx.strokeStyle = s.color || "#2a1f14";
  ctx.lineWidth = s.w || 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.x1 * canvas.width, s.y1 * canvas.height);
  ctx.lineTo(s.x2 * canvas.width, s.y2 * canvas.height);
  ctx.stroke();
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  setChatOpen($("chat-bar"), name === "lobby" || name === "play");
  setInMatch(name === "play");
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
    return JSON.parse(sessionStorage.getItem("giml-draw") || "{}");
  } catch {
    return {};
  }
}

function saveSession() {
  sessionStorage.setItem("giml-draw", JSON.stringify(me));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

clearCanvas();
