import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

describe("飛行棋 turn HUD layout", () => {
  it("keeps the turn bar outside the board stack", async () => {
    const html = await readFile(path.join(dir, "feixingqi/index.html"), "utf8");
    const game = html.slice(html.indexOf('id="screen-game"'), html.indexOf('id="modal"'));
    assert.match(game, /id="board-hud"[^>]*class="game-turnbar"/);
    assert.match(game, /class="board-wrap"/);
    const hudAt = game.indexOf('id="board-hud"');
    const wrapAt = game.indexOf('class="board-wrap"');
    const wrapEnd = game.indexOf("</div>", game.indexOf('id="center-dice"'));
    assert.ok(hudAt > 0 && wrapAt > hudAt, "turn bar must be a sibling before the board");
    assert.ok(hudAt < wrapAt || hudAt > wrapEnd, "turn bar must not sit inside .board-wrap");
    assert.doesNotMatch(game, /class="board-col"/);
    assert.doesNotMatch(game, /class="board-hud"/);
  });

  it("does not absolutely position the turn bar over the board", async () => {
    const css = await readFile(path.join(dir, "css/style.css"), "utf8");
    const turn = css.slice(css.indexOf(".game-turnbar {"), css.indexOf(".game-turnbar:empty"));
    assert.match(turn, /grid-area:\s*turn/);
    assert.doesNotMatch(turn, /position:\s*(absolute|fixed|sticky)/);
    assert.match(css, /grid-template-areas:[\s\S]*"turn turn"[\s\S]*"panel board"/);
    assert.match(css, /grid-template-areas:[\s\S]*"turn"[\s\S]*"board"[\s\S]*"panel"/);
    assert.doesNotMatch(css, /\.board-hud\s*\{/);
    const wrap = css.slice(css.indexOf(".board-wrap {"), css.indexOf(".board-art,"));
    assert.match(wrap, /grid-area:\s*board/);
    assert.doesNotMatch(wrap, /#board-hud|game-turnbar/);
  });
});
