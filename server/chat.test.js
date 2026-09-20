import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAT_MAX, sanitizeChat, takeChat, appendRoomChat, clearRoomChat, publicChatLog, CHAT_LOG_MAX } from "./chat.js";

describe("chat", () => {
  it("trims, collapses space, and caps length", () => {
    assert.equal(sanitizeChat("  你好   世界  "), "你好 世界");
    assert.equal(sanitizeChat("a".repeat(80)).length, CHAT_MAX);
    assert.equal(sanitizeChat("\n\thi\t"), "hi");
  });

  it("rate-limits a sender", () => {
    const gate = {};
    const a = takeChat(gate, "第一句", 1000);
    const b = takeChat(gate, "太快了", 1400);
    const c = takeChat(gate, "可以了", 1900);
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.equal(c.ok, true);
    assert.equal(c.text, "可以了");
  });

  it("keeps a capped in-memory match log and clears it", () => {
    const room = { game: { phase: "playing" }, chatLog: [] };
    assert.equal(appendRoomChat({ chatLog: [] }, { text: "大廳" }), null);
    for (let i = 0; i < CHAT_LOG_MAX + 10; i++) {
      appendRoomChat(room, { nickname: "甲", text: `第${i}`, playerId: "p", at: i });
    }
    assert.equal(room.chatLog.length, CHAT_LOG_MAX);
    assert.equal(room.chatLog[0].text, "第10");
    assert.equal(publicChatLog(room).at(-1).text, `第${CHAT_LOG_MAX + 9}`);
    clearRoomChat(room);
    assert.deepEqual(publicChatLog(room), []);
  });
});
