import { randomBytes } from "node:crypto";
import { COLOR_META, COLORS } from "../shared/board.js";
import {
  chooseMove,
  createGameState,
  currentColor,
  pickAiMove,
  publicState,
  rollDie,
} from "../shared/engine.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode() {
  const buf = randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
  return s;
}

export function makeId() {
  return randomBytes(8).toString("hex");
}

export function createRoom(host) {
  return {
    code: makeCode(),
    createdAt: Date.now(),
    hostId: host.playerId,
    players: [
      {
        playerId: host.playerId,
        nickname: host.nickname,
        color: null,
        ready: false,
        type: "human",
        connected: true,
        socketId: host.socketId,
      },
    ],
    game: null,
    timers: new Set(),
    busy: false,
  };
}

function takenColors(room) {
  return new Set(room.players.filter((p) => p.color).map((p) => p.color));
}

export function assignColor(room, player) {
  if (player.color) return player.color;
  const taken = takenColors(room);
  const color = COLORS.find((c) => !taken.has(c));
  player.color = color;
  return color;
}

export function lobbyView(room, viewerId) {
  const seated = COLORS.map((color) => {
    const p = room.players.find((x) => x.color === color);
    if (!p) return { color, empty: true, nameZh: COLOR_META[color].nameZh };
    return {
      color,
      empty: false,
      name: p.nickname,
      type: p.type,
      ready: p.ready,
      connected: p.connected,
      isHost: p.playerId === room.hostId,
      nameZh: COLOR_META[color].nameZh,
      you: p.playerId === viewerId,
    };
  });
  const you = room.players.find((p) => p.playerId === viewerId);
  const humans = room.players.filter((p) => p.type === "human");
  const allReady = humans.length > 0 && humans.every((p) => p.ready && p.color);
  return {
    phase: room.game ? room.game.phase : "lobby",
    code: room.code,
    seats: seated,
    isHost: you?.playerId === room.hostId,
    yourColor: you?.color ?? null,
    ready: you?.ready ?? false,
    canStart: allReady && !room.game,
    playerCount: humans.length,
  };
}

export function joinRoom(room, { playerId, nickname, socketId }) {
  if (room.game) {
    const existing = room.players.find((p) => p.playerId === playerId);
    if (existing) {
      existing.connected = true;
      existing.socketId = socketId;
      existing.nickname = nickname || existing.nickname;
      return { ok: true, rejoin: true, player: existing };
    }
    return { ok: false, error: "對局已經開始，無法加入" };
  }
  const existing = room.players.find((p) => p.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.nickname = nickname || existing.nickname;
    assignColor(room, existing);
    return { ok: true, rejoin: true, player: existing };
  }
  const humans = room.players.filter((p) => p.type === "human");
  if (humans.length >= 4) return { ok: false, error: "房間已滿（最多 4 人）" };
  const player = {
    playerId,
    nickname: nickname || "玩家",
    color: null,
    ready: false,
    type: "human",
    connected: true,
    socketId,
  };
  assignColor(room, player);
  room.players.push(player);
  return { ok: true, rejoin: false, player };
}

export function setReady(room, playerId, ready) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p || p.type !== "human" || room.game) return { ok: false };
  p.ready = !!ready;
  const humans = room.players.filter((x) => x.type === "human");
  const allReady = humans.every((x) => x.ready && x.color);
  return { ok: true, autoStart: allReady };
}

export function startGame(room) {
  if (room.game) return { ok: false, error: "對局已經開始" };
  const humans = room.players.filter((p) => p.type === "human" && p.color);
  if (!humans.length) return { ok: false, error: "至少需要一名玩家" };
  if (!humans.every((p) => p.ready)) return { ok: false, error: "請等待所有玩家準備" };

  for (const color of COLORS) {
    if (room.players.some((p) => p.color === color)) continue;
    room.players.push({
      playerId: `ai-${room.code}-${color}`,
      nickname: `電腦·${COLOR_META[color].nameZh}`,
      color,
      ready: true,
      type: "ai",
      connected: true,
      socketId: null,
    });
  }

  const seats = COLORS.map((color) => {
    const p = room.players.find((x) => x.color === color);
    return {
      color,
      name: p.nickname,
      type: p.type,
      ready: true,
      connected: p.connected,
      isHost: p.playerId === room.hostId,
      playerId: p.playerId,
    };
  });

  room.game = createGameState(seats);
  return { ok: true };
}

export function gameView(room, playerId) {
  const base = publicState(room.game, playerId);
  return {
    ...base,
    code: room.code,
    phase: room.game.phase === "ended" ? "ended" : "playing",
  };
}

export function animationMs(sim) {
  if (!sim?.path) return 700;
  let ms = 280;
  for (const step of sim.path) {
    if (step.kind === "fly") ms += 700;
    else if (step.kind === "jump") ms += 380;
    else if (step.kind === "takeoff") ms += 450;
    else if (step.kind === "finish") ms += 420;
    else ms += 160;
  }
  return Math.min(ms + 200, 4200);
}

export function schedule(room, fn, ms) {
  const t = setTimeout(() => {
    room.timers.delete(t);
    fn();
  }, ms);
  room.timers.add(t);
  return t;
}

export function clearTimers(room) {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
}

export function isAiTurn(room) {
  if (!room.game || room.game.phase !== "playing") return false;
  const color = currentColor(room.game);
  const seat = room.game.seats.find((s) => s.color === color);
  if (!seat) return false;
  if (seat.type === "ai") return true;
  const player = room.players.find((p) => p.playerId === seat.playerId);
  return player && !player.connected;
}

export function aiAct(room, io) {
  if (!room.game || room.busy) return;
  if (room.game.phase !== "playing") return;
  if (!isAiTurn(room)) return;

  const color = currentColor(room.game);
  room.busy = true;

  const think = 700 + Math.floor(Math.random() * 500);
  schedule(room, () => {
    if (!room.game || room.game.phase !== "playing") {
      room.busy = false;
      return;
    }
    if (room.game.action !== "roll") {
      room.busy = false;
      maybeContinueAi(room, io);
      return;
    }
    const rolled = rollDie(room.game);
    io.to(room.code).emit("rolled", {
      color,
      roll: rolled.roll,
      threeSixes: !!rolled.threeSixes,
      punished: rolled.punished ?? null,
      skipped: !!rolled.skipped,
      extraTurn: !!rolled.extraTurn,
    });
    broadcast(room, io);

    const afterDice = 900;
    schedule(room, () => {
      if (!room.game) return;
      if (rolled.threeSixes || rolled.skipped) {
        room.busy = false;
        maybeContinueAi(room, io);
        return;
      }
      const moves = room.game.legalMoves;
      const pick = pickAiMove(moves, color);
      if (!pick) {
        room.busy = false;
        maybeContinueAi(room, io);
        return;
      }
      const chosen = chooseMove(room.game, pick.pieceId);
      io.to(room.code).emit("moved", {
        color,
        sim: chosen.sim,
        extraTurn: chosen.extraTurn,
      });
      broadcast(room, io);
      schedule(room, () => {
        room.busy = false;
        maybeContinueAi(room, io);
      }, animationMs(chosen.sim));
    }, afterDice);
  }, think);
}

export function maybeContinueAi(room, io) {
  if (!room.game || room.game.phase !== "playing") return;
  if (isAiTurn(room)) aiAct(room, io);
}

export function broadcast(room, io) {
  const sockets = io.sockets.adapter.rooms.get(room.code);
  if (!sockets) {
    io.to(room.code).emit("lobby", lobbyView(room, null));
    return;
  }
  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId);
    const playerId = sock?.data?.playerId;
    if (room.game) sock.emit("state", gameView(room, playerId));
    else sock.emit("lobby", lobbyView(room, playerId));
  }
}

export function handleRoll(room, playerId) {
  if (!room.game) return { ok: false, error: "對局尚未開始" };
  const seat = room.game.seats.find((s) => s.playerId === playerId);
  if (!seat || seat.color !== currentColor(room.game)) {
    return { ok: false, error: "還沒輪到你" };
  }
  if (room.game.action !== "roll") return { ok: false, error: "現在不能擲骰" };
  return rollDie(room.game);
}

export function handleMove(room, playerId, pieceId) {
  if (!room.game) return { ok: false, error: "對局尚未開始" };
  const seat = room.game.seats.find((s) => s.playerId === playerId);
  if (!seat || seat.color !== currentColor(room.game)) {
    return { ok: false, error: "還沒輪到你" };
  }
  return chooseMove(room.game, pieceId);
}
