export const SUITS = ["♠", "♥", "♣", "♦"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank, id: `${suit}${rank}` });
  }
  return deck;
}

export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardLabel(c) {
  if (!c) return "";
  return `${c.suit}${c.rank}`;
}

export function isRed(c) {
  return c?.suit === "♥" || c?.suit === "♦";
}
