import { bindChatBar, setChatOpen, spawnDanmaku } from "./danmaku.js";
import { bindSessionButtons, setInMatch } from "./session-nav.js";
import { boardLayout, cellCenter, eventOffset, hitCell } from "/shared/boardLayout.js";

const KIND = document.body.dataset.kind;
const PATH = document.body.dataset.path;
const socket = window.io("/table");
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
let layout = null;
let hover = null;

const canvas = $("board");
const ctx = canvas.getContext("2d");

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
$("btn-pass")?.addEventListener("click", () => socket.emit("move", { pass: true }));

canvas.addEventListener("click", (e) => {
  if (!game?.yourTurn || game.phase !== "playing") return;
  const { px, py } = eventOffset(canvas, e);
  const hit = hitCell(layout, px, py);
  if (!hit) return;
  socket.emit("move", KIND === "guosanguan" ? { index: hit.i } : { x: hit.x, y: hit.y });
});
canvas.addEventListener("pointermove", (e) => {
  if (!game || game.kind === "guosanguan" || game.phase !== "playing") return;
  const { px, py } = eventOffset(canvas, e);
  const hit = hitCell(layout, px, py);
  const key = hit ? `${hit.x},${hit.y}` : "";
  if (key === (hover ? `${hover.x},${hover.y}` : "")) return;
  hover = hit;
  paintBoard(game);
});
canvas.addEventListener("pointerleave", () => {
  if (!hover) return;
  hover = null;
  if (game && game.kind !== "guosanguan") paintBoard(game);
});

if (KIND === "guosanguan") {
  $("ttt").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-i]");
    if (!btn || !game?.yourTurn) return;
    socket.emit("move", { index: Number(btn.dataset.i) });
  });
}

bindChatBar($("chat-bar"), { onSend: sendChat });
bindSessionButtons({
  socket,
  lobbyPath: PATH,
  hasRoom: () => Boolean(lobby || game),
  onGoLobby: () => {
    game = null;
    $("winner-modal").hidden = true;
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
  show("lobby");
  renderLobby(view);
});

socket.on("started", () => show("play"));

socket.on("state", (view) => {
  game = view;
  lobby = lobby || { code: view.code };
  show("play");
  renderPlay(view);
  requestAnimationFrame(() => {
    if (game === view) renderPlay(view);
  });
  if (view.phase === "ended") showWinner(view);
});

socket.on("errorMsg", (msg) => toast(msg));
socket.on("chat", (msg) => {
  spawnDanmaku($("danmaku-layer"), { name: msg.nickname, text: msg.text }, escapeHtml);
});

if (me.playerId && params.get("room")) {
  saveNick();
  socket.emit("join", {
    kind: KIND,
    code: params.get("room"),
    nickname: me.nickname,
    playerId: me.playerId,
  });
}

function joinTyped() {
  saveNick();
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return toast("請輸入房間代碼");
  socket.emit("join", { kind: KIND, code, nickname: me.nickname, playerId: me.playerId });
}

function renderLobby(view) {
  $("lobby-code").textContent = view.code;
  $("btn-ready").textContent = view.ready ? "取消準備" : "準備";
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = view.canStart
    ? view.players.length < 2
      ? "你已準備。開局後空位由電腦執白。"
      : "雙方已準備，可以開局。"
    : "準備後開局；若只有一人，空位由電腦補上。";
  $("lobby-seats").innerHTML = view.players
    .map((p) => {
      const tag = p.you ? "你" : p.connected ? "在線" : "離線";
      const ready = p.ready ? "已準備" : "未準備";
      const host = p.isHost ? "（房主）" : "";
      return `<div class="seat"><i class="swatch ${p.isHost ? "red" : "blue"}"></i><div>${escapeHtml(p.name)}${host}</div><span>${tag} · ${ready}</span></div>`;
    })
    .join("");
}

function renderPlay(view) {
  $("game-code").textContent = view.code;
  $("turn-banner").textContent = banner(view);
  $("player-list").innerHTML = view.seats
    .map((s) => {
      const active = view.turn === s.side && view.phase === "playing" ? " active" : "";
      const you = s.you ? "（你）" : s.type === "ai" ? "（電腦）" : "";
      return `<div class="player${active}"><i class="swatch ${s.side === 1 ? "red" : "blue"}"></i><div>${escapeHtml(s.name)}${you}</div><span>${sideName(view, s.side)}</span></div>`;
    })
    .join("");
  const pass = $("btn-pass");
  if (pass) {
    pass.hidden = view.kind !== "go" && view.kind !== "othello";
    pass.disabled = !view.yourTurn || view.phase !== "playing";
    pass.textContent = view.mustPass ? "無子可下，虛手" : "虛手";
  }
  if (view.kind === "guosanguan") paintTtt(view);
  else paintBoard(view);
}

function banner(view) {
  if (view.phase === "ended") return resultText(view);
  const name = sideName(view, view.turn);
  return view.yourTurn ? `輪到你（${name}）` : `等待${name}`;
}

function sideName(view, side) {
  if (view.kind === "guosanguan") return side === 1 ? "圈 ○" : "叉 ×";
  return side === 1 ? "黑" : "白";
}

function resultText(view) {
  if (!view.winner) return "和局";
  const name = view.seats.find((s) => s.side === view.winner)?.name || sideName(view, view.winner);
  return `${name} 獲勝`;
}

function showWinner(view) {
  $("winner-title").textContent = resultText(view);
  $("winner-detail").textContent = extraResult(view);
  $("winner-modal").hidden = false;
}

function extraResult(view) {
  if (view.kind === "othello" && view.counts) {
    return `黑 ${view.counts[1]}　白 ${view.counts[2]}`;
  }
  if (view.kind === "go" && view.score) {
    return `黑 ${view.score.black}　白 ${view.score.white}（含貼目 ${view.score.komi}）。此為簡單領地估算，不含複雜死活。`;
  }
  return "可結束遊戲回到候機室，或再準備開下一局。";
}

function paintTtt(view) {
  const root = $("ttt");
  root.hidden = false;
  canvas.parentElement.hidden = true;
  const ages = {};
  view.order.forEach((i, n) => {
    ages[i] = n + 1;
  });
  for (const btn of root.querySelectorAll("[data-i]")) {
    const i = Number(btn.dataset.i);
    const v = view.cells[i];
    btn.innerHTML = v ? `${v === 1 ? "○" : "×"}${ages[i] ? `<span class="age">${ages[i]}</span>` : ""}` : "";
  }
}

function paintBoard(view) {
  $("ttt").hidden = true;
  canvas.parentElement.hidden = false;
  const size = view.size || 8;
  const wrap = canvas.parentElement;
  wrap.classList.toggle("othello", view.kind === "othello");
  wrap.classList.toggle("go", view.kind === "go" || view.kind === "gomoku");
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, wrap.clientWidth);
  const cssH = Math.max(1, wrap.clientHeight);
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = boardLayout(view.kind, size, cssW, cssH);
  if (view.kind === "othello") paintOthello(view, layout);
  else paintGrid(view, layout);
}

function paintOthello(view, L) {
  ctx.fillStyle = "#1f7a46";
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.strokeStyle = "rgba(10,30,16,0.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= L.size; i++) {
    ctx.beginPath();
    ctx.moveTo(L.ox + L.pad, L.oy + L.pad + i * L.cell);
    ctx.lineTo(L.ox + L.pad + L.size * L.cell, L.oy + L.pad + i * L.cell);
    ctx.moveTo(L.ox + L.pad + i * L.cell, L.oy + L.pad);
    ctx.lineTo(L.ox + L.pad + i * L.cell, L.oy + L.pad + L.size * L.cell);
    ctx.stroke();
  }
  const legal = new Set((view.legal || []).map((m) => `${m.x},${m.y}`));
  for (let y = 0; y < L.size; y++) {
    for (let x = 0; x < L.size; x++) {
      const { x: cx, y: cy } = cellCenter(L, x, y);
      const v = view.cells[y * L.size + x];
      if (hover && hover.x === x && hover.y === y && view.yourTurn) {
        ctx.fillStyle = "rgba(255,248,220,0.18)";
        ctx.fillRect(L.ox + L.pad + x * L.cell, L.oy + L.pad + y * L.cell, L.cell, L.cell);
      }
      if (v) {
        ctx.beginPath();
        ctx.arc(cx, cy, L.cell * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = v === 1 ? "#111" : "#f4efe4";
        ctx.fill();
      } else if (view.yourTurn && legal.has(`${x},${y}`)) {
        ctx.beginPath();
        ctx.arc(cx, cy, L.cell * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,248,220,0.7)";
        ctx.fill();
      }
    }
  }
}

function paintGrid(view, L) {
  ctx.fillStyle = "#e7c78a";
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.strokeStyle = "#5c3d18";
  ctx.lineWidth = Math.max(1, L.side / 520);
  const x0 = L.ox + L.pad;
  const y0 = L.oy + L.pad;
  const x1 = L.ox + L.pad + (L.size - 1) * L.gap;
  const y1 = L.oy + L.pad + (L.size - 1) * L.gap;
  for (let i = 0; i < L.size; i++) {
    const p = L.pad + i * L.gap;
    ctx.beginPath();
    ctx.moveTo(x0, L.oy + p);
    ctx.lineTo(x1, L.oy + p);
    ctx.moveTo(L.ox + p, y0);
    ctx.lineTo(L.ox + p, y1);
    ctx.stroke();
  }
  const stars =
    L.size === 9
      ? [
          [2, 2],
          [6, 2],
          [4, 4],
          [2, 6],
          [6, 6],
        ]
      : L.size === 15
        ? [
            [3, 3],
            [11, 3],
            [7, 7],
            [3, 11],
            [11, 11],
          ]
        : [];
  ctx.fillStyle = "#5c3d18";
  for (const [x, y] of stars) {
    const c = cellCenter(L, x, y);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(2.4, L.gap * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
  if (hover && view.yourTurn && view.phase === "playing") {
    const c = cellCenter(L, hover.x, hover.y);
    ctx.beginPath();
    ctx.arc(c.x, c.y, L.gap * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(156,28,28,0.28)";
    ctx.fill();
  }
  for (let y = 0; y < L.size; y++) {
    for (let x = 0; x < L.size; x++) {
      const v = view.cells[y * L.size + x];
      if (!v) continue;
      const c = cellCenter(L, x, y);
      ctx.beginPath();
      ctx.arc(c.x, c.y, L.gap * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = v === 1 ? "#1a140e" : "#f7f1e4";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.stroke();
    }
  }
  if (view.last && view.last.x != null) {
    const c = cellCenter(L, view.last.x, view.last.y);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(3, L.gap * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = "#c43030";
    ctx.fill();
  }
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  setChatOpen($("chat-bar"), name === "lobby" || name === "play");
  setInMatch(name === "play");
}

function sendChat(text) {
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
    return JSON.parse(sessionStorage.getItem(`giml-${KIND}`) || "{}");
  } catch {
    return {};
  }
}

function saveSession() {
  sessionStorage.setItem(`giml-${KIND}`, JSON.stringify(me));
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

window.addEventListener("resize", () => {
  if (game && screens.play && !screens.play.hidden && game.kind !== "guosanguan") paintBoard(game);
});
