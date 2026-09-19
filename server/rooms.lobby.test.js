import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseColor,
  createRoom,
  joinRoom,
  lobbyView,
  setReady,
  startGame,
} from "./rooms.js";

function hostRoom() {
  return createRoom({ playerId: "h", nickname: "甲", socketId: "s1" });
}

describe("lobby color pick", () => {
  it("does not auto-seat the first player as yellow", () => {
    const room = hostRoom();
    assert.equal(room.players[0].color, null);
    const view = lobbyView(room, "h");
    assert.equal(view.yourColor, null);
    assert.equal(view.seats.every((s) => s.empty), true);
  });

  it("lets the first joiner claim red or blue", () => {
    const room = hostRoom();
    const red = chooseColor(room, "h", "red");
    assert.equal(red.ok, true);
    assert.equal(room.players[0].color, "red");
    const blue = chooseColor(room, "h", "blue");
    assert.equal(blue.ok, true);
    assert.equal(room.players[0].color, "blue");
  });

  it("blocks a taken animal and restores color on rejoin", () => {
    const room = hostRoom();
    chooseColor(room, "h", "red");
    const joined = joinRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    assert.equal(joined.ok, true);
    assert.equal(joined.player.color, null);
    const steal = chooseColor(room, "g", "red");
    assert.equal(steal.ok, false);
    const dog = chooseColor(room, "g", "blue");
    assert.equal(dog.ok, true);
    const again = joinRoom(room, { playerId: "g", nickname: "乙", socketId: "s3" });
    assert.equal(again.rejoin, true);
    assert.equal(again.player.color, "blue");
  });

  it("fills leftover seats with AI after humans pick", () => {
    const room = hostRoom();
    chooseColor(room, "h", "blue");
    setReady(room, "h", true);
    const started = startGame(room);
    assert.equal(started.ok, true);
    const colors = room.players.map((p) => p.color).sort();
    assert.deepEqual(colors, ["blue", "green", "red", "yellow"]);
    const host = room.players.find((p) => p.playerId === "h");
    assert.equal(host.color, "blue");
    assert.equal(host.type, "human");
  });
});
