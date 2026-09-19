import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRESETS,
  cloneLayout,
  emptyBoard,
  generateLayout,
  mulberry32,
  neighbors,
  revealCell,
  safeCells,
  toggleFlag,
} from "./mines.js";

describe("minesweeper presets", () => {
  it("matches classic A/B/C sizes", () => {
    assert.deepEqual(PRESETS.A, { key: "A", nameZh: "初級", cols: 9, rows: 9, mines: 10 });
    assert.deepEqual(PRESETS.B, { key: "B", nameZh: "中級", cols: 16, rows: 16, mines: 40 });
    assert.deepEqual(PRESETS.C, { key: "C", nameZh: "高級", cols: 30, rows: 16, mines: 99 });
  });
});

describe("layout", () => {
  it("places the requested mine count", () => {
    const board = generateLayout(PRESETS.A, mulberry32(1));
    let mines = 0;
    for (const v of board.mine) mines += v;
    assert.equal(mines, 10);
    assert.equal(board.placed, true);
  });

  it("same seed yields identical expert boards", () => {
    const a = generateLayout(PRESETS.C, mulberry32(42));
    const b = generateLayout(PRESETS.C, mulberry32(42));
    assert.deepEqual([...a.mine], [...b.mine]);
    assert.deepEqual([...a.adj], [...b.adj]);
  });

  it("cloned layout shares mines but not reveal state", () => {
    const layout = generateLayout(PRESETS.A, mulberry32(7));
    const p1 = cloneLayout(layout);
    const p2 = cloneLayout(layout);
    const safe = [...p1.mine].findIndex((m) => !m);
    revealCell(p1, safe);
    assert.equal(p2.revealedSafe, 0);
    assert.deepEqual([...p1.mine], [...p2.mine]);
  });
});

describe("reveal", () => {
  it("keeps the first click safe when mines are deferred", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const board = emptyBoard(PRESETS.A);
      const rng = mulberry32(seed);
      const result = revealCell(board, 0, rng);
      assert.equal(result.ok, true);
      assert.equal(result.hit, false);
      assert.equal(board.mine[0], 0);
    }
  });

  it("floods through zero cells", () => {
    const board = emptyBoard({ cols: 3, rows: 3, mines: 1 });
    board.mine[0] = 1;
    board.placed = true;
    board.adj[1] = 1;
    board.adj[3] = 1;
    board.adj[4] = 1;
    const result = revealCell(board, 8);
    assert.equal(result.hit, false);
    assert.ok(result.opened.length >= 5);
    assert.equal(board.revealed[8], 1);
    assert.equal(board.revealed[0], 0);
  });

  it("hitting a mine loses", () => {
    const board = generateLayout(PRESETS.A, mulberry32(3));
    const mine = [...board.mine].findIndex((m) => m);
    const result = revealCell(board, mine);
    assert.equal(result.hit, true);
    assert.equal(board.alive, false);
    assert.equal(board.exploded, mine);
  });

  it("revealing every safe cell wins", () => {
    const board = generateLayout(PRESETS.A, () => 0.1);
    for (let i = 0; i < board.n; i++) {
      if (!board.mine[i] && !board.revealed[i]) revealCell(board, i);
    }
    assert.equal(board.won, true);
    assert.equal(board.revealedSafe, safeCells(PRESETS.A));
  });

  it("flags do not reveal", () => {
    const board = generateLayout(PRESETS.A, mulberry32(9));
    const i = 4;
    const flagged = toggleFlag(board, i);
    assert.equal(flagged.flagged, true);
    const boom = revealCell(board, i);
    assert.equal(boom.ok, false);
    toggleFlag(board, i);
    assert.equal(board.flagCount, 0);
  });

  it("neighbor helper stays in bounds", () => {
    assert.equal(neighbors(9, 9, 0).length, 3);
    assert.equal(neighbors(9, 9, 40).length, 8);
  });
});
