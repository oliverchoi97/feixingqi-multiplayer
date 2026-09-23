import { makeDeck, shuffle, cardLabel } from "./cards.js";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DEFAULT_SEATS = 4;

export function createGame(seats, rng = Math.random) {
  let deck = shuffle(makeDeck(), rng);
  const maid = deck.find((c) => c.rank === "Q" && c.suit === "♠") || deck[0];
  deck = deck.filter((c) => c.id !== maid.id);
  const hands = Object.fromEntries(seats.map((s) => [s.playerId, []]));
  let i = 0;
  for (const c of deck) {
    hands[seats[i % seats.length].playerId].push(c);
    i++;
  }
  for (const s of seats) discardPairs(hands[s.playerId]);
  return {
    kind: "oldmaid",
    phase: "playing",
    seats,
    hands,
    maidId: maid.id,
    turn: 0,
    winner: null,
    loser: null,
    probe: null,
    lastDraw: null,
    lastEvent: `抽出黑桃 Q 當烏龜。按住對方一張牌凸起，鬆手或點一下就抽走。`,
  };
}

function rankKey(c) {
  return c.rank;
}

export function discardPairs(hand) {
  const counts = new Map();
  for (const c of hand) counts.set(rankKey(c), (counts.get(rankKey(c)) || 0) + 1);
  const drop = new Set();
  for (const [rank, n] of counts) {
    const pairs = Math.floor(n / 2);
    let seen = 0;
    if (!pairs) continue;
    for (const c of hand) {
      if (rankKey(c) !== rank) continue;
      if (seen < pairs * 2) {
        drop.add(c.id);
        seen++;
      }
    }
  }
  const kept = hand.filter((c) => !drop.has(c.id));
  hand.length = 0;
  hand.push(...kept);
  return drop.size / 2;
}

export function leftPlayer(game, turn) {
  const n = game.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (turn - i + n) % n;
    if (game.hands[game.seats[idx].playerId].length) return game.seats[idx];
  }
  return game.seats[(turn + n - 1) % n];
}

export function setProbe(game, playerId, index) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  const left = leftPlayer(game, game.turn);
  const from = game.hands[left.playerId];
  if (index == null || index === false || index === "") {
    game.probe = null;
    return { ok: true, probed: true, cleared: true };
  }
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= from.length) return { ok: false, error: "沒有這張牌" };
  game.probe = { by: playerId, byName: seat.name, fromId: left.playerId, fromName: left.name, index: i };
  return { ok: true, probed: true };
}

export function drawFrom(game, playerId, index) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  const left = leftPlayer(game, game.turn);
  const from = game.hands[left.playerId];
  if (!from.length) return { ok: false, error: "對方沒牌" };
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= from.length) return { ok: false, error: "請選一張牌" };
  const card = from.splice(i, 1)[0];
  game.hands[playerId].push(card);
  const pairs = discardPairs(game.hands[playerId]);
  game.probe = null;
  game.lastDraw = { by: playerId, byName: seat.name, fromId: left.playerId, fromName: left.name, index: i };
  game.lastEvent = pairs
    ? `${seat.name} 抽了 ${left.name} 一張，對子丟掉`
    : `${seat.name} 抽了 ${left.name} 第 ${i + 1} 張`;
  checkEnd(game);
  if (game.phase === "playing") game.turn = nextWithCards(game, game.turn);
  return { ok: true, cardHidden: true, index: i };
}

export function drawFromLeft(game, playerId) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  const left = leftPlayer(game, game.turn);
  const from = game.hands[left.playerId];
  if (!from.length) return { ok: false, error: "對方沒牌" };
  const i = Math.floor(Math.random() * from.length);
  return drawFrom(game, playerId, i);
}

function nextWithCards(game, from) {
  const n = game.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (game.hands[game.seats[idx].playerId].length) return idx;
  }
  return from;
}

function checkEnd(game) {
  const holding = game.seats.filter((s) => game.hands[s.playerId].length);
  if (holding.length === 1) {
    game.phase = "ended";
    game.loser = { playerId: holding[0].playerId, name: holding[0].name };
    const winners = game.seats.filter((s) => s.playerId !== holding[0].playerId);
    game.winner = winners[0] ? { playerId: winners[0].playerId, name: winners[0].name } : null;
    game.lastEvent = `${holding[0].name} 抽到烏龜，其餘人過關`;
  }
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const hand = you ? game.hands[you.playerId].map((c) => ({ suit: c.suit, rank: c.rank, id: c.id })) : [];
  const left = game.phase === "playing" ? leftPlayer(game, game.turn) : null;
  const targetCount = left ? game.hands[left.playerId].length : 0;
  return {
    kind: "oldmaid",
    phase: game.phase,
    yourTurn: game.phase === "playing" && game.seats[game.turn]?.playerId === viewerId,
    hand,
    lastEvent: game.lastEvent,
    winner: game.winner,
    loser: game.loser,
    probe: game.probe,
    lastDraw: game.lastDraw,
    target: left
      ? {
          playerId: left.playerId,
          name: left.name,
          count: targetCount,
          you: left.playerId === viewerId,
        }
      : null,
    seats: game.seats.map((s, i) => ({
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
      cards: game.hands[s.playerId]?.length || 0,
      active: i === game.turn && game.phase === "playing",
    })),
  };
}

export { cardLabel };
