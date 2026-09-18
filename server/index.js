import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  aiAct,
  animationMs,
  assignColor,
  broadcast,
  clearTimers,
  createRoom,
  gameView,
  handleMove,
  handleRoll,
  isAiTurn,
  joinRoom,
  lobbyView,
  makeId,
  maybeContinueAi,
  schedule,
  setReady,
  startGame,
} from "./rooms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 43177);
const rooms = new Map();

const app = express();
app.use(express.static(path.join(__dirname, "../public")));
app.use("/shared", express.static(path.join(__dirname, "../shared")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function getRoom(code) {
  if (!code) return null;
  return rooms.get(String(code).trim().toUpperCase()) ?? null;
}

function pruneRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const humans = room.players.filter((p) => p.type === "human");
    const anyone = humans.some((p) => p.connected);
    if (!anyone && now - room.createdAt > 1000 * 60 * 30) {
      clearTimers(room);
      rooms.delete(code);
    }
  }
}
setInterval(pruneRooms, 60_000);

io.on("connection", (socket) => {
  socket.on("create", ({ nickname, playerId } = {}) => {
    const id = playerId || makeId();
    const room = createRoom({
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
    assignColor(room, room.players[0]);
    rooms.set(room.code, room);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("joined", {
      playerId: id,
      code: room.code,
      color: room.players[0].color,
    });
    broadcast(room, io);
  });

  socket.on("join", ({ code, nickname, playerId } = {}) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit("errorMsg", "找不到這個房間");
      return;
    }
    const id = playerId || makeId();
    const result = joinRoom(room, {
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    socket.data.playerId = id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("joined", {
      playerId: id,
      code: room.code,
      color: result.player.color,
      rejoin: result.rejoin,
    });
    broadcast(room, io);
    if (room.game) {
      socket.emit("state", gameView(room, id));
      maybeContinueAi(room, io);
    }
  });

  socket.on("ready", (ready) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const result = setReady(room, socket.data.playerId, ready);
    if (!result.ok) return;
    broadcast(room, io);
    if (result.autoStart) begin(room);
  });

  socket.on("start", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) {
      socket.emit("errorMsg", "只有房主可以開始遊戲");
      return;
    }
    begin(room);
  });

  socket.on("roll", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.busy) return;
    const color = room.game.seats[room.game.turnIndex]?.color;
    const result = handleRoll(room, socket.data.playerId);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    io.to(room.code).emit("rolled", {
      color,
      roll: result.roll,
      threeSixes: !!result.threeSixes,
      punished: result.punished ?? null,
      skipped: !!result.skipped,
      extraTurn: !!result.extraTurn,
    });
    broadcast(room, io);
    if (result.threeSixes || result.skipped) {
      schedule(room, () => maybeContinueAi(room, io), 900);
    }
  });

  socket.on("move", (pieceId) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const result = handleMove(room, socket.data.playerId, Number(pieceId));
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    room.busy = true;
    io.to(room.code).emit("moved", {
      color: result.sim.color,
      sim: result.sim,
      extraTurn: result.extraTurn,
    });
    broadcast(room, io);
    schedule(room, () => {
      room.busy = false;
      maybeContinueAi(room, io);
    }, animationMs(result.sim));
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const p = room.players.find((x) => x.playerId === socket.data.playerId);
    if (p) {
      p.connected = false;
      if (!room.game && p.playerId !== room.hostId) {
        room.players = room.players.filter((x) => x.playerId !== p.playerId);
      }
    }
    broadcast(room, io);
    if (room.game && isAiTurn(room)) maybeContinueAi(room, io);
  });
});

function begin(room) {
  const result = startGame(room);
    if (!result.ok) {
      if (result.error !== "對局已經開始") io.to(room.code).emit("errorMsg", result.error);
      return;
    }
  broadcast(room, io);
  io.to(room.code).emit("started");
  if (isAiTurn(room)) aiAct(room, io);
}

function sanitizeName(name) {
  const s = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  return s || "玩家";
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`飛行棋 server http://127.0.0.1:${PORT}`);
});
