import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyMove, createGame, pickAiMove, winnerOf } from "./guosanguan.js";
import * as gomoku from "./gomoku.js";
import * as othello from "./othello.js";
import * as go from "./go.js";
import { matchGuess, pickWord } from "./drawguess.js";

const two = (a = "h", b = "g") => [
  { playerId: a, name: "甲", type: "human", side: 1 },
  { playerId: b, name: "乙", type: "human", side: 2 },
];

describe("過三關", () => {
  it("vanishes the oldest mark on the 5th placement, then checks win", () => {
    const g = createGame(two());
    for (const i of [0, 3, 1, 4]) assert.equal(applyMove(g, g.turn, i).ok, true);
    assert.equal(g.order.length, 4);
    assert.deepEqual(g.cells.slice(0, 5), [1, 1, 0, 2, 2]);
    const fifth = applyMove(g, 1, 8);
    assert.equal(fifth.ok, true);
    assert.equal(fifth.vanished, 0);
    assert.equal(g.cells[0], 0);
    assert.equal(g.cells[8], 1);
    assert.equal(g.order.length, 4);
    assert.equal(winnerOf(g.cells), 0);
  });

  it("wins on three in a row before vanishing the oldest", () => {
    const g = createGame(two());
    applyMove(g, 1, 0);
    applyMove(g, 2, 3);
    applyMove(g, 1, 1);
    applyMove(g, 2, 4);
    const win = applyMove(g, 1, 2);
    assert.equal(win.ok, true);
    assert.equal(g.phase, "ended");
    assert.equal(g.winner, 1);
    assert.deepEqual(g.cells.slice(0, 5), [1, 1, 1, 2, 2]);
  });

  it("AI takes a winning line", () => {
    const g = createGame(two());
    g.cells = [1, 1, 0, 2, 2, 0, 0, 0, 0];
    g.order = [0, 3, 1, 4];
    g.turn = 1;
    assert.equal(pickAiMove(g), 2);
  });
});

describe("五子棋", () => {
  it("detects a horizontal five", () => {
    const g = gomoku.createGame(two());
    for (let x = 0; x < 4; x++) {
      assert.equal(gomoku.applyMove(g, 1, { x, y: 7 }).ok, true);
      assert.equal(gomoku.applyMove(g, 2, { x, y: 8 }).ok, true);
    }
    const win = gomoku.applyMove(g, 1, { x: 4, y: 7 });
    assert.equal(win.ok, true);
    assert.equal(g.phase, "ended");
    assert.equal(g.winner, 1);
  });

  it("rejects occupied intersections", () => {
    const g = gomoku.createGame(two());
    gomoku.applyMove(g, 1, { x: 7, y: 7 });
    assert.equal(gomoku.applyMove(g, 2, { x: 7, y: 7 }).ok, false);
  });
});

describe("黑白棋", () => {
  it("starts with the standard four discs and lets black take e6", () => {
    const g = othello.createGame(two());
    assert.equal(g.cells[othello.idx(3, 3)], 2);
    assert.equal(g.cells[othello.idx(4, 4)], 2);
    const move = othello.applyMove(g, 1, { x: 5, y: 4 });
    assert.equal(move.ok, true);
    assert.equal(g.cells[othello.idx(4, 4)], 1);
  });

  it("passes when no legal move remains for that side", () => {
    const g = othello.createGame(two());
    g.cells = Array(64).fill(1);
    g.cells[63] = 0;
    g.turn = 2;
    const pass = othello.applyMove(g, 2, { pass: true });
    assert.equal(pass.ok, true);
  });
});

describe("圍棋 9×9", () => {
  it("captures a stone with no liberties", () => {
    const g = go.createGame(two());
    go.applyMove(g, 1, { x: 1, y: 0 });
    go.applyMove(g, 2, { x: 0, y: 0 });
    go.applyMove(g, 1, { x: 0, y: 1 });
    assert.equal(g.cells[go.idx(0, 0)], 0);
    assert.equal(g.captures[1], 1);
  });

  it("forbids suicide", () => {
    const g = go.createGame(two());
    go.applyMove(g, 1, { x: 1, y: 0 });
    go.applyMove(g, 2, { x: 8, y: 8 });
    go.applyMove(g, 1, { x: 0, y: 1 });
    const bad = go.applyMove(g, 2, { x: 0, y: 0 });
    assert.equal(bad.ok, false);
  });

  it("two passes end the game with a score", () => {
    const g = go.createGame(two());
    go.applyMove(g, 1, { x: 0, y: 0 });
    go.applyMove(g, 2, { pass: true });
    go.applyMove(g, 1, { pass: true });
    assert.equal(g.phase, "ended");
    assert.ok(g.score);
    assert.equal(g.score.winner, 1);
  });

  it("blocks immediate ko recapture", () => {
    const g = go.createGame(two());
    const set = (x, y, c) => {
      g.cells[go.idx(x, y)] = c;
    };
    set(1, 0, 1);
    set(2, 0, 2);
    set(0, 1, 1);
    set(1, 1, 2);
    set(3, 1, 2);
    set(1, 2, 1);
    set(2, 2, 2);
    g.turn = 1;
    const cap = go.applyMove(g, 1, { x: 2, y: 1 });
    assert.equal(cap.ok, true);
    assert.equal(g.cells[go.idx(1, 1)], 0);
    const recap = go.applyMove(g, 2, { x: 1, y: 1 });
    assert.equal(recap.ok, false);
  });
});

describe("猜猜畫畫 words", () => {
  it("matches guesses ignoring whitespace", () => {
    assert.equal(matchGuess("雨傘", "雨傘"), true);
    assert.equal(matchGuess("雨傘", " 雨 傘 "), true);
    assert.equal(matchGuess("雨傘", "傘"), false);
    const w = pickWord(new Set());
    assert.equal(typeof w, "string");
    assert.ok(w.length);
  });
});
