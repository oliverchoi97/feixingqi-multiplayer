import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPartyRoom,
  handlePartyMove,
  joinPartyRoom,
  partyLobbyView,
  startPartyGame,
} from "./partyRooms.js";

describe("party rooms", () => {
  it("lists a joiner on the host lobby view immediately", () => {
    const room = createPartyRoom("oneatwob", { playerId: "h", nickname: "甲", socketId: "s1" });
    joinPartyRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    const view = partyLobbyView(room, "h");
    assert.equal(view.players.length, 2);
    assert.equal(view.canStart, true);
    assert.ok(view.players.some((p) => p.name === "乙"));
  });

  it("lets two humans each set a secret then take turns guessing", () => {
    const room = createPartyRoom("oneatwob", { playerId: "h", nickname: "甲", socketId: "s1" });
    joinPartyRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    assert.equal(startPartyGame(room).ok, true);
    assert.equal(room.game.phase, "set");
    assert.equal(handlePartyMove(room, "h", { secret: "1234" }).ok, true);
    assert.equal(room.game.phase, "set");
    assert.equal(handlePartyMove(room, "g", { secret: "5678" }).ok, true);
    assert.equal(room.game.phase, "playing");
    const guess = handlePartyMove(room, "h", { guess: "5609" });
    assert.equal(guess.ok, true);
    assert.equal(guess.a, 2);
    assert.equal(guess.b, 0);
    assert.equal(guess.targetId, "g");
  });

  it("fills old maid to four seats with AI, and never fills 冚棉胎", () => {
    const maid = createPartyRoom("oldmaid", { playerId: "h", nickname: "甲", socketId: "s1" });
    assert.equal(startPartyGame(maid).ok, true);
    assert.equal(maid.players.filter((p) => p.type === "ai").length, 3);
    assert.equal(maid.players.length, 4);

    const slap = createPartyRoom("hammintoi", { playerId: "h", nickname: "甲", socketId: "s1" });
    assert.equal(startPartyGame(slap).ok, false);
    joinPartyRoom(slap, { playerId: "g", nickname: "乙", socketId: "s2" });
    assert.equal(startPartyGame(slap).ok, true);
    assert.equal(slap.players.every((p) => p.type === "human"), true);
  });
});
