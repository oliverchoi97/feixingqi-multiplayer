import { makeDeck, shuffle, cardLabel } from "./cards.js";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const SLAP_MS = 1600;

export function createGame(seats, rng = Math.random) {
  const deck = shuffle(makeDeck(), rng);
  const hands = Object.fromEntries(seats.map((s) => [s.playerId, []]));
  let i = 0;
  for (const c of deck) {
    hands[seats[i % seats.length].playerId].push(c);
    i++;
  }
  return {
    kind: "hammintoi",
    phase: "playing",
    seats,
    hands,
    pile: [],
    turn: 0,
    slap: null,
    winner: null,
    lastEvent: "輪流打牌。出現對子時最快按「冚」。",
  };
}

export function playCard(game, playerId) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (game.slap) return { ok: false, error: "先冚完這墩" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  const hand = game.hands[playerId];
  if (!hand?.length) return { ok: false, error: "你沒牌了" };
  const card = hand.shift();
  game.pile.push({ ...card, by: playerId });
  const match = isPair(game.pile);
  if (match) {
    game.slap = {
      until: Date.now() + SLAP_MS,
      slapped: [],
    };
    game.lastEvent = `對子 ${cardLabel(card)}！快冚棉胎`;
    return { ok: true, card, match: true };
  }
  if (!hand.length) {
    game.phase = "ended";
    game.winner = { playerId, name: seat.name };
    game.lastEvent = `${seat.name} 出完牌了`;
    return { ok: true, card, win: true };
  }
  game.turn = nextWithCards(game, game.turn);
  game.lastEvent = `${seat.name} 打出 ${cardLabel(card)}`;
  return { ok: true, card, match: false };
}

function isPair(pile) {
  if (pile.length < 2) return false;
  return pile[pile.length - 1].rank === pile[pile.length - 2].rank;
}

function nextWithCards(game, from) {
  const n = game.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (game.hands[game.seats[idx].playerId]?.length) return idx;
  }
  return from;
}

export function slap(game, playerId) {
  if (game.phase !== "playing") return { ok: false, error: "對局已結束" };
  if (!game.slap) return { ok: false, error: "現在沒有對子", foul: true };
  if (game.slap.slapped.includes(playerId)) return { ok: false, error: "你已經冚過" };
  game.slap.slapped.push(playerId);
  const n = game.seats.filter((s) => game.hands[s.playerId]?.length || s.playerId === playerId).length;
  if (game.slap.slapped.length >= Math.max(2, n)) {
    resolveSlap(game);
  }
  return { ok: true };
}

export function resolveSlap(game) {
  if (!game.slap) return;
  const order = game.slap.slapped;
  const seated = game.seats.filter((s) => game.hands[s.playerId]?.length || order.includes(s.playerId));
  const last = order.length ? order[order.length - 1] : seated[seated.length - 1]?.playerId;
  const pile = game.pile.splice(0);
  if (last) {
    game.hands[last].push(...pile);
    const name = game.seats.find((s) => s.playerId === last)?.name;
    game.lastEvent = `${name} 最慢，收下 ${pile.length} 張`;
  }
  game.slap = null;
  const empty = game.seats.find((s) => !game.hands[s.playerId].length);
  if (empty) {
    game.phase = "ended";
    game.winner = { playerId: empty.playerId, name: empty.name };
  } else {
    game.turn = nextWithCards(game, game.turn);
  }
}

export function foulSlap(game, playerId) {
  if (!game.pile.length) return { ok: false };
  const take = game.pile.splice(0);
  game.hands[playerId].push(...take);
  const name = game.seats.find((s) => s.playerId === playerId)?.name;
  game.lastEvent = `${name} 誤冚，收下 ${take.length} 張`;
  return { ok: true };
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const hand = you ? game.hands[you.playerId] : [];
  const top = game.pile[game.pile.length - 1] || null;
  return {
    kind: "hammintoi",
    phase: game.phase,
    yourTurn: game.phase === "playing" && !game.slap && game.seats[game.turn]?.playerId === viewerId,
    slapOpen: Boolean(game.slap),
    slapUntil: game.slap?.until || null,
    youSlapped: Boolean(game.slap?.slapped.includes(viewerId)),
    handCount: hand.length,
    top: top ? { suit: top.suit, rank: top.rank } : null,
    pileCount: game.pile.length,
    lastEvent: game.lastEvent,
    winner: game.winner,
    seats: game.seats.map((s, i) => ({
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
      cards: game.hands[s.playerId]?.length || 0,
      active: i === game.turn && !game.slap && game.phase === "playing",
    })),
  };
}
