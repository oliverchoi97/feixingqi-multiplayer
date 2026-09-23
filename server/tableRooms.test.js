import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTableRoom,
  endTableMatch,
  handleTableMove,
  isTableAiTurn,
  joinTableRoom,
  setTableReady,
  startTableGame,
  tableGameView,
  tableLobbyView,
} from "./tableRooms.js";

describe("table rooms", () => {
  it("lets one human start vs AI and abort back to lobby", () => {
    const room = createTableRoom("gomoku", { playerId: "h", nickname: "甲", socketId: "s1" });
    assert.equal(tableLobbyView(room, "h").phase, "lobby");
    const started = startTableGame(room);
    assert.equal(started.ok, true);
    assert.equal(room.players.filter((p) => p.type === "ai").length, 1);
    assert.equal(room.game.seats.find((s) => s.side === 1).type, "human");
    assert.equal(isTableAiTurn(room), false);
    const view = tableGameView(room, "h");
    assert.equal(view.yourTurn, true);
    assert.equal(view.yourSide, 1);
    room.players[0].connected = false;
    assert.equal(isTableAiTurn(room), false);
    const move = handleTableMove(room, "h", { x: 7, y: 7 });
    assert.equal(move.ok, true);
    endTableMatch(room);
    assert.equal(room.game, null);
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].ready, false);
  });

  it("blocks a third human and keeps join-order sides", () => {
    const room = createTableRoom("othello", { playerId: "h", nickname: "甲", socketId: "s1" });
    joinTableRoom(room, { playerId: "g", nickname: "乙", socketId: "s2" });
    const full = joinTableRoom(room, { playerId: "z", nickname: "丙", socketId: "s3" });
    assert.equal(full.ok, false);
    setTableReady(room, "h", true);
    setTableReady(room, "g", true);
    startTableGame(room);
    assert.equal(room.players[0].side, 1);
    assert.equal(room.players[1].side, 2);
  });
});
