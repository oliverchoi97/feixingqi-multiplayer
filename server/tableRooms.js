import { makeCode, makeId } from "./rooms.js";
import { broadcastViews } from "./ioUtil.js";
import * as gomoku from "../shared/gomoku.js";
import * as othello from "../shared/othello.js";
import * as go from "../shared/go.js";
import * as guosanguan from "../shared/guosanguan.js";

export { makeId };

export const TABLE_GAMES = {
  gomoku: {
    kind: "gomoku",
    titleZh: "五子棋",
    path: "/gomoku",
    engine: gomoku,
    allowPass: false,
  },
  othello: {
    kind: "othello",
    titleZh: "黑白棋",
    path: "/othello",
    engine: othello,
    allowPass: true,
  },
  go: {
    kind: "go",
    titleZh: "圍棋",
    path: "/go",
    engine: go,
    allowPass: true,
  },
  guosanguan: {
    kind: "guosanguan",
    titleZh: "過三關",
    path: "/guosanguan",
    engine: guosanguan,
    allowPass: false,
  },
};

export function createTableRoom(kind, host) {
  const spec = TABLE_GAMES[kind];
  if (!spec) return null;
  return {
    kind,
    code: makeCode(),
    createdAt: Date.now(),
    hostId: host.playerId,
    players: [
      {
        playerId: host.playerId,
        nickname: host.nickname,
        ready: false,
        type: "human",
        connected: true,
        socketId: host.socketId,
        side: null,
      },
    ],
    game: null,
    chatLog: [],
    timers: new Set(),
    busy: false,
  };
}

export function joinTableRoom(room, { playerId, nickname, socketId }) {
  const existing = room.players.find((p) => p.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.nickname = nickname || existing.nickname;
    return { ok: true, rejoin: true, player: existing };
  }
  if (room.game) return { ok: false, error: "對局已經開始" };
  const humans = room.players.filter((p) => p.type === "human");
  if (humans.length >= 2) return { ok: false, error: "房間已滿（最多 2 人）" };
  const player = {
    playerId,
    nickname: nickname || "玩家",
    ready: false,
    type: "human",
    connected: true,
    socketId,
    side: null,
  };
  room.players.push(player);
  return { ok: true, rejoin: false, player };
}

export function setTableReady(room, playerId, ready) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p || p.type !== "human" || room.game) return { ok: false };
  p.ready = !!ready;
  const humans = room.players.filter((x) => x.type === "human");
  const allReady = humans.length > 0 && humans.every((x) => x.ready);
  return { ok: true, autoStart: allReady && humans.length === 2 };
}

export function startTableGame(room) {
  if (room.game) return { ok: false, error: "對局已經開始" };
  const spec = TABLE_GAMES[room.kind];
  const humans = room.players.filter((p) => p.type === "human");
  if (!humans.length) return { ok: false, error: "至少需要一名玩家" };
  if (!humans.every((p) => p.ready)) return { ok: false, error: "每位玩家都要準備" };

  room.players = room.players.filter((p) => p.type === "human");
  if (room.players.filter((p) => p.type === "human").length < 2) {
    const usedSides = new Set();
    room.players[0].side = 1;
    usedSides.add(1);
    room.players.push({
      playerId: `ai-${room.code}`,
      nickname: "電腦",
      ready: true,
      type: "ai",
      connected: true,
      socketId: null,
      side: 2,
    });
  } else {
    room.players[0].side = 1;
    room.players[1].side = 2;
  }

  const seats = [1, 2].map((side) => {
    const p = room.players.find((x) => x.side === side);
    return {
      side,
      name: p.nickname,
      type: p.type,
      playerId: p.playerId,
    };
  });
  room.game = spec.engine.createGame(seats);
  room.chatLog = [];
  return { ok: true };
}

export function tableLobbyView(room, viewerId) {
  const you = room.players.find((p) => p.playerId === viewerId);
  const humans = room.players.filter((p) => p.type === "human");
  const spec = TABLE_GAMES[room.kind];
  return {
    kind: room.kind,
    titleZh: spec.titleZh,
    code: room.code,
    phase: room.game ? room.game.phase : "lobby",
    isHost: you?.playerId === room.hostId,
    ready: you?.ready ?? false,
    canStart: humans.length > 0 && humans.every((p) => p.ready) && !room.game,
    players: room.players
      .filter((p) => p.type === "human")
      .map((p) => ({
        playerId: p.playerId,
        name: p.nickname,
        ready: p.ready,
        connected: p.connected,
        isHost: p.playerId === room.hostId,
        you: p.playerId === viewerId,
      })),
  };
}

export function tableGameView(room, viewerId) {
  const spec = TABLE_GAMES[room.kind];
  return {
    code: room.code,
    ...spec.engine.publicView(room.game, viewerId),
  };
}

export function handleTableMove(room, playerId, payload) {
  if (!room.game) return { ok: false, error: "對局尚未開始" };
  const spec = TABLE_GAMES[room.kind];
  const seat = room.game.seats.find((s) => s.playerId === playerId);
  if (!seat) return { ok: false, error: "你不在這盤棋裡" };
  if (room.kind === "guosanguan") {
    return spec.engine.applyMove(room.game, seat.side, payload?.index ?? payload);
  }
  return spec.engine.applyMove(room.game, seat.side, payload);
}

export function isTableAiTurn(room) {
  if (!room.game || room.game.phase !== "playing") return false;
  const seat = room.game.seats.find((s) => s.side === room.game.turn);
  if (!seat) return false;
  if (seat.type === "ai") return true;
  const player = room.players.find((p) => p.playerId === seat.playerId);
  return player && !player.connected;
}

export function scheduleTable(room, fn, ms) {
  const t = setTimeout(() => {
    room.timers.delete(t);
    fn();
  }, ms);
  room.timers.add(t);
  return t;
}

export function clearTableTimers(room) {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
}

export function endTableMatch(room) {
  clearTableTimers(room);
  room.busy = false;
  room.game = null;
  room.chatLog = [];
  room.players = room.players.filter((p) => p.type === "human");
  for (const p of room.players) {
    p.ready = false;
    p.side = null;
  }
  return { ok: true };
}

export function tableAiAct(room, nsp) {
  if (!room.game || room.busy) return;
  if (!isTableAiTurn(room)) return;
  const spec = TABLE_GAMES[room.kind];
  room.busy = true;
  scheduleTable(
    room,
    () => {
      room.busy = false;
      if (!room.game || room.game.phase !== "playing") return;
      if (!isTableAiTurn(room)) return;
      const seat = room.game.seats.find((s) => s.side === room.game.turn);
      const pick = spec.engine.pickAiMove(room.game);
      if (pick == null || !seat) return;
      const payload = typeof pick === "number" ? { index: pick } : pick;
      const result = handleTableMove(room, seat.playerId, payload);
      if (!result.ok) return;
      broadcastTable(room, nsp);
      if (isTableAiTurn(room)) tableAiAct(room, nsp);
    },
    420 + Math.floor(Math.random() * 280)
  );
}

export function maybeTableAi(room, nsp) {
  if (isTableAiTurn(room)) tableAiAct(room, nsp);
}

export function broadcastTable(room, nsp) {
  broadcastViews(nsp, room, (sock, playerId) => {
    if (room.game) sock.emit("state", tableGameView(room, playerId));
    else sock.emit("lobby", tableLobbyView(room, playerId));
  });
}

export function handleTableDisconnect(room, playerId) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (p) p.connected = false;
  if (!room.game && p && p.playerId !== room.hostId) {
    room.players = room.players.filter((x) => x.playerId !== playerId);
  }
}

export function removeTablePlayer(room, playerId) {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  if (room.hostId === playerId) {
    const next = room.players.find((p) => p.type === "human");
    if (next) room.hostId = next.playerId;
  }
}
