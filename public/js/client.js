import { BoardView, COLOR_META } from "./render.js";

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
let movingTimer = 0;
let dicePlaying = false;

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
$("btn-copy").onclick = async () => {
  if (!lobby) return;
  const url = `${location.origin}/?room=${lobby.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("已複製房間連結");
  } catch {
    prompt("複製這個連結", url);
  }
};
$("btn-leave").onclick = () => location.assign("/");
$("btn-home").onclick = () => location.assign("/");
$("btn-rules").onclick = () => $("modal").hidden = false;
$("btn-close-rules").onclick = () => $("modal").hidden = true;
$("btn-roll").onclick = () => {
  if (!game?.yourTurn || game.action !== "roll" || moving) return;
  $("btn-roll").disabled = true;
  socket.emit("roll");
};

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
  history.replaceState({}, "", `/?room=${payload.code}`);
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

socket.on("rolled", ({ roll, threeSixes }) => {
  animateDice(roll, () => {
    setDice(roll);
    if (threeSixes) toast("三次六返大陸！");
    tryAutoMove();
  });
});

socket.on("moved", ({ sim }) => {
  beginMoving(sim);
});

socket.on("errorMsg", (msg) => {
  toast(msg);
  moving = false;
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
  $("btn-start").hidden = !view.isHost;
  $("btn-start").disabled = !view.canStart;
  $("lobby-status").textContent = view.canStart
    ? "全員準備完成，即將開局（空位由電腦補上）。"
    : "點準備後開局。尚未入座的顏色會由電腦執飛，湊滿四家。";
  $("lobby-seats").innerHTML = view.seats
    .map((s) => {
      if (s.empty) {
        return `<div class="seat"><i class="swatch ${s.color}"></i><div>${s.nameZh}　空位（電腦）</div><span>未入座</span></div>`;
      }
      const tag = s.you ? "你" : s.type === "ai" ? "電腦" : s.connected ? "在線" : "離線";
      const ready = s.ready ? "已準備" : "未準備";
      return `<div class="seat"><i class="swatch ${s.color}"></i><div>${s.nameZh}　${escapeHtml(s.name)}${s.isHost ? "（房主）" : ""}</div><span>${tag} · ${ready}</span></div>`;
    })
    .join("");
}

function renderGame(view) {
  $("game-code").textContent = view.code;
  const meta = COLOR_META[view.turnColor];
  const yours = view.yourTurn;
  $("turn-banner").textContent =
    view.phase === "ended"
      ? "對局結束"
      : yours
        ? `輪到你（${meta.nameZh}）`
        : `輪到${meta.nameZh}方`;
  $("btn-roll").disabled = !(yours && view.action === "roll") || moving;
  renderPiecePicks(view);
  $("roll-hint").textContent =
    view.action === "select" && yours
      ? "點選高亮的飛機，或按下方按鈕走棋。"
      : view.lastRoll
        ? `上一骰：${view.lastRoll}${view.consecutiveSixes ? `（連續 ${view.consecutiveSixes} 次 6）` : ""}`
        : "輪到你時按下擲骰。";
  if (view.lastRoll) setDice(view.lastRoll);

  $("player-list").innerHTML = view.seats
    .map((s) => {
      const active = s.color === view.turnColor ? "active" : "";
      const kind = s.type === "ai" ? "電腦" : s.connected ? "玩家" : "離線";
      const dots = [0, 1, 2, 3]
        .map((i) => `<i class="dot ${i < s.finished ? "done" : ""}"></i>`)
        .join("");
      return `<div class="player ${active}" style="color:${COLOR_META[s.color].hexDark}">
        <i class="swatch ${s.color}"></i>
        <div>${COLOR_META[s.color].nameZh}　${escapeHtml(s.name)}<div class="hint">${kind}${s.you ? " · 你" : ""}</div></div>
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
    ? `${COLOR_META[w.color].nameZh}方「${w.name}」獲勝`
    : "對局結束";
  $("winner-ranks").innerHTML = (view.rankings || [])
    .map((r) => `<li>${r.rank}. ${COLOR_META[r.color].nameZh}　${escapeHtml(r.name)}</li>`)
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
      const label = plane.loc === "hangar" ? `起飛 ${id + 1}` : `飛機 ${id + 1}`;
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

function animateDice(value, done) {
  const el = $("dice");
  el.classList.add("rolling");
  dicePlaying = true;
  let n = 0;
  clearInterval(diceTimer);
  diceTimer = setInterval(() => {
    setDice(1 + Math.floor(Math.random() * 6));
    if (++n > 8) {
      clearInterval(diceTimer);
      el.classList.remove("rolling");
      setDice(value);
      dicePlaying = false;
      done?.();
    }
  }, 70);
}

function setDice(v) {
  $("dice").dataset.face = String(v);
}

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
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
