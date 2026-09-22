import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as oneatwob from "./oneatwob.js";
import * as battleship from "./battleship.js";
import * as hammintoi from "./hammintoi.js";
import * as oldmaid from "./oldmaid.js";

const two = () => [
  { playerId: "h", name: "甲", type: "human" },
  { playerId: "g", name: "乙", type: "human" },
];

describe("1A2B", () => {
  it("scores bulls and cows", () => {
    assert.deepEqual(oneatwob.scoreGuess("1234", "1356"), { a: 1, b: 1 });
    assert.deepEqual(oneatwob.scoreGuess("1234", "1234"), { a: 4, b: 0 });
  });

  it("lets the setter lock a secret then others guess", () => {
    const g = oneatwob.createGame(two(), null);
    assert.equal(g.phase, "set");
    assert.equal(oneatwob.applySecret(g, "h", { secret: "9876" }).ok, true);
    assert.equal(g.phase, "playing");
    assert.equal(oneatwob.applyGuess(g, "h", "1234").ok, false);
    const miss = oneatwob.applyGuess(g, "g", "1234");
    assert.equal(miss.ok, true);
    assert.equal(miss.win, false);
    const win = oneatwob.applyGuess(g, "g", "9876");
    assert.equal(win.ok, true);
    assert.equal(win.win, true);
  });
});

describe("battleship", () => {
  it("sinks the fleet when every ship cell is hit", () => {
    const g = battleship.createGame(two());
    assert.equal(g.phase, "place");
    assert.equal(battleship.PLACE_MS, 60_000);
    assert.equal(battleship.SHOT_MS, 30_000);
    const fleet = [
      { x: 0, y: 0, horiz: true },
      { x: 0, y: 1, horiz: true },
      { x: 0, y: 2, horiz: true },
      { x: 0, y: 3, horiz: true },
      { x: 0, y: 4, horiz: true },
    ];
    assert.equal(battleship.applyPlace(g, "h", fleet).ok, true);
    assert.equal(battleship.applyPlace(g, "g", fleet).ok, true);
    assert.equal(g.phase, "shot");
    const cells = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < (y === 4 ? 2 : y === 1 ? 4 : y === 0 ? 5 : 3); x++) {
        cells.push({ x, y });
      }
    }
    let last;
    let miss = 0;
    for (const cell of cells) {
      if (g.phase === "ended") break;
      if (g.seats[g.turn].playerId !== "h") {
        battleship.applyShot(g, "g", { x: miss % 10, y: 9 - Math.floor(miss / 10) });
        miss += 1;
      }
      last = battleship.applyShot(g, "h", cell);
    }
    assert.equal(g.phase, "ended");
    assert.equal(last.win, true);
    assert.equal(g.winner.playerId, "h");
  });
});

describe("冚棉胎", () => {
  it("opens a slap window on consecutive ranks", () => {
    const g = hammintoi.createGame(two(), () => 0.1);
    const first = hammintoi.playCard(g, g.seats[g.turn].playerId);
    assert.equal(first.ok, true);
    g.hands[g.seats[g.turn].playerId][0].rank = g.pile[0].rank;
    const pair = hammintoi.playCard(g, g.seats[g.turn].playerId);
    assert.equal(pair.match, true);
    assert.ok(g.slap);
  });
});

describe("抽烏龜", () => {
  it("removes the old maid and discards opening pairs", () => {
    const seats = [
      ...two(),
      { playerId: "c", name: "丙", type: "ai" },
      { playerId: "d", name: "丁", type: "ai" },
    ];
    const g = oldmaid.createGame(seats, () => 0.4);
    const total = seats.reduce((n, s) => n + g.hands[s.playerId].length, 0);
    assert.equal(total % 2, 1);
    assert.ok(g.maidId.includes("Q"));
  });
});
