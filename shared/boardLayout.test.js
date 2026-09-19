import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boardLayout, cellCenter, hitCell } from "./boardLayout.js";

describe("board click mapping", () => {
  it("round-trips every othello square on a non-square canvas", () => {
    const layout = boardLayout("othello", 8, 390, 310);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = cellCenter(layout, x, y);
        assert.deepEqual(hitCell(layout, c.x, c.y), { x, y });
        assert.deepEqual(hitCell(layout, c.x + layout.cell * 0.4, c.y - layout.cell * 0.4), { x, y });
      }
    }
  });

  it("round-trips gomoku and go intersections including edges", () => {
    for (const [kind, size, w, h] of [
      ["gomoku", 15, 640, 640],
      ["gomoku", 15, 375, 280],
      ["go", 9, 412.7, 390],
    ]) {
      const layout = boardLayout(kind, size, w, h);
      for (const [x, y] of [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
        [(size / 2) | 0, (size / 2) | 0],
      ]) {
        const c = cellCenter(layout, x, y);
        assert.deepEqual(hitCell(layout, c.x, c.y), { x, y }, `${kind} ${x},${y} on ${w}x${h}`);
      }
    }
  });
});
