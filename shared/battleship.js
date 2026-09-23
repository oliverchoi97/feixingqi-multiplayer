/** 海戰棋：10×10，佈署 60 秒、射擊每回合 30 秒。 */

export const SIZE = 10;
export const PLACE_MS = 60_000;
export const SHOT_MS = 30_000;
export const SHIPS = [
  { id: "carrier", name: "航空母艦", len: 5 },
  { id: "battleship", name: "戰艦", len: 4 },
  { id: "cruiser", name: "巡洋艦", len: 3 },
  { id: "sub", name: "潛艇", len: 3 },
  { id: "destroyer", name: "驅逐艦", len: 2 },
  { id: "patrol", name: "巡邏艇", len: 2 },
];

export function idx(x, y) {
  return y * SIZE + x;
}

export function inBoard(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

export function emptyGrid() {
  return Array(SIZE * SIZE).fill(0);
}

export function canPlace(grid, x, y, len, horiz) {
  for (let i = 0; i < len; i++) {
    const px = horiz ? x + i : x;
    const py = horiz ? y : y + i;
    if (!inBoard(px, py) || grid[idx(px, py)]) return false;
  }
  return true;
}

export function placeShip(grid, x, y, len, horiz, mark) {
  if (!canPlace(grid, x, y, len, horiz)) return false;
  for (let i = 0; i < len; i++) {
    const px = horiz ? x + i : x;
    const py = horiz ? y : y + i;
    grid[idx(px, py)] = mark;
  }
  return true;
}

export function randomFleet(rng = Math.random) {
  const grid = emptyGrid();
  const placed = [];
  for (let s = 0; s < SHIPS.length; s++) {
    const ship = SHIPS[s];
    let ok = false;
    for (let t = 0; t < 80; t++) {
      const horiz = rng() < 0.5;
      const x = Math.floor(rng() * SIZE);
      const y = Math.floor(rng() * SIZE);
      if (placeShip(grid, x, y, ship.len, horiz, s + 1)) {
        placed.push({ ...ship, x, y, horiz });
        ok = true;
        break;
      }
    }
    if (!ok) return randomFleet(rng);
  }
  return { grid, ships: placed };
}

export function createGame(seats) {
  return {
    kind: "battleship",
    phase: "place",
    seats,
    boards: {
      [seats[0].playerId]: { grid: emptyGrid(), ships: [], shots: emptyGrid(), ready: false },
      [seats[1].playerId]: { grid: emptyGrid(), ships: [], shots: emptyGrid(), ready: false },
    },
    turn: 0,
    winner: null,
    lastShot: null,
    placeEndsAt: Date.now() + PLACE_MS,
    shotEndsAt: null,
  };
}

export function applyPlace(game, playerId, fleet) {
  if (game.phase !== "place") return { ok: false, error: "現在不是佈署階段" };
  const board = game.boards[playerId];
  if (!board) return { ok: false, error: "你不在這局" };
  if (board.ready) return { ok: false, error: "已經鎖定陣形" };
  const grid = emptyGrid();
  const ships = [];
  const list = Array.isArray(fleet) ? fleet : [];
  if (list.length !== SHIPS.length) {
    const rnd = randomFleet();
    board.grid = rnd.grid;
    board.ships = rnd.ships;
    board.ready = true;
    maybeStartShots(game);
    return { ok: true, random: true };
  }
  for (let i = 0; i < SHIPS.length; i++) {
    const spec = SHIPS[i];
    const p = list[i] || {};
    const x = Number(p.x);
    const y = Number(p.y);
    const horiz = Boolean(p.horiz);
    if (!placeShip(grid, x, y, spec.len, horiz, i + 1)) {
      return { ok: false, error: `無法放下${spec.name}` };
    }
    ships.push({ ...spec, x, y, horiz });
  }
  board.grid = grid;
  board.ships = ships;
  board.ready = true;
  maybeStartShots(game);
  return { ok: true };
}

function maybeStartShots(game) {
  const ids = game.seats.map((s) => s.playerId);
  if (ids.every((id) => game.boards[id].ready)) {
    game.phase = "shot";
    game.shotEndsAt = Date.now() + SHOT_MS;
  }
}

export function lockUnready(game) {
  if (game.phase !== "place") return;
  for (const s of game.seats) {
    const b = game.boards[s.playerId];
    if (!b.ready) {
      const rnd = randomFleet();
      b.grid = rnd.grid;
      b.ships = rnd.ships;
      b.ready = true;
    }
  }
  maybeStartShots(game);
}

export function shipCells(ship) {
  const cells = [];
  for (let i = 0; i < ship.len; i++) {
    cells.push({
      x: ship.horiz ? ship.x + i : ship.x,
      y: ship.horiz ? ship.y : ship.y + i,
    });
  }
  return cells;
}

export function sunkShip(theirs, shots, x, y) {
  const mark = theirs.grid[idx(x, y)];
  if (!mark) return null;
  const ship = theirs.ships[mark - 1];
  if (!ship) return null;
  const cells = shipCells(ship);
  if (!cells.every((c) => shots[idx(c.x, c.y)] === 2)) return null;
  return ship;
}

export function applyShot(game, playerId, { x, y }) {
  if (game.phase !== "shot") return { ok: false, error: "現在不能開火" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  const px = Number(x);
  const py = Number(y);
  if (!inBoard(px, py)) return { ok: false, error: "超出海域" };
  const foe = game.seats[1 - game.turn];
  const mine = game.boards[playerId];
  const theirs = game.boards[foe.playerId];
  const i = idx(px, py);
  if (mine.shots[i]) return { ok: false, error: "這裡打過了" };
  const hit = theirs.grid[i] ? 2 : 1;
  mine.shots[i] = hit;
  const sunk = hit === 2 ? sunkShip(theirs, mine.shots, px, py) : null;
  game.lastShot = {
    x: px,
    y: py,
    hit: hit === 2,
    by: playerId,
    byName: seat.name,
    sunk: sunk ? { id: sunk.id, name: sunk.name, len: sunk.len } : null,
  };
  if (hit === 2 && allSunk(theirs.grid, mine.shots)) {
    game.phase = "ended";
    game.winner = { playerId, name: seat.name };
    return { ok: true, hit: true, sunk: game.lastShot.sunk, win: true };
  }
  if (hit !== 2) game.turn = 1 - game.turn;
  game.shotEndsAt = Date.now() + SHOT_MS;
  return { ok: true, hit: hit === 2, sunk: game.lastShot.sunk, win: false };
}

function allSunk(grid, shots) {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] && shots[i] !== 2) return false;
  }
  return true;
}

export function pickAiShot(game, playerId) {
  const shots = game.boards[playerId].shots;
  const empties = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!shots[idx(x, y)]) empties.push({ x, y });
    }
  }
  return empties[Math.floor(Math.random() * empties.length)] || { x: 0, y: 0 };
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const foe = game.seats.find((s) => s.playerId !== viewerId);
  const mine = you ? game.boards[you.playerId] : null;
  const theirs = foe ? game.boards[foe.playerId] : null;
  const yourTurn = game.phase === "shot" && game.seats[game.turn]?.playerId === viewerId;
  return {
    kind: "battleship",
    phase: game.phase,
    size: SIZE,
    ships: SHIPS,
    yourTurn,
    youReady: Boolean(mine?.ready),
    foeReady: Boolean(theirs?.ready),
    placeEndsAt: game.placeEndsAt,
    shotEndsAt: game.shotEndsAt,
    lastShot: game.lastShot,
    winner: game.winner,
    own: mine
      ? {
          grid: mine.grid.slice(),
          shots: mine.shots.slice(),
          ships: (mine.ships || []).map((s) => ({ ...s })),
        }
      : null,
    foeShots: theirs ? theirs.shots.slice() : emptyGrid(),
    seats: game.seats.map((s, i) => ({
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
      active: game.phase === "shot" && i === game.turn,
    })),
  };
}
