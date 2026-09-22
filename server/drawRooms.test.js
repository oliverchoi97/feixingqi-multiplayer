import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCustomWord,
  chooseDrawWord,
  createDrawRoom,
  drawLobbyView,
  joinDrawRoom,
  passDrawWord,
  startDrawGame,
} from "./drawRooms.js";

describe("draw rooms", () => {
  it("lets the host start with two connected players even if they are not ready", () => {
    const room = createDrawRoom({ playerId: "h", nickname: "甲", socketId: "s1" });
    joinDrawRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    const lobby = drawLobbyView(room, "h");
    assert.equal(lobby.canStart, true);
    assert.equal(lobby.players.length, 2);
    const started = startDrawGame(room);
    assert.equal(started.ok, true);
    assert.equal(room.game.phase, "choose");
    assert.equal(room.game.choices.length, 3);
  });

  it("lets the drawer pass and pick, and keeps custom words in the session bank", () => {
    const room = createDrawRoom({ playerId: "h", nickname: "甲", socketId: "s1" });
    joinDrawRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    startDrawGame(room);
    const added = addCustomWord(room, "菠蘿油");
    assert.equal(added.ok, true);
    assert.equal(room.game.choices[0], "菠蘿油");
    const pass = passDrawWord(room, "h");
    assert.equal(pass.ok, true);
    assert.equal(room.game.phase, "choose");
    const word = room.game.choices[0];
    const pick = chooseDrawWord(room, "h", word);
    assert.equal(pick.ok, true);
    assert.equal(room.game.phase, "drawing");
    assert.equal(room.game.word, word);
  });
});
