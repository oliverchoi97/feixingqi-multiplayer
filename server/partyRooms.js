import { makeCode, makeId } from "./rooms.js";
import { broadcastViews } from "./ioUtil.js";
import * as oneatwob from "../shared/oneatwob.js";
import * as battleship from "../shared/battleship.js";
import * as hammintoi from "../shared/hammintoi.js";
import * as oldmaid from "../shared/oldmaid.js";

export { makeId };

export const PARTY_GAMES = {
  oneatwob: {
    kind: "oneatwob",
    titleZh: "估數字",
    path: "/oneatwob",
    engine: oneatwob,
    min: 2,
    max: 4,
    fillAi: true,
    defaultSeats: 2,
  },
  battleship: {
    kind: "battleship",
    titleZh: "海戰棋",
    path: "/battleship",
    engine: battleship,
    min: 2,
    max: 2,
    fillAi: true,
    defaultSeats: 2,
  },
  hammintoi: {
    kind: "hammintoi",
    titleZh: "冚棉胎",
    path: "/hammintoi",
    engine: hammintoi,
    min: 2,
    max: 6,
    fillAi: false,
    defaultSeats: 2,
  },
  oldmaid: {
    kind: "oldmaid",
    titleZh: "抽烏龜",
    path: "/oldmaid",
    engine: oldmaid,
    min: 2,
    max: 4,
    fillAi: true,
    defaultSeats: 4,
  },
};

export function createPartyRoom(kind, host) {
  const spec = PARTY_GAMES[kind];
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
      },
    ],
    game: null,
    chatLog: [],
    timers: new Set(),
    busy: false,
  };
}

export function joinPartyRoom(room, { playerId, nickname, socketId }) {
  const spec = PARTY_GAMES[room.kind];
  const existing = room.players.find((p) => p.playerId === playerId);
  if (existing) {
    existing.connected = true;
    existing.socketId = socketId;
    existing.nickname = nickname || existing.nickname;
    return { ok: true, rejoin: true, player: existing };
  }
  if (room.game) return { ok: false, error: "對局已經開始" };
  const humans = room.players.filter((p) => p.type === "human");
  if (humans.length >= spec.max) return { ok: false, error: `房間已滿（最多 ${spec.max} 人）` };
  const player = {
    playerId,
    nickname: nickname || "玩家",
    ready: false,
    type: "human",
    connected: true,
    socketId,
  };
  room.players.push(player);
  return { ok: true, rejoin: false, player };
}

export function setPartyReady(room, playerId, ready) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (!p || p.type !== "human" || room.game) return { ok: false };
  p.ready = !!ready;
  const spec = PARTY_GAMES[room.kind];
  const humans = room.players.filter((x) => x.type === "human" && x.connected);
  const allReady = humans.length >= spec.min && humans.every((x) => x.ready);
  return { ok: true, autoStart: allReady && humans.length >= spec.min };
}

export function startPartyGame(room) {
  if (room.game) return { ok: false, error: "對局已經開始" };
  const spec = PARTY_GAMES[room.kind];
  let humans = room.players.filter((p) => p.type === "human" && p.connected);
  const need = spec.fillAi ? 1 : spec.min;
  if (humans.length < need) {
    return { ok: false, error: spec.fillAi ? "至少需要一人" : `至少需要 ${spec.min} 人` };
  }
  room.players = room.players.filter((p) => p.type === "human");
  humans = room.players.filter((p) => p.type === "human");
  if (spec.fillAi) {
    while (room.players.length < spec.defaultSeats) {
      const n = room.players.filter((p) => p.type === "ai").length + 1;
      room.players.push({
        playerId: `ai-${room.code}-${n}`,
        nickname: `電腦${n}`,
        ready: true,
        type: "ai",
        connected: true,
        socketId: null,
      });
    }
  }
  const seats = room.players.map((p) => ({
    playerId: p.playerId,
    name: p.nickname,
    type: p.type,
  }));
  if (spec.kind === "oneatwob") {
    const humanCount = seats.filter((s) => s.type === "human").length;
    const secret = humanCount >= 2 ? null : spec.engine.randomSecret();
    room.game = spec.engine.createGame(seats, secret);
  } else room.game = spec.engine.createGame(seats);
  room.chatLog = [];
  return { ok: true };
}

export function partyLobbyView(room, viewerId) {
  const spec = PARTY_GAMES[room.kind];
  const you = room.players.find((p) => p.playerId === viewerId);
  const humans = room.players.filter((p) => p.type === "human");
  return {
    kind: room.kind,
    titleZh: spec.titleZh,
    code: room.code,
    phase: room.game ? room.game.phase : "lobby",
    isHost: you?.playerId === room.hostId,
    ready: you?.ready ?? false,
    canStart:
      (spec.fillAi
        ? humans.filter((p) => p.connected).length >= 1
        : humans.filter((p) => p.connected).length >= spec.min) && !room.game,
    fillAi: spec.fillAi,
    min: spec.min,
    max: spec.max,
    players: humans.map((p) => ({
      playerId: p.playerId,
      name: p.nickname,
      ready: p.ready,
      connected: p.connected,
      isHost: p.playerId === room.hostId,
      you: p.playerId === viewerId,
    })),
  };
}

export function partyGameView(room, viewerId) {
  const spec = PARTY_GAMES[room.kind];
  return {
    code: room.code,
    titleZh: spec.titleZh,
    ...spec.engine.publicView(room.game, viewerId),
  };
}

export function handlePartyMove(room, playerId, payload) {
  if (!room.game) return { ok: false, error: "對局尚未開始" };
  const spec = PARTY_GAMES[room.kind];
  const g = room.game;
  if (spec.kind === "oneatwob") {
    if (g.phase === "set") return spec.engine.applySecret(g, playerId, payload);
    return spec.engine.applyGuess(g, playerId, payload?.guess ?? payload);
  }
  if (spec.kind === "battleship") {
    if (g.phase === "place") return spec.engine.applyPlace(g, playerId, payload?.fleet);
    return spec.engine.applyShot(g, playerId, payload);
  }
  if (spec.kind === "hammintoi") {
    if (payload?.slap) {
      const r = spec.engine.slap(g, playerId);
      if (!r.ok && r.foul) spec.engine.foulSlap(g, playerId);
      return r.ok ? r : { ok: true, foul: true };
    }
    return spec.engine.playCard(g, playerId);
  }
  if (spec.kind === "oldmaid") return spec.engine.drawFromLeft(g, playerId);
  return { ok: false, error: "未知動作" };
}

export function isPartyAiTurn(room) {
  if (!room.game || room.game.phase === "ended" || room.game.phase === "lobby") return false;
  const spec = PARTY_GAMES[room.kind];
  if (spec.kind === "oneatwob" && room.game.phase === "set") {
    const setter = room.players.find((p) => p.playerId === room.game.setterId);
    return Boolean(setter && (setter.type === "ai" || !setter.connected));
  }
  if (spec.kind === "battleship" && room.game.phase === "place") {
    return room.players.some((p) => p.type === "ai" && !room.game.boards[p.playerId]?.ready);
  }
  if (spec.kind === "hammintoi" && room.game.slap) return false;
  const turn = room.game.turn;
  const seat = room.game.seats[turn];
  if (!seat) return false;
  if (seat.type === "ai") return true;
  const player = room.players.find((p) => p.playerId === seat.playerId);
  return player && !player.connected;
}

export function partyAiAct(room, nsp) {
  if (!room.game || room.busy) return;
  if (!isPartyAiTurn(room)) return;
  const spec = PARTY_GAMES[room.kind];
  room.busy = true;
  scheduleParty(room, () => {
    room.busy = false;
    if (!room.game || room.game.phase === "ended") return;
    if (spec.kind === "battleship" && room.game.phase === "place") {
      for (const p of room.players.filter((x) => x.type === "ai")) {
        spec.engine.applyPlace(room.game, p.playerId, null);
      }
      broadcastParty(room, nsp);
      armPartyTimers(room, nsp);
      if (isPartyAiTurn(room)) partyAiAct(room, nsp);
      return;
    }
    if (spec.kind === "oneatwob" && room.game.phase === "set") {
      spec.engine.applySecret(room.game, room.game.setterId, { random: true });
      broadcastParty(room, nsp);
      if (isPartyAiTurn(room)) partyAiAct(room, nsp);
      return;
    }
    const seat = room.game.seats[room.game.turn];
    if (!seat) return;
    const human = room.players.find((p) => p.playerId === seat.playerId);
    if (seat.type !== "ai" && human?.connected && !isPartyAiTurn(room)) return;
    let payload = {};
    if (spec.kind === "oneatwob") payload = { guess: spec.engine.pickAiGuess(room.game) };
    else if (spec.kind === "battleship") payload = spec.engine.pickAiShot(room.game, seat.playerId);
    handlePartyMove(room, seat.playerId, payload);
    broadcastParty(room, nsp);
    armPartyTimers(room, nsp);
    if (isPartyAiTurn(room)) partyAiAct(room, nsp);
  }, 500 + Math.floor(Math.random() * 400));
}

export function maybePartyAi(room, nsp) {
  if (isPartyAiTurn(room)) partyAiAct(room, nsp);
}

export function armPartyTimers(room, nsp) {
  if (!room.game) return;
  const spec = PARTY_GAMES[room.kind];
  if (spec.kind !== "battleship" && spec.kind !== "hammintoi") return;
  clearPartyTimers(room);
  if (spec.kind === "battleship" && room.game.phase === "place") {
    const ms = Math.max(200, (room.game.placeEndsAt || Date.now()) - Date.now());
    scheduleParty(room, () => {
      if (!room.game || room.game.phase !== "place") return;
      spec.engine.lockUnready(room.game);
      broadcastParty(room, nsp);
      armPartyTimers(room, nsp);
      maybePartyAi(room, nsp);
    }, ms);
  }
  if (spec.kind === "battleship" && room.game.phase === "shot") {
    const ms = Math.max(200, (room.game.shotEndsAt || Date.now()) - Date.now());
    scheduleParty(room, () => {
      if (!room.game || room.game.phase !== "shot") return;
      const seat = room.game.seats[room.game.turn];
      const shot = spec.engine.pickAiShot(room.game, seat.playerId);
      spec.engine.applyShot(room.game, seat.playerId, shot);
      broadcastParty(room, nsp);
      armPartyTimers(room, nsp);
      maybePartyAi(room, nsp);
    }, ms);
  }
  if (spec.kind === "hammintoi" && room.game.slap) {
    const ms = Math.max(80, (room.game.slap.until || Date.now()) - Date.now());
    scheduleParty(room, () => {
      if (!room.game?.slap) return;
      spec.engine.resolveSlap(room.game);
      broadcastParty(room, nsp);
      maybePartyAi(room, nsp);
    }, ms);
  }
}

export function scheduleParty(room, fn, ms) {
  const t = setTimeout(() => {
    room.timers.delete(t);
    fn();
  }, ms);
  room.timers.add(t);
  return t;
}

export function clearPartyTimers(room) {
  for (const t of room.timers) clearTimeout(t);
  room.timers.clear();
}

export function endPartyMatch(room) {
  clearPartyTimers(room);
  room.busy = false;
  room.game = null;
  room.chatLog = [];
  room.players = room.players.filter((p) => p.type === "human");
  for (const p of room.players) p.ready = false;
  return { ok: true };
}

export function broadcastParty(room, nsp) {
  broadcastViews(nsp, room, (sock, playerId) => {
    if (room.game) sock.emit("state", partyGameView(room, playerId));
    else sock.emit("lobby", partyLobbyView(room, playerId));
  });
}

export function handlePartyDisconnect(room, playerId) {
  const p = room.players.find((x) => x.playerId === playerId);
  if (p) p.connected = false;
  if (!room.game && p && p.playerId !== room.hostId) {
    room.players = room.players.filter((x) => x.playerId !== playerId);
  }
}

export function removePartyPlayer(room, playerId) {
  room.players = room.players.filter((p) => p.playerId !== playerId);
  if (room.hostId === playerId) {
    const next = room.players.find((p) => p.type === "human");
    if (next) room.hostId = next.playerId;
  }
}
