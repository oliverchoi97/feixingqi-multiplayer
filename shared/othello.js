/** 黑白棋 8×8。黑=1 先手，白=2。 */

export const SIZE = 8;
export const SIDES = {
  1: { id: 1, nameZh: "黑", mark: "●" },
  2: { id: 2, nameZh: "白", mark: "○" },
};

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function idx(x, y) {
  return y * SIZE + x;
}

export function inBoard(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function createGame(seats) {
  const cells = Array(SIZE * SIZE).fill(0);
  cells[idx(3, 3)] = 2;
  cells[idx(4, 3)] = 1;
  cells[idx(3, 4)] = 1;
  cells[idx(4, 4)] = 2;
  return {
    kind: "othello",
    phase: "playing",
    cells,
    turn: 1,
    winner: 0,
    reason: null,
    last: null,
    passed: false,
    counts: { 1: 2, 2: 2 },
    seats,
  };
}

export function flipsAt(cells, x, y, side) {
  if (!inBoard(x, y) || cells[idx(x, y)]) return [];
  const foe = side === 1 ? 2 : 1;
  const out = [];
  for (const [dx, dy] of DIRS) {
    const run = [];
    let cx = x + dx;
    let cy = y + dy;
    while (inBoard(cx, cy) && cells[idx(cx, cy)] === foe) {
      run.push(idx(cx, cy));
      cx += dx;
      cy += dy;
    }
    if (run.length && inBoard(cx, cy) && cells[idx(cx, cy)] === side) out.push(...run);
  }
  return out;
}

export function legalMoves(game, side = game.turn) {
  if (game.phase !== "playing") return [];
  const moves = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const flips = flipsAt(game.cells, x, y, side);
      if (flips.length) moves.push({ x, y, flips });
    }
  }
  return moves;
}

function recount(cells) {
  const counts = { 1: 0, 2: 0 };
  for (const c of cells) if (c) counts[c]++;
  return counts;
}

function finish(game, reason) {
  game.phase = "ended";
  game.reason = reason;
  game.counts = recount(game.cells);
  if (game.counts[1] > game.counts[2]) game.winner = 1;
  else if (game.counts[2] > game.counts[1]) game.winner = 2;
  else game.winner = 0;
}

export function applyMove(game, side, payload) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (side !== game.turn) return { ok: false, error: "還沒輪到你" };
  if (payload?.pass) {
    if (legalMoves(game, side).length) return { ok: false, error: "還有可下的位置" };
    if (game.passed) {
      finish(game, "pass");
      return { ok: true, pass: true };
    }
    game.passed = true;
    game.last = { pass: true, side };
    game.turn = side === 1 ? 2 : 1;
    if (!legalMoves(game, game.turn).length) finish(game, "pass");
    return { ok: true, pass: true };
  }
  const x = Number(payload?.x);
  const y = Number(payload?.y);
  const flips = flipsAt(game.cells, x, y, side);
  if (!flips.length) return { ok: false, error: "這裡不能下" };
  game.cells[idx(x, y)] = side;
  for (const i of flips) game.cells[i] = side;
  game.passed = false;
  game.last = { x, y, side, flipped: flips.length };
  game.counts = recount(game.cells);
  game.turn = side === 1 ? 2 : 1;
  if (!legalMoves(game, game.turn).length) {
    if (!legalMoves(game, side).length) finish(game, "full");
    else {
      game.passed = true;
      game.turn = side;
    }
  }
  return { ok: true, flipped: flips.length };
}

export function pickAiMove(game) {
  const moves = legalMoves(game);
  if (!moves.length) return { pass: true };
  moves.sort((a, b) => b.flips.length - a.flips.length);
  const corners = moves.filter((m) => (m.x === 0 || m.x === 7) && (m.y === 0 || m.y === 7));
  if (corners.length) return corners[0];
  return moves[0];
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const legal = you && game.turn === you.side ? legalMoves(game) : [];
  return {
    kind: "othello",
    phase: game.phase,
    cells: game.cells.slice(),
    turn: game.turn,
    winner: game.winner,
    reason: game.reason,
    last: game.last,
    counts: { ...game.counts },
    size: SIZE,
    mustPass: game.phase === "playing" && you?.side === game.turn && !legal.length,
    legal: legal.map((m) => ({ x: m.x, y: m.y })),
    yourSide: you?.side ?? 0,
    yourTurn: game.phase === "playing" && you?.side === game.turn,
    seats: game.seats.map((s) => ({
      side: s.side,
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
    })),
  };
}
