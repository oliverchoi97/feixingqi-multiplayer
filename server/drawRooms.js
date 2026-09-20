import { makeCode, makeId } from "./rooms.js";
import { MAX_PLAYERS, MIN_PLAYERS, ROUND_MS, matchGuess, pickWord } from "../shared/drawguess.js";

export { makeId, MAX_PLAYERS, MIN_PLAYERS, ROUND_MS };

export function createDrawRoom(host) {
  return {
    kind: "drawguess",
    code: makeCode(),
    createdAt: Date.now(),
    hostId: host.playerId,
    players: [
      {
        playerId: host.playerId,
        nickname: host.nickname,
        ready: false,
        connected: true,
        socketId: host.socketId,
      },
    ],
    game: null,
    chatLog: [],
    timers: new Set(),
  };
}

export function joinDrawRoom(room, { playerId, nickname, socketId }) {
  const existing = room.players.find((p) => p.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.nickname = nickname || existing.nickname;
    return { ok: true, rejoin: true, player: existing };
  }
  if (room.game && room.game.phase !== "lobby") {
    return { ok: false, error: "這一局已經開始" };
  }
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: "房間已滿（最多 6 人）" };
  const player = {
    playerId,
    nickname: nickname || "玩家",
    ready: false,
    connected: true,
    socketId,
  };
  room.players.push(player);
  return { ok: true, rejoin: false, player };
}

export function setDrawReady(room, playerId, ready) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p || room.game) return { ok: false };
  p.ready = !!ready;
  const seated = room.players.filter((x) => x.connected);
  const allReady = seated.length >= MIN_PLAYERS && seated.every((x) => x.ready);
  return { ok: true, autoStart: allReady };
}

export function startDrawGame(room) {
  if (room.game) return { ok: false, error: "對局已經開始" };
  const seated = room.players.filter((p) => p.connected);
  if (seated.length < MIN_PLAYERS) return { ok: false, error: "至少需要兩人" };
  if (!seated.every((p) => p.ready)) return { ok: false, error: "大家都要準備" };
  const scores = {};
  for (const p of room.players) scores[p.playerId] = 0;
  room.game = {
    phase: "drawing",
    roundIndex: 0,
    maxRounds: Math.max(3, seated.length),
    drawerId: seated[0].playerId,
    word: pickWord(new Set()),
    used: new Set(),
    strokes: [],
    scores,
    guessed: [],
    roundEndsAt: Date.now() + ROUND_MS,
    lastCorrect: null,
  };
  room.game.used.add(room.game.word);
  room.chatLog = [];
  return { ok: true };
}

export function nextDrawRound(room) {
  if (!room.game) return { ok: false };
  const seated = room.players.filter((p) => p.connected);
  if (!seated.length) {
    room.game.phase = "ended";
    return { ok: true, ended: true };
  }
  if (room.game.roundIndex + 1 >= room.game.maxRounds) {
    room.game.phase = "ended";
    room.game.word = null;
    room.game.strokes = [];
    return { ok: true, ended: true };
  }
  room.game.roundIndex += 1;
  const drawer = seated[room.game.roundIndex % seated.length];
  room.game.drawerId = drawer.playerId;
  room.game.word = pickWord(room.game.used);
  room.game.used.add(room.game.word);
  room.game.strokes = [];
  room.game.guessed = [];
  room.game.lastCorrect = null;
  room.game.phase = "drawing";
  room.game.roundEndsAt = Date.now() + ROUND_MS;
  return { ok: true, ended: false };
}

export function addStroke(room, playerId, stroke) {
  if (!room.game || room.game.phase !== "drawing") return { ok: false };
  if (playerId !== room.game.drawerId) return { ok: false, error: "只有畫家可以畫" };
  const s = sanitizeStroke(stroke);
  if (!s) return { ok: false };
  room.game.strokes.push(s);
  if (room.game.strokes.length > 4000) room.game.strokes.splice(0, 500);
  return { ok: true, stroke: s };
}

export function clearStrokes(room, playerId) {
  if (!room.game || room.game.phase !== "drawing") return { ok: false };
  if (playerId !== room.game.drawerId) return { ok: false };
  room.game.strokes = [];
  return { ok: true };
}

export function handleGuess(room, playerId, text) {
  if (!room.game || room.game.phase !== "drawing") return { ok: false, error: "現在不能猜" };
  if (playerId === room.game.drawerId) return { ok: false, error: "畫家不能猜自己的題" };
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p) return { ok: false, error: "找不到玩家" };
  if (room.game.guessed.includes(playerId)) return { ok: false, error: "這題你已猜中" };
  const ok = matchGuess(room.game.word, text);
  if (!ok) return { ok: true, correct: false, text };
  room.game.guessed.push(playerId);
  room.game.scores[playerId] = (room.game.scores[playerId] || 0) + 2;
  room.game.scores[room.game.drawerId] = (room.game.scores[room.game.drawerId] || 0) + 1;
  room.game.lastCorrect = { playerId, name: p.nickname };
  room.game.phase = "reveal";
  return { ok: true, correct: true, text, name: p.nickname };
}

export function drawLobbyView(room, viewerId) {
  const you = room.players.find((p) => p.playerId === viewerId);
  const seated = room.players.filter((p) => p.connected);
  return {
    kind: "drawguess",
    code: room.code,
    phase: room.game ? room.game.phase : "lobby",
    isHost: you?.playerId === room.hostId,
    ready: you?.ready ?? false,
    canStart: seated.length >= MIN_PLAYERS && seated.every((p) => p.ready) && !room.game,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      name: p.nickname,
      ready: p.ready,
      connected: p.connected,
      isHost: p.playerId === room.hostId,
      you: p.playerId === viewerId,
    })),
  };
}

export function drawGameView(room, viewerId) {
  const g = room.game;
  const youDrawer = g.drawerId === viewerId;
  const drawer = room.players.find((p) => p.playerId === g.drawerId);
  return {
    kind: "drawguess",
    code: room.code,
    phase: g.phase,
    roundIndex: g.roundIndex,
    maxRounds: g.maxRounds,
    drawerId: g.drawerId,
    drawerName: drawer?.nickname ?? "畫家",
    youDrawer,
    word: youDrawer || g.phase !== "drawing" ? g.word : null,
    hint: g.word ? `${g.word.length} 個字` : "",
    strokes: g.strokes,
    scores: room.players.map((p) => ({
      playerId: p.playerId,
      name: p.nickname,
      score: g.scores[p.playerId] || 0,
      you: p.playerId === viewerId,
      connected: p.connected,
    })),
    roundEndsAt: g.roundEndsAt,
    lastCorrect: g.lastCorrect,
    winner: g.phase === "ended" ? topScorer(g.scores, room.players) : null,
  };
}

function topScorer(scores, players) {
  let best = null;
  for (const p of players) {
    const s = scores[p.playerId] || 0;
    if (!best || s > best.score) best = { playerId: p.playerId, name: p.nickname, score: s };
  }
  return best;
}

export function clearDrawTimers(room) {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
}

export function scheduleDraw(room, fn, ms) {
  const t = setTimeout(() => {
    room.timers.delete(t);
    fn();
  }, ms);
  room.timers.add(t);
  return t;
}

export function endDrawMatch(room) {
  clearDrawTimers(room);
  room.game = null;
  room.chatLog = [];
  for (const p of room.players) p.ready = false;
  return { ok: true };
}

export function handleDrawDisconnect(room, playerId) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (p) p.connected = false;
  if (!room.game && p && p.playerId !== room.hostId) {
    room.players = room.players.filter((x) => x.playerId !== playerId);
  }
}

export function broadcastDraw(room, nsp) {
  for (const p of room.players) {
    if (!p.socketId) continue;
    const sock = nsp.sockets.get(p.socketId);
    if (!sock) continue;
    if (room.game) sock.emit("state", drawGameView(room, p.playerId));
    else sock.emit("lobby", drawLobbyView(room, p.playerId));
  }
}

function sanitizeStroke(stroke) {
  if (!stroke || typeof stroke !== "object") return null;
  const x1 = clamp01(stroke.x1);
  const y1 = clamp01(stroke.y1);
  const x2 = clamp01(stroke.x2);
  const y2 = clamp01(stroke.y2);
  if ([x1, y1, x2, y2].some((n) => n == null)) return null;
  const color = String(stroke.color || "#2a1f14").slice(0, 16);
  const w = Math.min(24, Math.max(1, Number(stroke.w) || 4));
  return { x1, y1, x2, y2, color, w };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}

export function removeDrawPlayer(room, playerId) {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  if (room.hostId === playerId) {
    const next = room.players[0];
    if (next) room.hostId = next.playerId;
  }
}
