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
$("btn-draw")?.addEventListener("click", () => {
  const n = game?.target?.count ?? 0;
  if (!n) return toast("對方沒牌");
  socket.emit("move", { index: 0 });
});
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
  if (KIND === "oldmaid") return "預設四人。一人也可開，空位由電腦補上。按住對方的牌凸起，鬆手或點一下抽走。";
  if (KIND === "battleship") return "兩人對戰。一人也可開，空位由電腦補上。佈署 60 秒。打中可連射，打空才換邊。";
  return "每人各自設定四位密碼，再輪流猜下一家。每回合一人猜一次。一人對電腦也是互猜。";
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
    return view.yourSet ? "請設定你的四位密碼" : `等待其他人鎖定（${(view.pendingNames || []).join("、") || "…"}）`;
  }
  if (view.kind === "oneatwob" && view.phase === "playing") {
    return view.yourTurn ? `輪到你猜 ${view.targetName || "下一家"}` : "等待對手猜";
  }
  if (view.kind === "battleship" && view.phase === "place") {
    return view.youReady ? "等待對手鎖定陣形" : "佈署艦艇（60 秒）";
  }
  if (view.kind === "battleship" && view.phase === "shot") {
    return view.yourTurn ? "開火（打中可連射，30 秒）" : "對方正在瞄準（30 秒）";
  }
  if (view.kind === "oldmaid" && view.probe?.fromId && view.target?.you) {
    return `${view.probe.byName || "對手"} 正在抽你的牌`;
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
  const hint = $("hint-1a2b") || ensureHint();
  if (hint) {
    hint.hidden = false;
    hint.textContent =
      view.phase === "set"
        ? view.yourSet
          ? "這組密碼給對手猜，不要說出來。"
          : "你已鎖定。等其他人設好就開猜。"
        : view.yourTurn
          ? `猜 ${view.targetName || "下一家"} 的四位數字。這回合只能猜一次。`
          : "每回合一人猜一次下一家的密碼。";
  }
  $("history-1a2b").innerHTML = (view.history || [])
    .map((h) => {
      const who = h.targetName ? `${escapeHtml(h.name)} → ${escapeHtml(h.targetName)}` : escapeHtml(h.name);
      return `<li>${who}　${h.guess}　${h.a}A${h.b}B</li>`;
    })
    .join("");
}

function ensureHint() {
  const box = $("panel-1a2b");
  if (!box) return null;
  let el = $("hint-1a2b");
  if (el) return el;
  el = document.createElement("p");
  el.id = "hint-1a2b";
  el.className = "hint";
  box.insertBefore(el, box.firstChild);
  return el;
}

let lastSeaFx = "";

function renderSea(view) {
  const box = $("panel-sea");
  box.hidden = false;
  $("btn-random-fleet").hidden = view.phase !== "place" || view.youReady;
  paintGrid($("sea-own"), view.own?.grid || [], view.size, {
    ships: true,
    fleet: view.own?.ships || [],
    incoming: view.foeShots,
    disabled: true,
  });
  const foe = view.phase === "ended" ? view.foeShots : view.own?.shots || [];
  paintGrid($("sea-foe"), foe, view.size, {
    shots: true,
    disabled: !view.yourTurn || view.phase !== "shot",
    lastShot: view.lastShot,
    onClick: (x, y) => socket.emit("move", { x, y }),
  });
  playSeaFx(view);
}

function paintGrid(el, cells, size, { ships, shots, fleet, incoming, disabled, onClick, lastShot } = {}) {
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.innerHTML = "";
  const marks = shipMarks(fleet, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const v = cells[i] || 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sea-cell";
      const mark = marks.get(`${x},${y}`);
      if (ships && (v || mark)) {
        btn.classList.add("ship");
        if (mark) {
          btn.classList.add(`ship-${mark.id}`, mark.horiz ? "ship-h" : "ship-v", `ship-${mark.part}`);
          btn.title = mark.name;
        }
      }
      if (incoming && incoming[i] === 1) btn.classList.add("miss");
      if (incoming && incoming[i] === 2) btn.classList.add("hit");
      if (shots && v === 1) btn.classList.add("miss");
      if (shots && v === 2) btn.classList.add("hit");
      if (lastShot && lastShot.x === x && lastShot.y === y) {
        btn.classList.add(lastShot.hit ? "cannon-hit" : "cannon-miss");
        if (lastShot.sunk) btn.classList.add("exploded");
      }
      btn.disabled = !!disabled;
      btn.onclick = () => onClick?.(x, y);
      el.appendChild(btn);
    }
  }
}

function shipMarks(fleet, size) {
  const map = new Map();
  for (const ship of fleet || []) {
    for (let i = 0; i < ship.len; i++) {
      const x = ship.horiz ? ship.x + i : ship.x;
      const y = ship.horiz ? ship.y : ship.y + i;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const part = i === 0 ? "bow" : i === ship.len - 1 ? "stern" : "mid";
      map.set(`${x},${y}`, { id: ship.id, name: ship.name, horiz: ship.horiz, part });
    }
  }
  return map;
}

function playSeaFx(view) {
  const s = view.lastShot;
  if (!s) return;
  const key = `${s.by}-${s.x}-${s.y}-${s.hit}-${s.sunk?.id || ""}`;
  if (key === lastSeaFx) return;
  lastSeaFx = key;
  const layer = ensureSeaFx();
  layer.hidden = false;
  layer.className = `sea-fx ${s.hit ? "hit" : "miss"}${s.sunk ? " sunk" : ""}`;
  const who = s.byName ? `${s.byName} 開炮` : "開炮";
  const result = s.sunk ? `擊沉 ${s.sunk.name}！` : s.hit ? "命中！" : "未中";
  layer.innerHTML = `<div class="sea-fx-burst"></div><p>${who}（${s.x + 1}, ${s.y + 1}）${result}</p>`;
  clearTimeout(playSeaFx._t);
  playSeaFx._t = setTimeout(() => {
    layer.hidden = true;
  }, 1400);
}

function ensureSeaFx() {
  let el = $("sea-fx");
  if (el) return el;
  el = document.createElement("div");
  el.id = "sea-fx";
  el.className = "sea-fx";
  el.hidden = true;
  $("panel-sea").appendChild(el);
  return el;
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

let maidHold = -1;

function renderMaid(view) {
  const box = $("panel-maid");
  box.hidden = false;
  const drawBtn = $("btn-draw");
  if (drawBtn) drawBtn.hidden = true;
  const targetBox = ensureMaidTarget();
  const target = view.target;
  const count = target?.count || 0;
  const label = target
    ? target.you
      ? `${view.probe?.byName || "對手"} 正在從你手上抽牌`
      : view.yourTurn
        ? `從 ${target.name} 手上抽一張：按住凸起，鬆手或點一下抽走`
        : `下一家是 ${target.name}（${count} 張）`
    : "等待抽牌";
  targetBox.querySelector(".eyebrow").textContent = label;
  const row = targetBox.querySelector(".maid-backs");
  row.innerHTML = "";
  const showBacks = Boolean(target) && view.yourTurn && !target.you;
  if (showBacks) {
    for (let i = 0; i < count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "maid-card maid-back";
      btn.dataset.index = String(i);
      if (view.probe?.index === i) btn.classList.add("raised");
      if (view.lastDraw?.fromId === target.playerId && view.lastDraw?.index === i) btn.classList.add("taken");
      btn.textContent = "🂠";
      if (view.yourTurn && !target.you) bindMaidPick(btn, i);
      else btn.disabled = true;
      row.appendChild(btn);
    }
  }
  $("maid-hand").innerHTML = (view.hand || [])
    .map((c, i) => {
      const raised = target?.you && view.probe?.index === i ? " raised" : "";
      return `<span class="card-chip maid-card${raised}">${c.suit}${c.rank}</span>`;
    })
    .join("");
}

function ensureMaidTarget() {
  let el = $("maid-target");
  if (el) return el;
  el = document.createElement("div");
  el.id = "maid-target";
  el.innerHTML = `<p class="eyebrow">對方手牌</p><div class="maid-backs"></div>`;
  $("panel-maid").insertBefore(el, $("maid-hand"));
  return el;
}

function bindMaidPick(btn, index) {
  const start = (e) => {
    e.preventDefault();
    maidHold = index;
    btn.classList.add("raised");
    socket.emit("move", { probe: index });
  };
  const finish = (e) => {
    e.preventDefault();
    if (maidHold !== index) return;
    maidHold = -1;
    socket.emit("move", { index });
  };
  const cancel = () => {
    if (maidHold !== index) return;
    maidHold = -1;
    btn.classList.remove("raised");
    socket.emit("move", { probe: null });
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", finish);
  btn.addEventListener("pointercancel", cancel);
  btn.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && maidHold === index) cancel();
  });
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
