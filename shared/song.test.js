import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSongCommand, sanitizeSongQuery, takeSong, SONG_COOLDOWN_MS, SONG_QUERY_MAX } from "./song.js";

describe("song command", () => {
  it("parses /song with optional space and strips tags", () => {
    assert.equal(parseSongCommand("hello").isSong, false);
    assert.deepEqual(parseSongCommand("/song 周杰倫 晴天").query, "周杰倫 晴天");
    assert.equal(parseSongCommand("/song周杰倫+晴天").query, "周杰倫+晴天");
    assert.equal(parseSongCommand("/SONG  artist   song").query, "artist song");
    assert.equal(sanitizeSongQuery("<b>hi</b>").includes("<"), false);
    assert.equal(sanitizeSongQuery("a".repeat(90)).length, SONG_QUERY_MAX);
    assert.equal(parseSongCommand("/song").ok, false);
    assert.equal(parseSongCommand("/song   ").error, "請輸入歌名，例如 /song 周杰倫 晴天");
  });

  it("rate-limits a player or room", () => {
    const player = {};
    const room = {};
    const a = takeSong([player, room], "/song 晴天", 1000);
    const b = takeSong([player, room], "/song 稻香", 1000 + SONG_COOLDOWN_MS - 1);
    const c = takeSong([player, room], "/song 稻香", 1000 + SONG_COOLDOWN_MS);
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.match(b.error, /頻繁/);
    assert.equal(c.ok, true);
    assert.equal(c.query, "稻香");
  });
});
