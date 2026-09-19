/** Classic Minesweeper layouts and rules used by solo + 2-player race. */

export const PRESETS = {
  A: { key: "A", nameZh: "初級", cols: 9, rows: 9, mines: 10 },
  B: { key: "B", nameZh: "中級", cols: 16, rows: 16, mines: 40 },
  C: { key: "C", nameZh: "高級", cols: 30, rows: 16, mines: 99 },
};

export function safeCells(preset) {
  return preset.cols * preset.rows - preset.mines;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function neighbors(cols, rows, index) {
  const x = index % cols;
  const y = Math.floor(index / cols);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(ny * cols + nx);
    }
  }
  return out;
}

export function emptyBoard(preset) {
  const cols = preset.cols;
  const rows = preset.rows;
  const n = cols * rows;
  return {
    cols,
    rows,
    mines: preset.mines,
    n,
    mine: new Uint8Array(n),
    adj: new Uint8Array(n),
    revealed: new Uint8Array(n),
    flagged: new Uint8Array(n),
    placed: false,
    exploded: -1,
    alive: true,
    won: false,
    revealedSafe: 0,
    flagCount: 0,
  };
}

export function cloneLayout(layout) {
  const board = emptyBoard({
    cols: layout.cols,
    rows: layout.rows,
    mines: layout.mines,
  });
  board.mine.set(layout.mine);
  board.adj.set(layout.adj);
  board.placed = true;
  return board;
}

export function generateLayout(preset, rng) {
  const board = emptyBoard(preset);
  placeMines(board, rng, -1);
  return board;
}

export function placeMines(board, rng, safeIndex) {
  const banned = new Set();
  if (safeIndex >= 0 && safeIndex < board.n) {
    banned.add(safeIndex);
    for (const n of neighbors(board.cols, board.rows, safeIndex)) banned.add(n);
    if (board.n - banned.size < board.mines) {
      banned.clear();
      banned.add(safeIndex);
    }
  }
  const slots = [];
  for (let i = 0; i < board.n; i++) {
    if (!banned.has(i)) slots.push(i);
  }
  for (let m = 0; m < board.mines; m++) {
    const pick = Math.floor(rng() * slots.length);
    const cell = slots[pick];
    slots[pick] = slots[slots.length - 1];
    slots.pop();
    board.mine[cell] = 1;
  }
  for (let i = 0; i < board.n; i++) {
    if (board.mine[i]) {
      board.adj[i] = 0;
      continue;
    }
    let c = 0;
    for (const n of neighbors(board.cols, board.rows, i)) if (board.mine[n]) c++;
    board.adj[i] = c;
  }
  board.placed = true;
}

export function toggleFlag(board, index) {
  if (!board.alive || board.won) return { ok: false, error: "對局已結束" };
  if (index < 0 || index >= board.n) return { ok: false, error: "格子無效" };
  if (board.revealed[index]) return { ok: false, error: "已揭開" };
  if (board.flagged[index]) {
    board.flagged[index] = 0;
    board.flagCount -= 1;
  } else {
    board.flagged[index] = 1;
    board.flagCount += 1;
  }
  return { ok: true, flagged: !!board.flagged[index], flagCount: board.flagCount };
}

export function revealCell(board, index, rng) {
  if (!board.alive || board.won) return { ok: false, error: "對局已結束" };
  if (index < 0 || index >= board.n) return { ok: false, error: "格子無效" };
  if (board.flagged[index]) return { ok: false, error: "已插旗" };
  if (board.revealed[index]) return { ok: false, error: "已揭開" };
  if (!board.placed) {
    const src = rng || Math.random;
    placeMines(board, typeof src === "function" ? src : Math.random, index);
  }
  if (board.mine[index]) {
    board.revealed[index] = 1;
    board.exploded = index;
    board.alive = false;
    return { ok: true, hit: true, opened: [{ i: index, adj: 0, mine: true }], won: false };
  }
  const opened = floodReveal(board, index);
  const won = board.revealedSafe === board.n - board.mines;
  if (won) {
    board.won = true;
    board.alive = true;
  }
  return { ok: true, hit: false, opened, won };
}

function floodReveal(board, start) {
  const opened = [];
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (board.revealed[i] || board.flagged[i] || board.mine[i]) continue;
    board.revealed[i] = 1;
    board.revealedSafe += 1;
    opened.push({ i, adj: board.adj[i], mine: false });
    if (board.adj[i] === 0) {
      for (const n of neighbors(board.cols, board.rows, i)) {
        if (!board.revealed[n] && !board.flagged[n] && !board.mine[n]) stack.push(n);
      }
    }
  }
  return opened;
}

export function remainingMines(board) {
  return board.mines - board.flagCount;
}

export function publicOwnBoard(board, { showMines = false } = {}) {
  const cells = [];
  for (let i = 0; i < board.n; i++) {
    if (board.revealed[i]) {
      cells.push({
        i,
        revealed: true,
        flagged: false,
        adj: board.mine[i] ? 0 : board.adj[i],
        mine: !!board.mine[i],
      });
    } else if (board.flagged[i]) {
      cells.push({ i, revealed: false, flagged: true, adj: 0, mine: false });
    } else if (showMines && board.mine[i]) {
      cells.push({ i, revealed: false, flagged: false, adj: 0, mine: true });
    }
  }
  return {
    cols: board.cols,
    rows: board.rows,
    mines: board.mines,
    n: board.n,
    alive: board.alive,
    won: board.won,
    exploded: board.exploded,
    revealedSafe: board.revealedSafe,
    flagCount: board.flagCount,
    remaining: remainingMines(board),
    cells,
  };
}
