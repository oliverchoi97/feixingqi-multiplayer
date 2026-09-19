function page({ kind, path, kicker, title, lede, rule }) {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title} · Gaming In My Life</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=Noto+Serif+TC:wght@600;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/css/style.css" />
    <link rel="stylesheet" href="/css/portal.css" />
    <link rel="stylesheet" href="/css/danmaku.css" />
    <link rel="stylesheet" href="/css/boards.css" />
    <link rel="stylesheet" href="/css/session.css" />
  </head>
  <body data-kind="${kind}" data-path="${path}">
    <div id="toast" hidden></div>
    <section id="screen-home" class="screen">
      <div class="home-card">
        <nav class="site-nav" style="width:100%;margin:0 0 12px">
          <a href="/">遊戲選單</a>
          <a href="/feixingqi">飛行棋</a>
        </nav>
        <p class="eyebrow">${kicker}</p>
        <h1>${title}</h1>
        <p class="lede">${lede}</p>
        <label class="field"><span>暱稱</span><input id="nickname" maxlength="12" placeholder="怎麼稱呼你" autocomplete="nickname" /></label>
        <div class="home-actions">
          <button id="btn-create" class="btn primary" type="button">建立房間</button>
          <div class="join-row">
            <input id="join-code" maxlength="4" placeholder="房間代碼" autocomplete="off" spellcheck="false" />
            <button id="btn-join" class="btn" type="button">加入</button>
          </div>
        </div>
        <div class="session-strip">
          <button type="button" class="btn ghost" data-session="end">結束遊戲</button>
          <button type="button" class="btn ghost" data-session="menu">回到主選單</button>
        </div>
        <p class="hint">${rule}</p>
      </div>
    </section>
    <section id="screen-lobby" class="screen" hidden>
      <div class="lobby-card">
        <header class="lobby-head">
          <div>
            <p class="eyebrow">候機室</p>
            <h2>房間 <span id="lobby-code">----</span></h2>
          </div>
          <div class="lobby-share">
            <button id="btn-copy" class="btn ghost" type="button">複製連結</button>
            <button id="btn-leave" class="btn ghost" type="button">離開</button>
          </div>
        </header>
        <p class="lede tight" id="lobby-status">準備後開局。一人也可開，空位由電腦補上。</p>
        <div id="lobby-seats" class="seats"></div>
        <div class="lobby-actions">
          <button id="btn-ready" class="btn primary" type="button">準備</button>
          <button id="btn-start" class="btn" type="button" hidden>開始遊戲</button>
        </div>
        <div class="session-strip">
          <button type="button" class="btn ghost" data-session="end">結束遊戲</button>
          <button type="button" class="btn ghost" data-session="menu">回到主選單</button>
        </div>
      </div>
    </section>
    <section id="screen-play" class="screen table-screen" hidden>
      <div class="table-play">
        <aside class="panel">
          <div class="panel-top">
            <div>
              <p class="eyebrow">房間</p>
              <strong id="game-code" class="mono">----</strong>
            </div>
            <div id="turn-banner" class="turn-banner">開局</div>
          </div>
          <div id="player-list" class="player-list"></div>
          <button id="btn-pass" class="btn wide" type="button" hidden>虛手</button>
          <div class="session-strip">
            <button type="button" class="btn ghost" data-session="end">結束遊戲</button>
            <button type="button" class="btn ghost" data-session="menu">回到主選單</button>
          </div>
        </aside>
        <div>
          <div class="board-canvas-wrap">
            <canvas id="board" width="720" height="720"></canvas>
          </div>
          <div id="ttt" class="ttt-grid" hidden>
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<button type="button" class="ttt-cell" data-i="${i}"></button>`).join("")}
          </div>
        </div>
      </div>
    </section>
    <div id="winner-modal" class="modal" hidden>
      <div class="modal-card winner">
        <p class="eyebrow">結果</p>
        <h3 id="winner-title">完賽</h3>
        <p id="winner-detail" class="lede tight"></p>
        <button type="button" class="btn primary" data-session="end">回到候機室</button>
      </div>
    </div>
    <div id="danmaku-layer" class="danmaku-layer" aria-hidden="true"></div>
    <form id="chat-bar" class="chat-bar" hidden>
      <label for="chat-input">聊天</label>
      <input id="chat-input" maxlength="48" placeholder="彈幕…" autocomplete="off" />
      <button class="btn primary" type="submit">發送</button>
    </form>
    <script src="/socket.io/socket.io.js"></script>
    <script type="module" src="/js/table-client.js"></script>
  </body>
</html>`;
}

import { mkdir, writeFile } from "node:fs/promises";

const games = [
  {
    kind: "gomoku",
    path: "/gomoku",
    kicker: "連五子",
    title: "五子棋",
    lede: "15×15 無禁手，先連成五子者勝。可兩人連線，或一人對電腦。",
    rule: "黑先。直線、橫線或斜線連續五子即勝，沒有禁手。",
  },
  {
    kind: "othello",
    path: "/othello",
    kicker: "REVERSI",
    title: "黑白棋",
    lede: "經典 8×8 翻棋。夾住的對手棋子一律翻面。可兩人連線，或一人對電腦。",
    rule: "必須下在能翻對方子的位置。無子可下則虛手；雙方都無法下則比子數。",
  },
  {
    kind: "go",
    path: "/go",
    kicker: "9×9",
    title: "圍棋",
    lede: "九路盤，適合瀏覽器對局。提子、禁止自殺、簡單劫。兩次虛手終局。",
    rule: "MVP：終局以過兩次虛手與簡單領地估算（白貼 6.5 目），不處理複雜死活。",
  },
  {
    kind: "guosanguan",
    path: "/guosanguan",
    kicker: "消失的井字",
    title: "過三關",
    lede: "3×3 圈圈叉叉，但棋盤最多同時 4 子。可兩人連線，或一人對電腦。",
    rule: "輪流放子，三連（橫直斜）即勝。棋盤最多 4 子：落下第 5 子時先看有沒有三連，沒有則最舊的一子消失再判一次。角上數字是落下順序。",
  },
];

for (const g of games) {
  const dir = new URL(`../public${g.path}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), page(g));
}
console.log("wrote table pages");
