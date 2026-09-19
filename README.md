# Gaming In My Life

瀏覽器小遊戲入口（繁體中文）：**飛行棋**與**踩地雷**。公開網址 [gaminginmylife.onrender.com](https://gaminginmylife.onrender.com)。

## 本機執行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

瀏覽器開啟 <http://127.0.0.1:43177>。正式啟動用 `npm start`。環境變數 `PORT` 可改埠號。

| 路徑 | 內容 |
| --- | --- |
| `/` | 選遊戲 |
| `/feixingqi` | 飛行棋（`/?room=代碼` 會轉到這裡） |
| `/minesweeper` | 踩地雷：單人 A/B/C，或雙人高級競賽 |

跑測試：`npm test`。

兩開分頁即可同房：飛行棋一頁建立、另一頁輸入四碼或開啟複製的連結；踩地雷競賽同樣用房間代碼。

## 部署（公開 HTTPS）

伺服器綁定 `0.0.0.0` 與 `process.env.PORT`。房間狀態在記憶體裡，**請保持單一實例**。

- Render：讀 `render.yaml`（免費 Web Service、`npm install` / `npm start`、健康檢查 `/healthz`、`numInstances: 1`）。閒置後會休眠。
- Fly.io：`fly.toml` + `Dockerfile`。
- Railway：讀 `Procfile`。

## 飛行棋

經典中國飛行棋（不是 Ludo）。棋盤外觀依 Wikimedia Commons [Fei xing qi board (BYGR).svg](https://commons.wikimedia.org/wiki/File:Fei_xing_qi_board_(BYGR).svg)（Mliu92，CC BY-SA 4.0）。

1. 輸入暱稱，建立或加入房間。
2. 點「準備」。全員準備後開局；空位由電腦補滿四家。
3. 輪到你時在棋盤中央向上滑動骰子（也可點一下）。
4. 四方棋子全部進終點者獲勝。棋子圖示：黃貓、綠龜、紅兔、藍狗。

重新整理可憑同一個分頁還原（房間代碼 + 玩家 id 在 sessionStorage）。

傳統規則：擲 6 起飛、同色跳四、虛線飛航、終點反彈、三次六返大陸。尚未有任何飛機離場時（四架都在機場），該玩家擲出 6 的機率為 **1/4**；只要有一架成功起飛，之後改回公平六面骰。電腦同一規則。

任何人擲骰（含電腦）時，房間裡每位玩家都會看到中央骰子翻滾與點數。對局中可在底部輸入聊天，訊息以彈幕橫過棋盤。

## 踩地雷

- **單人** 選經典難度：A 初級 9×9／10 雷、B 中級 16×16／40 雷、C 高級 30×16／99 雷。第一格保證安全。左鍵揭開，右鍵或長按插**旗幟圖示**。踩雷後可按「時光倒流」撤回上一手（僅一步），繼續同一盤。
- **雙人競賽** 固定高級 C，最多 2 人、無電腦。開局用同一種子佈雷，雙方棋盤完全相同。**第一格不保證安全。** 先揭完所有安全格者勝；踩雷即出局，對手若仍在場即獲勝。幾乎同時的操作以伺服器先處理的為準。對局中斷線視為棄權。**競賽不可時光倒流。**
- 對局畫面底部可聊天。多人房間會廣播彈幕；單人模式只在本機顯示。

## 專案結構

```
server/          Express + Socket.IO（飛行棋預設命名空間，踩地雷 /mines）
shared/          飛行棋規則與踩地雷引擎（含測試）
public/          入口、飛行棋、踩地雷介面
```
