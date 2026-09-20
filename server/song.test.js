import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { searchYouTubeVideo } from "./song.js";

describe("YouTube search", () => {
  it("refuses to search without an API key", async () => {
    const result = await searchYouTubeVideo("晴天", { key: "", fetchImpl: async () => {
      throw new Error("should not fetch");
    } });
    assert.equal(result.ok, false);
    assert.equal(result.error, "插歌未設定 API key");
  });

  it("returns the first embeddable video id", async () => {
    const result = await searchYouTubeVideo("周杰倫 晴天", {
      key: "test-key",
      fetchImpl: async (url) => {
        assert.match(String(url), /googleapis\.com\/youtube\/v3\/search/);
        assert.match(String(url), /videoEmbeddable=true/);
        return {
          ok: true,
          json: async () => ({
            items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Jay Chou &#39;晴天&#39;" } }],
          }),
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.videoId, "abcdefghijk");
    assert.equal(result.title, "Jay Chou '晴天'");
  });

  it("says not found when the API returns no videos", async () => {
    const result = await searchYouTubeVideo("zzz", {
      key: "test-key",
      fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "找不到這首歌");
  });
});
