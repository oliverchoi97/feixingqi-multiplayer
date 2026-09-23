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

  it("lets both humans set a secret then guess each other once per turn", () => {
    const g = oneatwob.createGame(two(), null);
    assert.equal(g.phase, "set");
    assert.equal(oneatwob.applySecret(g, "h", { secret: "9876" }).ok, true);
    assert.equal(g.phase, "set");
    assert.equal(oneatwob.applySecret(g, "g", { secret: "1234" }).ok, true);
    assert.equal(g.phase, "playing");
    assert.equal(g.turn, 0);
    const miss = oneatwob.applyGuess(g, "h", "1356");
    assert.equal(miss.ok, true);
    assert.equal(miss.win, false);
    assert.equal(miss.targetId, "g");
    assert.equal(g.turn, 1);
    assert.equal(oneatwob.applyGuess(g, "h", "1234").ok, false);
    const reply = oneatwob.applyGuess(g, "g", "1357");
    assert.equal(reply.ok, true);
    assert.equal(reply.targetId, "h");
    assert.equal(g.turn, 0);
    const win = oneatwob.applyGuess(g, "h", "1234");
    assert.equal(win.ok, true);
    assert.equal(win.win, true);
    assert.equal(g.winner.playerId, "h");
  });
});

describe("battleship", () => {
  it("keeps the turn after hits, switches only on a miss, and reports a sunk ship", () => {
    const g = battleship.createGame(two());
    assert.equal(g.phase, "place");
    assert.equal(battleship.SHIPS.length, 6);
    assert.equal(battleship.SHIPS.filter((s) => s.len === 2).length, 2);
    const fleet = [
      { x: 0, y: 0, horiz: true },
      { x: 0, y: 1, horiz: true },
      { x: 0, y: 2, horiz: true },
      { x: 0, y: 3, horiz: true },
      { x: 0, y: 4, horiz: true },
      { x: 0, y: 5, horiz: true },
    ];
    assert.equal(battleship.applyPlace(g, "h", fleet).ok, true);
    assert.equal(battleship.applyPlace(g, "g", fleet).ok, true);
    assert.equal(g.phase, "shot");
    const first = battleship.applyShot(g, "h", { x: 0, y: 0 });
    assert.equal(first.ok, true);
    assert.equal(first.hit, true);
    assert.equal(g.seats[g.turn].playerId, "h");
    const second = battleship.applyShot(g, "h", { x: 1, y: 0 });
    assert.equal(second.ok, true);
    assert.equal(second.hit, true);
    assert.equal(g.seats[g.turn].playerId, "h");
    const missShot = battleship.applyShot(g, "h", { x: 9, y: 9 });
    assert.equal(missShot.ok, true);
    assert.equal(missShot.hit, false);
    assert.equal(g.seats[g.turn].playerId, "g");
    assert.equal(battleship.applyShot(g, "h", { x: 2, y: 0 }).ok, false);
    battleship.applyShot(g, "g", { x: 8, y: 9 });
    assert.equal(g.seats[g.turn].playerId, "h");
    const cells = [];
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < battleship.SHIPS[y].len; x++) {
        if (y === 0 && x < 2) continue;
        cells.push({ x, y });
      }
    }
    let last;
    let miss = 0;
    for (const cell of cells) {
      if (g.phase === "ended") break;
      if (g.seats[g.turn].playerId !== "h") {
        battleship.applyShot(g, "g", { x: miss % 8, y: 8 - Math.floor(miss / 8) });
        miss += 1;
      }
      last = battleship.applyShot(g, "h", cell);
    }
    assert.equal(g.phase, "ended");
    assert.equal(last.win, true);
    assert.ok(last.sunk);
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

  it("lets the current player pick a specific card and shows the probe to the victim", () => {
    const seats = two();
    const g = oldmaid.createGame(seats, () => 0.2);
    const turnId = g.seats[g.turn].playerId;
    const left = oldmaid.leftPlayer(g, g.turn);
    const before = g.hands[left.playerId].length;
    assert.ok(before > 0);
    const pick = Math.min(1, before - 1);
    assert.equal(oldmaid.setProbe(g, turnId, pick).probed, true);
    assert.equal(g.probe.index, pick);
    assert.equal(g.probe.fromId, left.playerId);
    const victim = oldmaid.publicView(g, left.playerId);
    assert.equal(victim.probe.index, pick);
    assert.equal(victim.target.you, true);
    const drawn = oldmaid.drawFrom(g, turnId, pick);
    assert.equal(drawn.ok, true);
    assert.equal(g.hands[left.playerId].length, before - 1);
    assert.equal(g.probe, null);
  });
});
