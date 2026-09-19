import { BoardView, COLOR_META, colorTitle } from "./render.js";
import { bindChatBar, setChatOpen, spawnDanmaku } from "./danmaku.js";

const socket = window.io();

const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  game: $("screen-game"),
};

const board = new BoardView($("board"));
let me = loadSession();
let lobby = null;
let game = null;
let readyOn = false;
let moving = false;
let diceTimer = 0;
let diceHoldTimer = 0;
let movingTimer = 0;
let dicePlaying = false;
let swipe = null;
let lastChatAt = 0;

const params = new URLSearchParams(location.search);
if (params.get("room")) $("join-code").value = params.get("room").toUpperCase();
if (me.nickname) $("nickname").value = me.nickname;

show("home");

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
$("lobby-seats").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-color]");
  if (!btn || btn.disabled) return;
  socket.emit("chooseColor", btn.dataset.color);
});
$("btn-copy").onclick = async () => {
  if (!lobby) return;
  const url = `${location.origin}/feixingqi?room=${lobby.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("已複製房間連結");
  } catch {
    prompt("複製這個連結", url);
  }
};
$("btn-leave").onclick = () => location.assign("/feixingqi");
$("btn-home").onclick = () => location.assign("/feixingqi");
$("btn-rules").onclick = () => $("modal").hidden = false;
$("btn-close-rules").onclick = () => $("modal").hidden = true;
$("btn-roll").onclick = () => requestRoll();
bindCenterDie();
bindChatBar($("chat-bar"), { onSend: sendChat });

$("board").addEventListener("click", (e) => {
  if (!game?.yourTurn || game.action !== "select" || moving) return;
  const hit = board.hitTest(e.clientX, e.clientY);
  if (!hit || hit.color !== game.yourColor) return;
  if (!game.legalPieceIds.includes(hit.id)) return;
  sendMove(hit.id);
});

socket.on("joined", (payload) => {
  me.playerId = payload.playerId;
  me.room = payload.code;
  saveSession();
  history.replaceState({}, "", `/feixingqi?room=${payload.code}`);
});

socket.on("lobby", (view) => {
  lobby = view;
  readyOn = view.ready;
  show("lobby");
  renderLobby(view);
});

socket.on("started", () => show("game"));

socket.on("state", (view) => {
  game = view;
  show("game");
  renderGame(view);
  if (!moving) board.setState(view, view.legalPieceIds || []);
  else board.setState(view, []);
  if (view.phase === "ended") showWinner(view);
  if (!moving && !dicePlaying) tryAutoMove();
});

socket.on("rolled", ({ roll, threeSixes, color }) => {
  beginDiceResult(roll, () => {
    if (threeSixes) toast("三次六返大陸！");
    if (game?.yourColor === color) tryAutoMove();
  }, color);
});

socket.on("rolling", ({ color } = {}) => {
  if (dicePlaying) return;
  startRemoteRoll(color);
});

socket.on("chat", (msg) => {
  spawnDanmaku($("danmaku-layer"), { name: msg.nickname, text: msg.text }, escapeHtml);
});

socket.on("moved", ({ sim }) => {
  beginMoving(sim);
});

socket.on("errorMsg", (msg) => {
  toast(msg);
  moving = false;
  dicePlaying = false;
  stopShuffleFaces();
  $("center-die").classList.remove("rolling", "fling", "dragging");
  $("dice").classList.remove("rolling");
  if (game) {
    renderGame(game);
    board.setState(game, game.legalPieceIds || []);
  }
});

if (me.playerId && params.get("room")) {
  saveNick();
  socket.emit("join", {
    code: params.get("room"),
    nickname: me.nickname,
    playerId: me.playerId,
  });
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
  $("btn-ready").disabled = !view.yourColor;
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = !view.yourColor
    ? "請先選擇角色（黃貓、藍狗、綠龜、紅兔）。開局前可更換。"
    : view.canStart
      ? "全員已選角並準備，即將開局（空位由電腦補上）。"
      : "點準備後開局。未選的角色開局後由電腦執掌。";
  $("lobby-seats").innerHTML = ["yellow", "blue", "green", "red"]
    .map((color) => view.seats.find((s) => s.color === color))
    .filter(Boolean)
    .map((s) => {
      const mine = !!s.you;
      const taken = !s.empty && !mine;
      let status = "可選";
      if (mine) status = view.ready ? "已選 · 已準備" : "已選 · 你";
      else if (!s.empty) status = `${escapeHtml(s.name)}${s.ready ? " · 已準備" : ""}`;
      return `<button type="button" class="role-card${mine ? " selected" : ""}${taken ? " taken" : ""}" data-color="${s.color}" ${taken ? "disabled" : ""}>
        <img src="${COLOR_META[s.color].pieceSrc}" alt="${colorTitle(s.color)}" width="72" height="72" />
        <strong>${colorTitle(s.color)}</strong>
        <span>${status}</span>
      </button>`;
    })
    .join("");
}

function renderGame(view) {
  $("game-code").textContent = view.code;
  const yours = view.yourTurn;
  const turnName = colorTitle(view.turnColor);
  const turnText =
    view.phase === "ended"
      ? "對局結束"
      : yours
        ? `輪到你（${turnName}）`
        : `輪到${turnName}`;
  $("turn-banner").textContent = turnText;
  $("board-hud").textContent = turnText;
  $("btn-roll").disabled = !(yours && view.action === "roll") || moving || dicePlaying;
  renderPiecePicks(view);
  $("roll-hint").textContent =
    view.action === "select" && yours
      ? "點選高亮的圓形棋子，或按下方按鈕走棋。"
      : yours && view.action === "roll"
        ? "在棋盤中央向上滑動骰子（也可點一下）。"
        : view.lastRoll
          ? `上一骰：${view.lastRoll}${view.consecutiveSixes ? `（連續 ${view.consecutiveSixes} 次 6）` : ""}`
          : "等待對手擲骰。";
  const last = $("last-roll");
  if (view.lastRoll) {
    last.hidden = false;
    last.textContent = `上一骰 ${view.lastRoll}`;
    if (!dicePlaying) setDice(view.lastRoll);
  } else {
    last.hidden = true;
  }
  syncCenterDice();

  $("player-list").innerHTML = view.seats
    .map((s) => {
      const active = s.color === view.turnColor ? "active" : "";
      const kind = s.type === "ai" ? "電腦" : s.connected ? "玩家" : "離線";
      const dots = [0, 1, 2, 3]
        .map((i) => `<i class="dot ${i < s.finished ? "done" : ""}"></i>`)
        .join("");
      return `<div class="player ${active}" style="color:${COLOR_META[s.color].hexDark}">
        <i class="swatch ${s.color}"></i>
        <div>${colorTitle(s.color)}　${escapeHtml(s.name)}<div class="hint">${kind}${s.you ? " · 你" : ""}</div></div>
        <div class="dots">${dots}</div>
      </div>`;
    })
    .join("");

  $("log").innerHTML = (view.log || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  $("log").scrollTop = $("log").scrollHeight;
}

function showWinner(view) {
  $("winner-modal").hidden = false;
  const w = view.rankings?.[0];
  $("winner-title").textContent = w
    ? `${colorTitle(w.color)}「${w.name}」獲勝`
    : "對局結束";
  $("winner-ranks").innerHTML = (view.rankings || [])
    .map((r) => `<li>${r.rank}. ${colorTitle(r.color)}　${escapeHtml(r.name)}</li>`)
    .join("");
}

function renderPiecePicks(view) {
  const box = $("piece-picks");
  const ids = view.yourTurn && view.action === "select" && !moving ? view.legalPieceIds || [] : [];
  if (!ids.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = ids
    .map((id) => {
      const plane = view.planes[view.yourColor][id];
      const animal = COLOR_META[view.yourColor].animalZh;
      const label = plane.loc === "hangar" ? `出發 ${animal}${id + 1}` : `${animal} ${id + 1}`;
      return `<button class="btn" type="button" data-piece="${id}">${label}</button>`;
    })
    .join("");
  box.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => sendMove(Number(btn.dataset.piece));
  });
}

function tryAutoMove() {
  if (!game?.yourTurn || game.action !== "select" || moving) return;
  const ids = game.legalPieceIds || [];
  if (!ids.length) return;
  if (ids.length === 1) {
    sendMove(ids[0]);
    return;
  }
  const planes = game.planes[game.yourColor];
  if (ids.every((id) => planes[id]?.loc === "hangar")) sendMove(ids[0]);
}

function sendMove(pieceId) {
  if (moving) return;
  moving = true;
  $("btn-roll").disabled = true;
  $("piece-picks").hidden = true;
  board.setState(game, []);
  syncCenterDice();
  clearTimeout(movingTimer);
  movingTimer = setTimeout(() => {
    moving = false;
    if (game) renderGame(game);
  }, 4500);
  socket.emit("move", pieceId);
}

function beginMoving(sim) {
  moving = true;
  $("btn-roll").disabled = true;
  syncCenterDice();
  clearTimeout(movingTimer);
  movingTimer = setTimeout(() => {
    moving = false;
    if (game) renderGame(game);
  }, 4500);
  board.playMove(sim, () => {
    clearTimeout(movingTimer);
    moving = false;
    if (game) renderGame(game);
  });
}

function canRoll() {
  return Boolean(
    game?.yourTurn && game.action === "roll" && !moving && !dicePlaying && game.phase !== "ended"
  );
}

function requestRoll() {
  if (!canRoll()) return;
  dicePlaying = true;
  $("btn-roll").disabled = true;
  const die = $("center-die");
  die.classList.add("fling", "rolling");
  $("dice").classList.add("rolling");
  setCenterMode("rolling");
  $("center-die-hint").textContent = "擲骰中";
  startShuffleFaces();
  socket.emit("rolling");
  socket.emit("roll");
}

function bindCenterDie() {
  const hit = $("center-die-hit");
  const die = $("center-die");

  const endSwipe = (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dt = Math.max(16, performance.now() - swipe.t);
    const dy = swipe.dy;
    const vx = Math.abs(e.clientX - swipe.x);
    const vy = dy / dt;
    const flicked = dy < -40 || vy < -0.42;
    const tapped = Math.abs(dy) < 16 && vx < 16 && dt < 520;
    try {
      hit.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    die.classList.remove("dragging");
    die.style.setProperty("--drag-y", "0px");
    swipe = null;
    if (flicked || tapped) requestRoll();
  };

  hit.addEventListener(
    "pointerdown",
    (e) => {
      if (!canRoll()) return;
      e.preventDefault();
      hit.setPointerCapture(e.pointerId);
      swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dy: 0 };
      die.classList.add("dragging");
      die.classList.remove("fling");
    },
    { passive: false }
  );

  hit.addEventListener(
    "pointermove",
    (e) => {
      if (!swipe || swipe.id !== e.pointerId) return;
      e.preventDefault();
      swipe.dy = e.clientY - swipe.y;
      const lift = Math.max(-96, Math.min(16, swipe.dy));
      die.style.setProperty("--drag-y", `${lift}px`);
    },
    { passive: false }
  );

  hit.addEventListener("pointerup", endSwipe);
  hit.addEventListener("pointercancel", endSwipe);

  hit.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      requestRoll();
    }
  });
}

function startRemoteRoll(color) {
  dicePlaying = true;
  setCenterMode("rolling");
  $("center-die").classList.add("rolling");
  $("center-die").classList.remove("fling", "dragging");
  $("dice").classList.add("rolling");
  const who = color ? colorTitle(color) : "";
  $("center-die-hint").textContent = who ? `${who}擲骰中` : "擲骰中";
  startShuffleFaces();
}

function beginDiceResult(value, done, color) {
  dicePlaying = true;
  setCenterMode("rolling");
  $("center-die").classList.add("rolling");
  $("dice").classList.add("rolling");
  if (!diceTimer) startShuffleFaces();
  const who = color ? colorTitle(color) : "";
  clearTimeout(diceHoldTimer);
  diceHoldTimer = setTimeout(() => {
    stopShuffleFaces();
    $("center-die").classList.remove("rolling", "fling", "dragging");
    $("dice").classList.remove("rolling");
    $("center-die").style.setProperty("--drag-y", "0px");
    setDice(value);
    setCenterMode("result");
    $("center-die-hint").textContent = who ? `${who} ${value}` : `擲出 ${value}`;
    diceHoldTimer = setTimeout(() => {
      dicePlaying = false;
      syncCenterDice();
      done?.();
    }, 900);
  }, 480);
}

function startShuffleFaces() {
  clearInterval(diceTimer);
  diceTimer = setInterval(() => setDice(1 + Math.floor(Math.random() * 6)), 60);
}

function stopShuffleFaces() {
  clearInterval(diceTimer);
  diceTimer = 0;
}

function setCenterMode(mode) {
  const el = $("center-dice");
  el.dataset.mode = mode;
  el.setAttribute("aria-hidden", mode === "off" ? "true" : "false");
}

function syncCenterDice() {
  if (dicePlaying) return;
  if (canRoll()) {
    setCenterMode("ready");
    setDice(1);
    $("center-die-hint").textContent = "向上滑動擲骰";
    $("center-die-hit").setAttribute("aria-label", "向上滑動擲骰");
  } else {
    setCenterMode("off");
  }
}

function setDice(v) {
  $("dice").dataset.face = String(v);
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  setChatOpen($("chat-bar"), name === "lobby" || name === "game");
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
    return JSON.parse(sessionStorage.getItem("fxq") || "{}");
  } catch {
    return {};
  }
}

function saveSession() {
  sessionStorage.setItem("fxq", JSON.stringify(me));
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
