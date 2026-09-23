/** 五子棋：10×10 無禁手，連五即勝。先手黑=1。 */

export const SIZE = 10;
export const SIDES = {
  1: { id: 1, nameZh: "黑", mark: "●" },
  2: { id: 2, nameZh: "白", mark: "○" },
};

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function idx(x, y) {
  return y * SIZE + x;
}

export function inBoard(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function createGame(seats) {
  return {
    kind: "gomoku",
    phase: "playing",
    cells: Array(SIZE * SIZE).fill(0),
    turn: 1,
    winner: 0,
    reason: null,
    last: null,
    moveCount: 0,
    seats,
  };
}

export function countDir(cells, x, y, dx, dy, side) {
  let n = 0;
  let cx = x + dx;
  let cy = y + dy;
  while (inBoard(cx, cy) && cells[idx(cx, cy)] === side) {
    n++;
    cx += dx;
    cy += dy;
  }
  return n;
}

export function isFive(cells, x, y) {
  const side = cells[idx(x, y)];
  if (!side) return false;
  for (const [dx, dy] of DIRS) {
    const n = 1 + countDir(cells, x, y, dx, dy, side) + countDir(cells, x, y, -dx, -dy, side);
    if (n >= 5) return true;
  }
  return false;
}

export function applyMove(game, side, { x, y }) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (side !== game.turn) return { ok: false, error: "還沒輪到你" };
  const px = Number(x);
  const py = Number(y);
  if (!inBoard(px, py)) return { ok: false, error: "超出棋盤" };
  const i = idx(px, py);
  if (game.cells[i]) return { ok: false, error: "這裡已有棋子" };
  game.cells[i] = side;
  game.last = { x: px, y: py, side };
  game.moveCount++;
  if (isFive(game.cells, px, py)) {
    game.phase = "ended";
    game.winner = side;
    game.reason = "five";
  } else if (game.moveCount >= SIZE * SIZE) {
    game.phase = "ended";
    game.winner = 0;
    game.reason = "draw";
  } else {
    game.turn = side === 1 ? 2 : 1;
  }
  return { ok: true };
}

export function legalMoves(game) {
  if (game.phase !== "playing") return [];
  const moves = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!game.cells[idx(x, y)]) moves.push({ x, y });
    }
  }
  return moves;
}

function wouldWin(game, x, y, side) {
  const i = idx(x, y);
  if (game.cells[i]) return false;
  game.cells[i] = side;
  const ok = isFive(game.cells, x, y);
  game.cells[i] = 0;
  return ok;
}

export function pickAiMove(game) {
  const empties = [];
  const near = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (game.cells[idx(x, y)]) continue;
      empties.push({ x, y });
      if (hasNeighbor(game.cells, x, y)) near.push({ x, y });
    }
  }
  if (!empties.length) return null;
  const me = game.turn;
  const foe = me === 1 ? 2 : 1;
  const pool = near.length ? near : empties;
  for (const m of pool) if (wouldWin(game, m.x, m.y, me)) return m;
  for (const m of pool) if (wouldWin(game, m.x, m.y, foe)) return m;
  if (!game.last) return { x: 4, y: 4 };
  const scored = pool.map((m) => {
    let s = 0;
    for (const [dx, dy] of DIRS) {
      s += countDir(game.cells, m.x, m.y, dx, dy, me) * 3;
      s += countDir(game.cells, m.x, m.y, -dx, -dy, me) * 3;
      s += countDir(game.cells, m.x, m.y, dx, dy, foe);
      s += countDir(game.cells, m.x, m.y, -dx, -dy, foe);
    }
    const d = Math.abs(m.x - 4) + Math.abs(m.y - 4);
    return { m, s: s * 10 - d };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].m;
}

function hasNeighbor(cells, x, y) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBoard(nx, ny) && cells[idx(nx, ny)]) return true;
    }
  }
  return false;
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  return {
    kind: "gomoku",
    phase: game.phase,
    cells: game.cells.slice(),
    turn: game.turn,
    winner: game.winner,
    reason: game.reason,
    last: game.last,
    size: SIZE,
    yourSide: you?.type === "human" ? you.side : you?.side ?? 0,
    yourTurn: game.phase === "playing" && you?.type !== "ai" && you?.side === game.turn,
    seats: game.seats.map((s) => ({
      side: s.side,
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
    })),
  };
}
