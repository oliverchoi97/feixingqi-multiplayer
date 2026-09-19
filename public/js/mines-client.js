import {
  PRESETS,
  emptyBoard,
  publicOwnBoard,
  remainingMines,
  revealCell,
  toggleFlag,
} from "/shared/mines.js";
import { bindChatBar, setChatOpen, spawnDanmaku } from "./danmaku.js";

const socket = window.io("/mines");
const $ = (id) => document.getElementById(id);

const screens = {
  hub: $("screen-hub"),
  lobby: $("screen-lobby"),
  play: $("screen-play"),
};

let me = loadSession();
let mode = "hub";
let solo = null;
let race = null;
let readyOn = false;
let timerId = 0;
let longPress = null;
let cells = [];
let lastChatAt = 0;

const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
if (me.nickname) $("nickname").value = me.nickname;

document.querySelectorAll("[data-solo]").forEach((btn) => {
  btn.onclick = () => startSolo(btn.dataset.solo);
});

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
  const code = $("lobby-code").textContent;
  const url = `${location.origin}/minesweeper?room=${code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("已複製房間連結");
  } catch {
    prompt("複製這個連結", url);
  }
};
$("btn-leave").onclick = () => location.assign("/minesweeper");
$("btn-back").onclick = (e) => {
  if (mode === "solo") {
    e.preventDefault();
    stopTimer();
    show("hub");
    mode = "hub";
  }
};
$("btn-reset").onclick = () => {
  if (mode === "solo" && solo) startSolo(solo.key);
};
$("btn-again").onclick = () => {
  $("winner-modal").hidden = true;
  if (mode === "solo" && solo) startSolo(solo.key);
  else location.assign("/minesweeper");
};

bindChatBar($("chat-bar"), { onSend: sendChat });

$("ms-board").addEventListener("click", (e) => {
  const i = cellIndex(e.target);
  const skip = longPress?.flagged;
  longPress = null;
  if (i == null || skip) return;
  e.preventDefault();
  onReveal(i);
});
$("ms-board").addEventListener("contextmenu", (e) => {
  const i = cellIndex(e.target);
  if (i == null) return;
  e.preventDefault();
  onFlag(i);
});
$("ms-board").addEventListener("pointerdown", (e) => {
  const i = cellIndex(e.target);
  if (i == null) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  longPress = {
    i,
    t: setTimeout(() => {
      onFlag(i);
      longPress = { i, flagged: true };
    }, 420),
  };
});
["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
  $("ms-board").addEventListener(ev, () => {
    if (longPress?.t) clearTimeout(longPress.t);
    longPress = longPress?.flagged ? { flagged: true } : null;
  });
});

socket.on("joined", (payload) => {
  me.playerId = payload.playerId;
  me.room = payload.code;
  saveSession();
  history.replaceState({}, "", `/minesweeper?room=${payload.code}`);
});

socket.on("lobby", (view) => {
  if (mode === "solo") return;
  if (view.phase && view.phase !== "lobby") return;
  race = { lobby: view, state: race?.state ?? null };
  show("lobby");
  $("lobby-code").textContent = view.code;
  $("btn-ready").textContent = view.ready ? "取消準備" : "準備";
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = view.canStart
    ? "雙方已準備，即將開賽（高級 30×16、99 雷，棋盤相同）。"
    : "兩人都要點準備。沒有電腦，最多兩人。";
  $("lobby-seats").innerHTML = view.players
    .map((p) => {
      const tag = p.you ? "你" : p.connected ? "在線" : "離線";
      const ready = p.ready ? "已準備" : "未準備";
      const host = p.isHost ? "（房主）" : "";
      return `<div class="seat"><i class="swatch red"></i><div>${escapeHtml(p.name)}${host}</div><span>${tag} · ${ready}</span></div>`;
    })
    .join("");
});

socket.on("started", () => {
  mode = "race";
  $("btn-reset").hidden = true;
  show("play");
});

socket.on("state", (view) => {
  if (!view) return;
  mode = "race";
  race = { lobby: race?.lobby, state: view };
  $("btn-reset").hidden = true;
  show("play");
  paintRace(view);
  if (view.phase === "ended") showRaceResult(view);
});

socket.on("errorMsg", (msg) => toast(msg));

socket.on("chat", (msg) => {
  spawnDanmaku($("danmaku-layer"), { name: msg.nickname, text: msg.text }, escapeHtml);
});

if (me.playerId && params.get("room")) {
  saveNick();
  socket.emit("join", {
    code: params.get("room"),
    nickname: me.nickname,
    playerId: me.playerId,
  });
}

function startSolo(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  saveNick();
  mode = "solo";
  solo = { key, preset, board: emptyBoard(preset), t0: 0 };
  $("btn-reset").hidden = false;
  $("ms-race").hidden = true;
  $("winner-modal").hidden = true;
  $("ms-level").textContent = preset.nameZh;
  buildGrid(preset.cols, preset.rows);
  paintSolo();
  show("play");
  startTimer(() => (solo.t0 ? Math.floor((Date.now() - solo.t0) / 1000) : 0));
}

function onReveal(i) {
  if (longPress?.flagged) return;
  if (mode === "solo") {
    if (!solo.t0) solo.t0 = Date.now();
    const result = revealCell(solo.board, i, Math.random);
    if (!result.ok) return;
    paintSolo();
    if (result.hit) endSolo(false);
    else if (result.won) endSolo(true);
    return;
  }
  if (mode === "race") socket.emit("reveal", i);
}

function onFlag(i) {
  if (mode === "solo") {
    const result = toggleFlag(solo.board, i);
    if (result.ok) paintSolo();
    return;
  }
  if (mode === "race") socket.emit("flag", i);
}

function paintSolo() {
  const board = solo.board;
  $("ms-mines").textContent = `雷 ${remainingMines(board)}`;
  const showMines = !board.alive || board.won;
  applyCells(publicOwnBoard(board, { showMines }).cells, board.exploded);
}

function paintRace(view) {
  const you = view.you;
  $("ms-level").textContent = "高級競賽";
  $("ms-mines").textContent = `雷 ${you.remaining}`;
  buildGrid(you.cols, you.rows);
  applyCells(you.cells, you.exploded);
  $("ms-race").hidden = false;
  const opp = view.opponent;
  $("ms-race").innerHTML = `
    <div class="ms-race-row you"><span>你 · ${escapeHtml(you.name)}</span><span>${you.revealedSafe}/${you.safeTotal}${you.won ? " · 清盤" : ""}</span></div>
    <div class="ms-race-row"><span>對手 · ${escapeHtml(opp?.name || "等待")}</span><span>${opp ? `${opp.revealedSafe}/${opp.safeTotal}` : "—"}</span></div>
  `;
  startTimer(() => Math.max(0, Math.floor((Date.now() - view.startedAt) / 1000)));
}

function applyCells(list, exploded) {
  for (const el of cells) {
    el.className = "ms-cell";
    el.textContent = "";
    el.removeAttribute("data-adj");
  }
  for (const c of list) {
    const el = cells[c.i];
    if (!el) continue;
    if (c.flagged) el.classList.add("flag");
    if (c.revealed) {
      el.classList.add("revealed");
      if (c.mine) {
        el.classList.add("mine");
        el.textContent = "雷";
      } else if (c.adj) {
        el.dataset.adj = String(c.adj);
        el.textContent = String(c.adj);
      }
    } else if (c.mine) {
      el.classList.add("mine");
      el.textContent = "雷";
    }
    if (c.i === exploded) el.classList.add("exploded");
  }
}

function buildGrid(cols, rows) {
  const boardEl = $("ms-board");
  if (boardEl.dataset.cols === String(cols) && boardEl.dataset.rows === String(rows) && cells.length === cols * rows) {
    return;
  }
  boardEl.style.setProperty("--cols", String(cols));
  boardEl.dataset.cols = String(cols);
  boardEl.dataset.rows = String(rows);
  boardEl.innerHTML = "";
  cells = [];
  const n = cols * rows;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ms-cell";
    btn.dataset.i = String(i);
    cells.push(btn);
    frag.appendChild(btn);
  }
  boardEl.appendChild(frag);
}

function endSolo(won) {
  stopTimer();
  $("winner-title").textContent = won ? "成功排雷" : "踩到地雷";
  $("winner-detail").textContent = won
    ? `用時 ${$("ms-timer").textContent} 秒。`
    : "再試一次，或換較低難度。";
  $("winner-modal").hidden = false;
}

function showRaceResult(view) {
  stopTimer();
  const youWin = view.winnerId === me.playerId;
  const reason = {
    clear: youWin ? "你先清完所有安全格。" : "對手先清完盤面。",
    mine: youWin ? "對手踩到地雷，你獲勝。" : "你踩到地雷。",
    disconnect: youWin ? "對手斷線，視為棄權。" : "連線中斷。",
    abandon: "雙方都離開了。",
  }[view.reason] || "";
  $("winner-title").textContent = youWin ? "你贏了" : view.winnerId ? "對手獲勝" : "對局結束";
  $("winner-detail").textContent = reason;
  $("winner-modal").hidden = false;
}

function cellIndex(target) {
  const el = target?.closest?.(".ms-cell");
  if (!el) return null;
  const i = Number(el.dataset.i);
  return Number.isInteger(i) ? i : null;
}

function joinTyped() {
  saveNick();
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return toast("請輸入房間代碼");
  socket.emit("join", { code, nickname: me.nickname, playerId: me.playerId });
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  setChatOpen($("chat-bar"), name === "lobby" || name === "play");
}

function sendChat(text) {
  saveNick();
  const now = Date.now();
  if (now - lastChatAt < 800) {
    toast("說慢一點");
    return false;
  }
  lastChatAt = now;
  if (mode === "solo") {
    spawnDanmaku($("danmaku-layer"), { name: me.nickname || "玩家", text }, escapeHtml);
    return true;
  }
  socket.emit("chat", text);
}

function startTimer(fn) {
  stopTimer();
  const tick = () => {
    $("ms-timer").textContent = String(fn());
  };
  tick();
  timerId = setInterval(tick, 250);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = 0;
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
    return JSON.parse(sessionStorage.getItem("giml-ms") || "{}");
  } catch {
    return {};
  }
}

function saveSession() {
  sessionStorage.setItem("giml-ms", JSON.stringify(me));
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
