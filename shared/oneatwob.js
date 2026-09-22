/** 估數字 / 1A2B：四位不重複數字。兩人以上時由一位玩家出題，其餘人猜。 */

export const DIGITS = 4;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export function randomSecret(rng = Math.random) {
  const pool = [..."0123456789"];
  const out = [];
  while (out.length < DIGITS) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out.join("");
}

export function parseGuess(raw) {
  const s = String(raw || "").replace(/\D/g, "").slice(0, DIGITS);
  if (s.length !== DIGITS) return { ok: false, error: "請輸入四位數字" };
  if (new Set(s).size !== DIGITS) return { ok: false, error: "四位數字不可重複" };
  return { ok: true, guess: s };
}

export function scoreGuess(secret, guess) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < DIGITS; i++) {
    if (guess[i] === secret[i]) a++;
    else if (secret.includes(guess[i])) b++;
  }
  return { a, b };
}

export function firstGuesser(game) {
  const i = game.seats.findIndex((s) => s.playerId !== game.setterId);
  return i < 0 ? 0 : i;
}

export function nextGuesser(game, from) {
  const n = game.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (game.seats[idx].playerId !== game.setterId) return idx;
  }
  return from;
}

export function createGame(seats, secret = null) {
  const humans = seats.filter((s) => s.type === "human");
  const setterId = !secret && humans.length >= 2 ? humans[0].playerId : null;
  const game = {
    kind: "oneatwob",
    phase: setterId ? "set" : "playing",
    secret: secret || null,
    setterId,
    seats,
    turn: 0,
    history: [],
    winner: null,
  };
  if (!setterId && !game.secret) game.secret = randomSecret();
  if (game.phase === "playing") game.turn = firstGuesser(game);
  return game;
}

export function applySecret(game, playerId, payload) {
  if (game.phase !== "set") return { ok: false, error: "現在不能出題" };
  if (playerId !== game.setterId) return { ok: false, error: "只有出題者可以設定密碼" };
  if (payload?.random) {
    game.secret = randomSecret();
  } else {
    const raw = payload?.secret ?? payload?.guess ?? payload;
    const parsed = parseGuess(raw);
    if (!parsed.ok) return parsed;
    game.secret = parsed.guess;
  }
  game.phase = "playing";
  game.turn = firstGuesser(game);
  return { ok: true };
}

export function applyGuess(game, playerId, raw) {
  if (game.phase !== "playing") return { ok: false, error: game.phase === "set" ? "等出題者鎖定密碼" : "對局已結束" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  if (playerId === game.setterId) return { ok: false, error: "出題者不能猜" };
  const parsed = parseGuess(raw);
  if (!parsed.ok) return parsed;
  const { a, b } = scoreGuess(game.secret, parsed.guess);
  const entry = { playerId, name: seat.name, guess: parsed.guess, a, b };
  game.history.push(entry);
  if (a === DIGITS) {
    game.phase = "ended";
    game.winner = { playerId, name: seat.name };
    return { ok: true, ...entry, win: true };
  }
  game.turn = nextGuesser(game, game.turn);
  return { ok: true, ...entry, win: false };
}

export function pickAiGuess(game) {
  for (let n = 0; n < 50; n++) {
    const g = randomSecret();
    if (!game.history.some((h) => h.guess === g)) return g;
  }
  return randomSecret();
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const setter = game.seats.find((s) => s.playerId === game.setterId);
  return {
    kind: "oneatwob",
    phase: game.phase,
    turn: game.turn,
    history: game.history.slice(-24),
    winner: game.winner,
    setterName: setter?.name || null,
    yourSet: Boolean(game.setterId && viewerId === game.setterId),
    yourTurn: game.phase === "playing" && you && game.seats[game.turn]?.playerId === viewerId,
    seats: game.seats.map((s, i) => ({
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
      setter: s.playerId === game.setterId,
      active: i === game.turn && game.phase === "playing",
    })),
  };
}
