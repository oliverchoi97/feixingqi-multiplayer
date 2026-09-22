import { WORDS } from "./drawWords.js";

export { WORDS };
export const ROUND_MS = 80_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const WORD_MAX = 16;

export function normalizeGuess(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function sanitizeWord(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, WORD_MAX);
}

export function wordBank(custom = []) {
  const extra = (custom || []).map(sanitizeWord).filter(Boolean);
  return [...WORDS, ...extra];
}

export function pickWord(used, custom = []) {
  const bank = wordBank(custom);
  const pool = bank.filter((w) => !used.has(w));
  const list = pool.length ? pool : bank;
  return list[Math.floor(Math.random() * list.length)];
}

export function pickChoices(used, custom = [], n = 3) {
  const bank = wordBank(custom);
  const pool = bank.filter((w) => !used.has(w));
  const src = pool.length >= n ? pool : bank;
  const shuffled = [...src];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out = [];
  for (const w of shuffled) {
    if (!out.includes(w)) out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

export function matchGuess(word, text) {
  return normalizeGuess(text) === normalizeGuess(word);
}
