/** 9×9 圍棋 MVP：提子、禁止自殺、簡單劫、兩次虛手終局；領地估算不含複雜死活。黑=1 先手，白貼 6.5 目。 */

export const SIZE = 9;
export const KOMI = 6.5;
export const SIDES = {
  1: { id: 1, nameZh: "黑", mark: "●" },
  2: { id: 2, nameZh: "白", mark: "○" },
};

export function idx(x, y) {
  return y * SIZE + x;
}

export function inBoard(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function neighbors(i) {
  const x = i % SIZE;
  const y = (i / SIZE) | 0;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < SIZE - 1) out.push(i + 1);
  if (y > 0) out.push(i - SIZE);
  if (y < SIZE - 1) out.push(i + SIZE);
  return out;
}

export function snapshot(cells) {
  return cells.join("");
}

export function createGame(seats) {
  return {
    kind: "go",
    phase: "playing",
    cells: Array(SIZE * SIZE).fill(0),
    turn: 1,
    winner: 0,
    reason: null,
    last: null,
    passed: false,
    captures: { 1: 0, 2: 0 },
    prevSnap: null,
    score: null,
    seats,
  };
}

export function groupAt(cells, start) {
  const color = cells[start];
  const stones = new Set();
  const libs = new Set();
  if (!color) return { stones, libs };
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (stones.has(i)) continue;
    stones.add(i);
    for (const n of neighbors(i)) {
      if (cells[n] === 0) libs.add(n);
      else if (cells[n] === color && !stones.has(n)) stack.push(n);
    }
  }
  return { stones, libs };
}

function tryPlace(cells, i, side) {
  const next = cells.slice();
  next[i] = side;
  const foe = side === 1 ? 2 : 1;
  let captured = [];
  const seen = new Set();
  for (const n of neighbors(i)) {
    if (next[n] !== foe || seen.has(n)) continue;
    const g = groupAt(next, n);
    for (const s of g.stones) seen.add(s);
    if (g.libs.size === 0) captured = captured.concat([...g.stones]);
  }
  for (const c of captured) next[c] = 0;
  const own = groupAt(next, i);
  if (own.libs.size === 0) return { ok: false, suicide: true };
  return { ok: true, next, captured };
}

export function applyMove(game, side, payload) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (side !== game.turn) return { ok: false, error: "還沒輪到你" };

  if (payload?.pass) {
    if (game.passed) {
      finishByScore(game);
      game.last = { pass: true, side };
      return { ok: true, pass: true, ended: true };
    }
    game.passed = true;
    game.last = { pass: true, side };
    game.prevSnap = snapshot(game.cells);
    game.turn = side === 1 ? 2 : 1;
    return { ok: true, pass: true };
  }

  const x = Number(payload?.x);
  const y = Number(payload?.y);
  if (!inBoard(x, y)) return { ok: false, error: "超出棋盤" };
  const i = idx(x, y);
  if (game.cells[i]) return { ok: false, error: "這裡已有棋子" };
  const placed = tryPlace(game.cells, i, side);
  if (!placed.ok) return { ok: false, error: "禁止自殺" };
  if (game.prevSnap && snapshot(placed.next) === game.prevSnap) {
    return { ok: false, error: "劫爭：不可立即回提" };
  }
  game.prevSnap = snapshot(game.cells);
  game.cells = placed.next;
  game.captures[side] += placed.captured.length;
  game.passed = false;
  game.last = { x, y, side, captured: placed.captured.length };
  game.turn = side === 1 ? 2 : 1;
  return { ok: true, captured: placed.captured.length };
}

export function estimateScore(cells, captures, komi = KOMI) {
  const stones = { 1: 0, 2: 0 };
  const territory = { 1: 0, 2: 0 };
  const seen = new Set();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 1) stones[1]++;
    else if (cells[i] === 2) stones[2]++;
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== 0 || seen.has(i)) continue;
    const region = [];
    const colors = new Set();
    const stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (seen.has(j) || cells[j] !== 0) continue;
      seen.add(j);
      region.push(j);
      for (const n of neighbors(j)) {
        if (cells[n] === 0) stack.push(n);
        else colors.add(cells[n]);
      }
    }
    if (colors.size === 1) territory[[...colors][0]] += region.length;
  }
  const black = stones[1] + territory[1];
  const white = stones[2] + territory[2] + komi;
  return {
    black,
    white,
    stones,
    territory,
    captures: { ...captures },
    komi,
    winner: black > white ? 1 : white > black ? 2 : 0,
  };
}

function finishByScore(game) {
  game.phase = "ended";
  game.reason = "pass";
  game.score = estimateScore(game.cells, game.captures);
  game.winner = game.score.winner;
}

export function legalMoves(game, side = game.turn) {
  if (game.phase !== "playing") return [];
  const moves = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      if (game.cells[i]) continue;
      const placed = tryPlace(game.cells, i, side);
      if (!placed.ok) continue;
      if (game.prevSnap && snapshot(placed.next) === game.prevSnap) continue;
      moves.push({ x, y, captured: placed.captured.length });
    }
  }
  return moves;
}

export function pickAiMove(game) {
  const moves = legalMoves(game);
  if (!moves.length) return { pass: true };
  const caps = moves.filter((m) => m.captured > 0);
  if (caps.length) {
    caps.sort((a, b) => b.captured - a.captured);
    return { x: caps[0].x, y: caps[0].y };
  }
  const mid = moves.filter((m) => m.x > 0 && m.x < 8 && m.y > 0 && m.y < 8);
  const pool = mid.length ? mid : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  return {
    kind: "go",
    phase: game.phase,
    cells: game.cells.slice(),
    turn: game.turn,
    winner: game.winner,
    reason: game.reason,
    last: game.last,
    captures: { ...game.captures },
    score: game.score,
    size: SIZE,
    komi: KOMI,
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
