import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMinesRoom,
  handleDisconnect,
  handleReveal,
  joinMinesRoom,
  minesGameView,
  setMinesReady,
  startMinesGame,
} from "./minesRooms.js";

function twoSeats() {
  const room = createMinesRoom({
    playerId: "p1",
    nickname: "甲",
    socketId: "s1",
  });
  const joined = joinMinesRoom(room, {
    playerId: "p2",
    nickname: "乙",
    socketId: "s2",
  });
  assert.equal(joined.ok, true);
  setMinesReady(room, "p1", true);
  setMinesReady(room, "p2", true);
  const started = startMinesGame(room);
  assert.equal(started.ok, true);
  return room;
}

describe("mines race rooms", () => {
  it("rejects a third player and has no AI seats", () => {
    const room = createMinesRoom({ playerId: "a", nickname: "A", socketId: "1" });
    assert.equal(joinMinesRoom(room, { playerId: "b", nickname: "B", socketId: "2" }).ok, true);
    const third = joinMinesRoom(room, { playerId: "c", nickname: "C", socketId: "3" });
    assert.equal(third.ok, false);
    assert.match(third.error, /最多 2/);
    assert.equal(room.players.every((p) => !p.type || p.type !== "ai"), true);
  });

  it("gives both players identical expert boards", () => {
    const room = twoSeats();
    assert.equal(room.game.preset, "C");
    const a = room.game.boards.p1;
    const b = room.game.boards.p2;
    assert.equal(a.cols, 30);
    assert.equal(a.rows, 16);
    assert.equal(a.mines, 99);
    assert.deepEqual([...a.mine], [...b.mine]);
    assert.notEqual(a.revealed, b.revealed);
  });

  it("awards the opponent when a player hits a mine", () => {
    const room = twoSeats();
    const mine = [...room.game.boards.p1.mine].findIndex((m) => m);
    const result = handleReveal(room, "p1", mine);
    assert.equal(result.hit, true);
    assert.equal(room.game.phase, "ended");
    assert.equal(room.game.winnerId, "p2");
    assert.equal(room.game.reason, "mine");
  });

  it("awards clear to the first player who opens every safe cell", () => {
    const room = twoSeats();
    const board = room.game.boards.p1;
    let last = null;
    for (let i = 0; i < board.n; i++) {
      if (!board.mine[i] && !board.revealed[i]) last = handleReveal(room, "p1", i);
    }
    assert.equal(last.won, true);
    assert.equal(room.game.phase, "ended");
    assert.equal(room.game.winnerId, "p1");
    assert.equal(room.game.reason, "clear");
    const view = minesGameView(room, "p2");
    assert.equal(view.winnerId, "p1");
    assert.equal(view.you.revealedSafe, 0);
  });

  it("treats a mid-game disconnect as a forfeit", () => {
    const room = twoSeats();
    handleDisconnect(room, "p2");
    assert.equal(room.game.phase, "ended");
    assert.equal(room.game.winnerId, "p1");
    assert.equal(room.game.reason, "disconnect");
  });
});
