import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowHumanRoll,
  animationMs,
  chooseColor,
  createRoom,
  handleMove,
  handleRoll,
  setReady,
  startGame,
} from "./rooms.js";

function yellowHost(rng) {
  const room = createRoom({ playerId: "h", nickname: "甲", socketId: "s1" });
  chooseColor(room, "h", "yellow");
  setReady(room, "h", true);
  startGame(room);
  if (rng) room.game.rng = rng;
  return room;
}

describe("extra-turn roll after takeoff", () => {
  it("takeoff animationMs outlasts the client hop, so busy must not drop the next roll", () => {
    assert.ok(animationMs({ path: [{ kind: "takeoff" }] }) > 320);
  });

  it("allows a 6 takeoff extra turn even while the move animation is still busy", () => {
    const room = yellowHost(() => 0.99);
    const first = handleRoll(room, "h");
    assert.equal(first.ok, true);
    assert.equal(first.roll, 6);
    const takeoff = handleMove(room, "h", 0);
    assert.equal(takeoff.ok, true);
    assert.equal(takeoff.extraTurn, true);
    assert.equal(takeoff.sim.path[0].kind, "takeoff");
    assert.equal(room.game.action, "roll");

    room.busy = true;
    assert.equal(allowHumanRoll(room), true);

    const second = handleRoll(room, "h");
    assert.equal(second.ok, true);
    assert.ok(second.roll >= 1 && second.roll <= 6);
    assert.equal(room.game.lastRoll, second.roll);
  });

  it("rejects a roll while selecting a piece and tells the client to wait if busy", () => {
    const room = yellowHost(() => 0.99);
    handleRoll(room, "h");
    assert.equal(room.game.action, "select");
    room.busy = true;
    assert.equal(allowHumanRoll(room), false);
    const blocked = handleRoll(room, "h");
    assert.equal(blocked.ok, false);
    assert.equal(blocked.error, "請等棋子走完再擲");
  });
});
