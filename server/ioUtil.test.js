import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { broadcastViews, nspSocketMap } from "./ioUtil.js";

describe("broadcastViews", () => {
  it("emits to sockets in the adapter room and leftover stored ids", () => {
    const s1 = { id: "s1", data: { playerId: "h" } };
    const s2 = { id: "s2", data: { playerId: "g" } };
    const s3 = { id: "s3", data: { playerId: "z" } };
    const nsp = {
      sockets: new Map([
        ["s1", s1],
        ["s2", s2],
        ["s3", s3],
      ]),
      adapter: { rooms: new Map([["ABCD", new Set(["s1", "s2"])]]) },
    };
    assert.equal(nspSocketMap(nsp).get("s1"), s1);
    const seen = [];
    broadcastViews(
      nsp,
      {
        code: "ABCD",
        players: [
          { playerId: "h", socketId: "s1", type: "human" },
          { playerId: "g", socketId: "s2", type: "human" },
          { playerId: "z", socketId: "s3", type: "human" },
          { playerId: "ai-1", socketId: null, type: "ai" },
        ],
      },
      (sock, playerId) => seen.push(`${sock.id}:${playerId}`)
    );
    assert.deepEqual(seen.sort(), ["s1:h", "s2:g", "s3:z"]);
  });
});
