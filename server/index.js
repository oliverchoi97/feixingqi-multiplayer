import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  aiAct,
  animationMs,
  broadcast,
  clearTimers,
  createRoom,
  gameView,
  handleMove,
  handleRoll,
  allowHumanRoll,
  isAiTurn,
  joinRoom,
  lobbyView,
  makeId,
  maybeContinueAi,
  schedule,
  chooseColor,
  setReady,
  startGame,
  endMatch,
  removePlayer,
} from "./rooms.js";
import {
  broadcastMines,
  createMinesRoom,
  endMinesMatch,
  handleDisconnect,
  handleFlag,
  handleReveal,
  joinMinesRoom,
  makeId as minesMakeId,
  minesGameView,
  setMinesReady,
  startMinesGame,
} from "./minesRooms.js";
import {
  TABLE_GAMES,
  broadcastTable,
  clearTableTimers,
  createTableRoom,
  endTableMatch,
  handleTableDisconnect,
  handleTableMove,
  isTableAiTurn,
  joinTableRoom,
  maybeTableAi,
  removeTablePlayer,
  setTableReady,
  startTableGame,
  tableGameView,
} from "./tableRooms.js";
import {
  addStroke,
  broadcastDraw,
  clearDrawTimers,
  clearStrokes,
  createDrawRoom,
  drawGameView,
  endDrawMatch,
  handleDrawDisconnect,
  handleGuess,
  joinDrawRoom,
  nextDrawRound,
  removeDrawPlayer,
  ROUND_MS,
  scheduleDraw,
  setDrawReady,
  startDrawGame,
} from "./drawRooms.js";
import { takeChat } from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 43177);
const publicDir = path.join(__dirname, "../public");
const rooms = new Map();
const minesRooms = new Map();
const tableRooms = new Map();
const drawRooms = new Map();

const app = express();
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/", (req, res) => {
  if (req.query.room) {
    const code = String(req.query.room).trim().slice(0, 8);
    return res.redirect(302, `/feixingqi?room=${encodeURIComponent(code)}`);
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

const pages = {
  "/feixingqi": ["feixingqi", "index.html"],
  "/minesweeper": ["minesweeper", "index.html"],
  "/gomoku": ["gomoku", "index.html"],
  "/othello": ["othello", "index.html"],
  "/go": ["go", "index.html"],
  "/guosanguan": ["guosanguan", "index.html"],
  "/drawguess": ["drawguess", "index.html"],
  "/reversi": ["othello", "index.html"],
};

for (const [route, parts] of Object.entries(pages)) {
  app.get([route, `${route}/`], (_req, res) => {
    res.sendFile(path.join(publicDir, ...parts));
  });
}

app.use(express.static(publicDir));
app.use("/shared", express.static(path.join(__dirname, "../shared")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

function getRoom(code) {
  if (!code) return null;
  return rooms.get(String(code).trim().toUpperCase()) ?? null;
}

function getMinesRoom(code) {
  if (!code) return null;
  return minesRooms.get(String(code).trim().toUpperCase()) ?? null;
}

function getTableRoom(code) {
  if (!code) return null;
  return tableRooms.get(String(code).trim().toUpperCase()) ?? null;
}

function getDrawRoom(code) {
  if (!code) return null;
  return drawRooms.get(String(code).trim().toUpperCase()) ?? null;
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
  for (const [code, room] of minesRooms) {
    const anyone = room.players.some((p) => p.connected);
    if (!anyone && now - room.createdAt > 1000 * 60 * 30) minesRooms.delete(code);
  }
  for (const [code, room] of tableRooms) {
    const anyone = room.players.filter((p) => p.type === "human").some((p) => p.connected);
    if (!anyone && now - room.createdAt > 1000 * 60 * 30) {
      clearTableTimers(room);
      tableRooms.delete(code);
    }
  }
  for (const [code, room] of drawRooms) {
    const anyone = room.players.some((p) => p.connected);
    if (!anyone && now - room.createdAt > 1000 * 60 * 30) {
      clearDrawTimers(room);
      drawRooms.delete(code);
    }
  }
}
setInterval(pruneRooms, 60_000);

function emitEnded(nsp, room, { requesterId, toMenu, destOthers }) {
  const map = nsp.sockets?.sockets ?? nsp.sockets;
  for (const p of room.players) {
    if (p.type === "ai" || !p.socketId) continue;
    const sock = map?.get?.(p.socketId);
    if (!sock) continue;
    const dest = p.playerId === requesterId && toMenu ? "menu" : destOthers;
    sock.emit("matchEnded", { dest, code: room.code });
  }
}

function attachChat(socket, getRoomFn, nsp) {
  socket.on("chat", (raw) => {
    const room = getRoomFn();
    if (!room) return;
    const p = room.players.find((x) => x.playerId === socket.data.playerId);
    if (!p) return;
    const result = takeChat(socket.data, raw);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    nsp.to(room.code).emit("chat", {
      nickname: p.nickname,
      text: result.text,
      playerId: p.playerId,
    });
  });
}

io.on("connection", (socket) => {
  socket.on("create", ({ nickname, playerId } = {}) => {
    const id = playerId || makeId();
    const room = createRoom({
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
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
    if (!result.ok) {
      if (result.error) socket.emit("errorMsg", result.error);
      return;
    }
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

  socket.on("chooseColor", (color) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const result = chooseColor(room, socket.data.playerId, color);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    socket.emit("joined", {
      playerId: socket.data.playerId,
      code: room.code,
      color: result.color,
    });
    broadcast(room, io);
  });

  socket.on("rolling", () => {
    const room = getRoom(socket.data.roomCode);
    if (!allowHumanRoll(room)) return;
    const color = room.game.seats[room.game.turnIndex]?.color;
    const seat = room.game.seats.find((s) => s.color === color);
    if (!seat || seat.playerId !== socket.data.playerId) return;
    socket.to(room.code).emit("rolling", { color });
  });

  socket.on("roll", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    // Extra turn after a 6 (takeoff) sets action=roll immediately, but busy
    // stays true until animationMs. Dropping the roll left the center die spinning.
    if (!allowHumanRoll(room)) {
      const result = handleRoll(room, socket.data.playerId);
      socket.emit("errorMsg", result.error || "現在不能擲骰");
      return;
    }
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

  socket.on("endMatch", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    endMatch(room);
    emitEnded(io, room, { requesterId: socket.data.playerId, toMenu: false, destOthers: "lobby" });
    broadcast(room, io);
  });

  socket.on("exitToMenu", () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) {
      socket.emit("matchEnded", { dest: "menu" });
      return;
    }
    endMatch(room);
    emitEnded(io, room, { requesterId: socket.data.playerId, toMenu: true, destOthers: "lobby" });
    removePlayer(room, socket.data.playerId);
    socket.leave(room.code);
    socket.data.roomCode = null;
    broadcast(room, io);
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

  attachChat(socket, () => getRoom(socket.data.roomCode), io);
});

const minesNsp = io.of("/mines");
minesNsp.on("connection", (socket) => {
  socket.on("create", ({ nickname, playerId } = {}) => {
    const id = playerId || minesMakeId();
    const room = createMinesRoom({
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
    minesRooms.set(room.code, room);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("joined", { playerId: id, code: room.code });
    broadcastMines(room, minesNsp);
  });

  socket.on("join", ({ code, nickname, playerId } = {}) => {
    const room = getMinesRoom(code);
    if (!room) {
      socket.emit("errorMsg", "找不到這個房間");
      return;
    }
    const id = playerId || minesMakeId();
    const result = joinMinesRoom(room, {
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
    socket.emit("joined", { playerId: id, code: room.code, rejoin: result.rejoin });
    broadcastMines(room, minesNsp);
    if (room.game) {
      const view = minesGameView(room, id);
      if (view) socket.emit("state", view);
    }
  });

  socket.on("ready", (ready) => {
    const room = getMinesRoom(socket.data.roomCode);
    if (!room) return;
    const result = setMinesReady(room, socket.data.playerId, ready);
    if (!result.ok) return;
    broadcastMines(room, minesNsp);
    if (result.autoStart) beginMines(room);
  });

  socket.on("start", () => {
    const room = getMinesRoom(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) {
      socket.emit("errorMsg", "只有房主可以開始遊戲");
      return;
    }
    beginMines(room);
  });

  socket.on("reveal", (index) => {
    const room = getMinesRoom(socket.data.roomCode);
    if (!room) return;
    const result = handleReveal(room, socket.data.playerId, index);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    broadcastMines(room, minesNsp);
  });

  socket.on("flag", (index) => {
    const room = getMinesRoom(socket.data.roomCode);
    if (!room) return;
    const result = handleFlag(room, socket.data.playerId, index);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    broadcastMines(room, minesNsp);
  });

  socket.on("endMatch", () => abortMines(socket, false));
  socket.on("exitToMenu", () => abortMines(socket, true));

  socket.on("disconnect", () => {
    const room = getMinesRoom(socket.data.roomCode);
    if (!room) return;
    handleDisconnect(room, socket.data.playerId);
    broadcastMines(room, minesNsp);
  });

  attachChat(socket, () => getMinesRoom(socket.data.roomCode), minesNsp);
});

function abortMines(socket, toMenu) {
  const room = getMinesRoom(socket.data.roomCode);
  if (!room) {
    socket.emit("matchEnded", { dest: toMenu ? "menu" : "hub" });
    return;
  }
  endMinesMatch(room);
  emitEnded(minesNsp, room, {
    requesterId: socket.data.playerId,
    toMenu,
    destOthers: "hub",
  });
  minesRooms.delete(room.code);
}

const tableNsp = io.of("/table");
tableNsp.on("connection", (socket) => {
  socket.on("create", ({ kind, nickname, playerId } = {}) => {
    if (!TABLE_GAMES[kind]) {
      socket.emit("errorMsg", "沒有這個遊戲");
      return;
    }
    const id = playerId || makeId();
    const room = createTableRoom(kind, {
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
    tableRooms.set(room.code, room);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("joined", { playerId: id, code: room.code, kind });
    broadcastTable(room, tableNsp);
  });

  socket.on("join", ({ code, nickname, playerId, kind } = {}) => {
    const room = getTableRoom(code);
    if (!room) {
      socket.emit("errorMsg", "找不到這個房間");
      return;
    }
    if (kind && room.kind !== kind) {
      socket.emit("errorMsg", "房間代碼與遊戲不符");
      return;
    }
    const id = playerId || makeId();
    const result = joinTableRoom(room, {
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
    socket.emit("joined", { playerId: id, code: room.code, kind: room.kind, rejoin: result.rejoin });
    broadcastTable(room, tableNsp);
    if (room.game) socket.emit("state", tableGameView(room, id));
  });

  socket.on("ready", (ready) => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) return;
    const result = setTableReady(room, socket.data.playerId, ready);
    if (!result.ok) return;
    broadcastTable(room, tableNsp);
    if (result.autoStart) beginTable(room);
  });

  socket.on("start", () => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) {
      socket.emit("errorMsg", "只有房主可以開始遊戲");
      return;
    }
    beginTable(room);
  });

  socket.on("move", (payload) => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) return;
    const result = handleTableMove(room, socket.data.playerId, payload);
    if (!result.ok) {
      socket.emit("errorMsg", result.error);
      return;
    }
    broadcastTable(room, tableNsp);
    if (isTableAiTurn(room)) maybeTableAi(room, tableNsp);
  });

  socket.on("endMatch", () => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) return;
    endTableMatch(room);
    emitEnded(tableNsp, room, {
      requesterId: socket.data.playerId,
      toMenu: false,
      destOthers: "lobby",
    });
    broadcastTable(room, tableNsp);
  });

  socket.on("exitToMenu", () => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) {
      socket.emit("matchEnded", { dest: "menu" });
      return;
    }
    endTableMatch(room);
    emitEnded(tableNsp, room, {
      requesterId: socket.data.playerId,
      toMenu: true,
      destOthers: "lobby",
    });
    removeTablePlayer(room, socket.data.playerId);
    socket.leave(room.code);
    socket.data.roomCode = null;
    broadcastTable(room, tableNsp);
  });

  socket.on("disconnect", () => {
    const room = getTableRoom(socket.data.roomCode);
    if (!room) return;
    handleTableDisconnect(room, socket.data.playerId);
    broadcastTable(room, tableNsp);
    if (isTableAiTurn(room)) maybeTableAi(room, tableNsp);
  });

  attachChat(socket, () => getTableRoom(socket.data.roomCode), tableNsp);
});

const drawNsp = io.of("/draw");
drawNsp.on("connection", (socket) => {
  socket.on("create", ({ nickname, playerId } = {}) => {
    const id = playerId || makeId();
    const room = createDrawRoom({
      playerId: id,
      nickname: sanitizeName(nickname),
      socketId: socket.id,
    });
    drawRooms.set(room.code, room);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit("joined", { playerId: id, code: room.code });
    broadcastDraw(room, drawNsp);
  });

  socket.on("join", ({ code, nickname, playerId } = {}) => {
    const room = getDrawRoom(code);
    if (!room) {
      socket.emit("errorMsg", "找不到這個房間");
      return;
    }
    const id = playerId || makeId();
    const result = joinDrawRoom(room, {
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
    socket.emit("joined", { playerId: id, code: room.code, rejoin: result.rejoin });
    broadcastDraw(room, drawNsp);
    if (room.game) socket.emit("state", drawGameView(room, id));
  });

  socket.on("ready", (ready) => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    const result = setDrawReady(room, socket.data.playerId, ready);
    if (!result.ok) return;
    broadcastDraw(room, drawNsp);
    if (result.autoStart) beginDraw(room);
  });

  socket.on("start", () => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) {
      socket.emit("errorMsg", "只有房主可以開始遊戲");
      return;
    }
    beginDraw(room);
  });

  socket.on("stroke", (stroke) => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    const result = addStroke(room, socket.data.playerId, stroke);
    if (!result.ok) return;
    socket.to(room.code).emit("stroke", result.stroke);
  });

  socket.on("clearCanvas", () => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    const result = clearStrokes(room, socket.data.playerId);
    if (!result.ok) return;
    drawNsp.to(room.code).emit("cleared");
  });

  socket.on("guess", (text) => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    const p = room.players.find((x) => x.playerId === socket.data.playerId);
    const result = handleGuess(room, socket.data.playerId, text);
    if (!result.ok) {
      if (result.error) socket.emit("errorMsg", result.error);
      return;
    }
    if (!result.correct) {
      drawNsp.to(room.code).emit("chat", {
        nickname: p?.nickname ?? "玩家",
        text: result.text,
        playerId: socket.data.playerId,
      });
      return;
    }
    clearDrawTimers(room);
    broadcastDraw(room, drawNsp);
    scheduleDraw(room, () => {
      nextDrawRound(room);
      broadcastDraw(room, drawNsp);
      if (room.game?.phase === "drawing") armDrawTimer(room);
    }, 2800);
  });

  socket.on("endMatch", () => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    endDrawMatch(room);
    emitEnded(drawNsp, room, {
      requesterId: socket.data.playerId,
      toMenu: false,
      destOthers: "lobby",
    });
    broadcastDraw(room, drawNsp);
  });

  socket.on("exitToMenu", () => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) {
      socket.emit("matchEnded", { dest: "menu" });
      return;
    }
    endDrawMatch(room);
    emitEnded(drawNsp, room, {
      requesterId: socket.data.playerId,
      toMenu: true,
      destOthers: "lobby",
    });
    removeDrawPlayer(room, socket.data.playerId);
    socket.leave(room.code);
    socket.data.roomCode = null;
    broadcastDraw(room, drawNsp);
  });

  socket.on("disconnect", () => {
    const room = getDrawRoom(socket.data.roomCode);
    if (!room) return;
    handleDrawDisconnect(room, socket.data.playerId);
    broadcastDraw(room, drawNsp);
  });

  attachChat(socket, () => getDrawRoom(socket.data.roomCode), drawNsp);
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

function beginMines(room) {
  const result = startMinesGame(room);
  if (!result.ok) {
    if (result.error !== "對局已經開始") minesNsp.to(room.code).emit("errorMsg", result.error);
    return;
  }
  minesNsp.to(room.code).emit("started");
  broadcastMines(room, minesNsp);
}

function beginTable(room) {
  const result = startTableGame(room);
  if (!result.ok) {
    if (result.error !== "對局已經開始") tableNsp.to(room.code).emit("errorMsg", result.error);
    return;
  }
  tableNsp.to(room.code).emit("started");
  broadcastTable(room, tableNsp);
  if (isTableAiTurn(room)) maybeTableAi(room, tableNsp);
}

function beginDraw(room) {
  const result = startDrawGame(room);
  if (!result.ok) {
    if (result.error !== "對局已經開始") drawNsp.to(room.code).emit("errorMsg", result.error);
    return;
  }
  broadcastDraw(room, drawNsp);
  armDrawTimer(room);
}

function armDrawTimer(room) {
  clearDrawTimers(room);
  scheduleDraw(room, () => {
    if (!room.game || room.game.phase !== "drawing") return;
    room.game.phase = "reveal";
    broadcastDraw(room, drawNsp);
    scheduleDraw(room, () => {
      nextDrawRound(room);
      broadcastDraw(room, drawNsp);
      if (room.game?.phase === "drawing") armDrawTimer(room);
    }, 2800);
  }, Math.max(500, (room.game.roundEndsAt || Date.now()) - Date.now()) || ROUND_MS);
}

function sanitizeName(name) {
  const s = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  return s || "玩家";
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gaming In My Life http://127.0.0.1:${PORT}`);
});
