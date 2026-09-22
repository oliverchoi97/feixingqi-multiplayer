import { randomBytes } from "node:crypto";
import {
  PRESETS,
  cloneLayout,
  generateLayout,
  mulberry32,
  publicOwnBoard,
  remainingMines,
  revealCell,
  safeCells,
  toggleFlag,
} from "../shared/mines.js";
import { makeCode, makeId } from "./rooms.js";
import { broadcastViews } from "./ioUtil.js";

const RACE = PRESETS.C;

export { makeId, RACE };

export function createMinesRoom(host) {
  return {
    kind: "mines",
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
  };
}

export function joinMinesRoom(room, { playerId, nickname, socketId }) {
  const existing = room.players.find((p) => p.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.nickname = nickname || existing.nickname;
    return { ok: true, rejoin: true, player: existing };
  }
  if (room.game) return { ok: false, error: "對局已經開始" };
  if (room.players.length >= 2) return { ok: false, error: "房間已滿（最多 2 人）" };
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

export function setMinesReady(room, playerId, ready) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p || room.game) return { ok: false };
  p.ready = !!ready;
  const both = room.players.length === 2 && room.players.every((x) => x.ready && x.connected);
  return { ok: true, autoStart: both };
}

export function startMinesGame(room) {
  if (room.game) return { ok: false, error: "對局已經開始" };
  const seated = room.players.filter((p) => p.connected);
  if (seated.length !== 2) return { ok: false, error: "需要兩位玩家才能開賽" };
  if (!seated.every((p) => p.ready)) return { ok: false, error: "雙方都要準備" };
  const seed = randomBytes(4).readUInt32BE(0);
  const layout = generateLayout(RACE, mulberry32(seed));
  const boards = {};
  for (const p of room.players) boards[p.playerId] = cloneLayout(layout);
  room.game = {
    phase: "playing",
    seed,
    preset: "C",
    startedAt: Date.now(),
    endedAt: null,
    winnerId: null,
    reason: null,
    layout,
    boards,
  };
  room.chatLog = [];
  return { ok: true };
}

export function minesLobbyView(room, viewerId) {
  const you = room.players.find((p) => p.playerId === viewerId);
  return {
    code: room.code,
    phase: room.game ? room.game.phase : "lobby",
    isHost: you?.playerId === room.hostId,
    ready: you?.ready ?? false,
    canStart: room.players.length === 2 && room.players.every((p) => p.ready) && !room.game,
    preset: RACE,
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

export function minesGameView(room, viewerId) {
  const game = room.game;
  const board = game.boards[viewerId];
  if (!board) return null;
  const over = game.phase === "ended";
  const you = room.players.find((p) => p.playerId === viewerId);
  const foe = room.players.find((p) => p.playerId !== viewerId);
  const foeBoard = foe ? game.boards[foe.playerId] : null;
  return {
    code: room.code,
    phase: game.phase,
    preset: RACE,
    startedAt: game.startedAt,
    winnerId: game.winnerId,
    reason: game.reason,
    you: {
      playerId: viewerId,
      name: you?.nickname ?? "玩家",
      ...publicOwnBoard(board, { showMines: over || !board.alive }),
      remaining: remainingMines(board),
      safeTotal: safeCells(RACE),
    },
    opponent: foe
      ? {
          playerId: foe.playerId,
          name: foe.nickname,
          connected: foe.connected,
          revealedSafe: foeBoard.revealedSafe,
          flagCount: foeBoard.flagCount,
          remaining: remainingMines(foeBoard),
          alive: foeBoard.alive,
          won: foeBoard.won,
          exploded: foeBoard.exploded >= 0,
          safeTotal: safeCells(RACE),
        }
      : null,
  };
}

export function handleReveal(room, playerId, index) {
  const game = room.game;
  if (!game || game.phase !== "playing") return { ok: false, error: "現在不能揭開" };
  const board = game.boards[playerId];
  if (!board) return { ok: false, error: "找不到棋盤" };
  const result = revealCell(board, Number(index));
  if (!result.ok) return result;
  if (result.hit) {
    finish(room, opponentId(room, playerId), "mine");
  } else if (result.won) {
    finish(room, playerId, "clear");
  }
  return { ok: true, ...result };
}

export function handleFlag(room, playerId, index) {
  const game = room.game;
  if (!game || game.phase !== "playing") return { ok: false, error: "現在不能插旗" };
  const board = game.boards[playerId];
  if (!board) return { ok: false, error: "找不到棋盤" };
  return toggleFlag(board, Number(index));
}

export function handleDisconnect(room, playerId) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (p) p.connected = false;
  if (room.game?.phase === "playing") {
    const other = room.players.find((x) => x.playerId !== playerId && x.connected);
    if (other) finish(room, other.playerId, "disconnect");
    else finish(room, null, "abandon");
    return { ended: true };
  }
  if (!room.game && p && p.playerId !== room.hostId) {
    room.players = room.players.filter((x) => x.playerId !== playerId);
  }
  return { ended: false };
}

function opponentId(room, playerId) {
  return room.players.find((p) => p.playerId !== playerId)?.playerId ?? null;
}

function finish(room, winnerId, reason) {
  if (room.game.phase === "ended") return;
  room.game.phase = "ended";
  room.game.winnerId = winnerId;
  room.game.reason = reason;
  room.game.endedAt = Date.now();
}

export function endMinesMatch(room) {
  room.game = null;
  room.chatLog = [];
  for (const p of room.players) p.ready = false;
  return { ok: true };
}

export function broadcastMines(room, nsp) {
  broadcastViews(nsp, room, (sock, playerId) => {
    sock.emit("lobby", minesLobbyView(room, playerId));
    if (room.game) sock.emit("state", minesGameView(room, playerId));
  });
}
