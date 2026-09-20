import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)));

async function htmlFiles(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

describe("site BGM", () => {
  it("is wired on the home page and every game", async () => {
    const files = await htmlFiles(publicDir);
    const rel = files.map((f) => path.relative(publicDir, f)).sort();
    assert.deepEqual(rel, [
      "drawguess/index.html",
      "feixingqi/index.html",
      "go/index.html",
      "gomoku/index.html",
      "guosanguan/index.html",
      "index.html",
      "minesweeper/index.html",
      "othello/index.html",
    ]);
    for (const f of files) {
      const html = await readFile(f, "utf8");
      assert.match(html, /href="\/css\/bgm\.css"/, f);
      assert.match(html, /src="\/js\/bgm\.js"/, f);
    }
  });
});
