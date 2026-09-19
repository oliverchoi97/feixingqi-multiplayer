import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAT_MAX, sanitizeChat, takeChat } from "./chat.js";

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
});
