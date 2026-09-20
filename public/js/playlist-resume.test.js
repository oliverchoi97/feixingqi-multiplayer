import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePlaylistResumeIndex } from "./playlist-resume.js";

describe("playlist resume after /song", () => {
  it("keeps the interrupted index instead of restarting at 0", () => {
    assert.equal(resolvePlaylistResumeIndex(7, "", []), 7);
    assert.equal(resolvePlaylistResumeIndex(7, "laterVid", ["a", "b", "c"]), 2);
    assert.equal(resolvePlaylistResumeIndex(0, "b", ["a", "b", "c"]), 1);
  });

  it("matches a saved videoId even if the numeric index drifted", () => {
    assert.equal(resolvePlaylistResumeIndex(0, "ccc", ["aaa", "bbb", "ccc"]), 2);
    assert.equal(resolvePlaylistResumeIndex(99, "missing", ["a", "b"]), 1);
  });
});
