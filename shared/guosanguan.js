/** 過三關：3×3，最多 7 子；第 8 子落下時先看有沒有三連，沒有則最舊的子消失再判。先手 ○=1，後手 ×=2。 */

export const SIZE = 3;
export const MAX_MARKS = 7;
export const SIDES = {
  1: { id: 1, nameZh: "圈", mark: "○" },
  2: { id: 2, nameZh: "叉", mark: "×" },
};

const WINS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createGame(seats) {
  return {
    kind: "guosanguan",
    phase: "playing",
    cells: Array(9).fill(0),
    order: [],
    turn: 1,
    winner: 0,
    reason: null,
    last: null,
    seats,
  };
}

export function winnerOf(cells) {
  for (const line of WINS) {
    const a = cells[line[0]];
    if (a && a === cells[line[1]] && a === cells[line[2]]) return a;
  }
  return 0;
}

export function applyMove(game, side, index) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (side !== game.turn) return { ok: false, error: "還沒輪到你" };
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 8) return { ok: false, error: "格子不對" };
  if (game.cells[i]) return { ok: false, error: "這裡已有棋子" };

  game.cells[i] = side;
  game.order.push(i);
  let vanished = null;
  let win = winnerOf(game.cells);
  if (!win && game.order.length > MAX_MARKS) {
    vanished = game.order.shift();
    game.cells[vanished] = 0;
    win = winnerOf(game.cells);
  }
  game.last = { index: i, side, vanished };
  if (win) {
    game.phase = "ended";
    game.winner = win;
    game.reason = "line";
  } else {
    game.turn = side === 1 ? 2 : 1;
  }
  return { ok: true, vanished, win };
}

export function legalMoves(game) {
  if (game.phase !== "playing") return [];
  const moves = [];
  for (let i = 0; i < 9; i++) if (!game.cells[i]) moves.push(i);
  return moves;
}

export function pickAiMove(game) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  const me = game.turn;
  const foe = me === 1 ? 2 : 1;
  const trySide = (side) => {
    for (const i of moves) {
      const cells = game.cells.slice();
      const order = game.order.slice();
      cells[i] = side;
      order.push(i);
      if (winnerOf(cells) === side) return i;
      if (order.length > MAX_MARKS) {
        cells[order[0]] = 0;
        if (winnerOf(cells) === side) return i;
      }
    }
    return null;
  };
  return trySide(me) ?? trySide(foe) ?? moves[Math.floor(Math.random() * moves.length)];
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  return {
    kind: "guosanguan",
    phase: game.phase,
    cells: game.cells.slice(),
    order: game.order.slice(),
    turn: game.turn,
    winner: game.winner,
    reason: game.reason,
    last: game.last,
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
