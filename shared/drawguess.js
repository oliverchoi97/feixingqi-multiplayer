export const WORDS = [
  "貓", "狗", "魚", "鳥", "房子", "太陽", "月亮", "樹", "花", "車",
  "飛機", "船", "雨傘", "眼鏡", "帽子", "鞋子", "蛋糕", "西瓜", "香蕉", "蘋果",
  "足球", "籃球", "吉他", "鋼琴", "電話", "書", "筆", "椅子", "桌子", "門",
  "窗戶", "山", "海", "雲", "星星", "彩虹", "蝴蝶", "恐龍", "機器人", "雪人",
  "聖誕樹", "腳踏車", "火車", "橋", "城堡", "冰淇淋", "漢堡", "披薩", "相機", "時鐘",
  "鑰匙", "愛心", "幽靈", "龍", "兔子", "烏龜", "大象", "企鵝", "雨", "火",
];

export const ROUND_MS = 80_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export function normalizeGuess(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function pickWord(used) {
  const pool = WORDS.filter((w) => !used.has(w));
  const list = pool.length ? pool : WORDS;
  return list[Math.floor(Math.random() * list.length)];
}

export function matchGuess(word, text) {
  return normalizeGuess(text) === normalizeGuess(word);
}
