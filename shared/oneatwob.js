/** 估數字 / 1A2B：四位不重複數字。兩人以上各自出題、互猜；一人對電腦則雙方各有一組密碼。 */

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

export function targetOf(game, fromIndex = game.turn) {
  const n = game.seats.length;
  if (n < 2) return game.seats[0] || null;
  return game.seats[(fromIndex + 1) % n];
}

export function nextTurn(game, from) {
  return (from + 1) % game.seats.length;
}

function allSecretsReady(game) {
  return game.seats.every((s) => game.secrets[s.playerId]);
}

export function createGame(seats, _secret = null, rng = Math.random) {
  const secrets = {};
  for (const s of seats) {
    if (s.type === "ai") secrets[s.playerId] = randomSecret(rng);
  }
  const game = {
    kind: "oneatwob",
    phase: "set",
    secrets,
    setterId: null,
    seats,
    turn: 0,
    history: [],
    winner: null,
    lastEvent: "每人先悄悄設定一組四位不重複數字，再輪流猜下一家。",
  };
  if (allSecretsReady(game)) {
    game.phase = "playing";
    game.turn = 0;
    game.lastEvent = "開始互猜。每回合一人猜一次下一家的密碼。";
  }
  return game;
}

export function applySecret(game, playerId, payload) {
  if (game.phase !== "set") return { ok: false, error: "現在不能出題" };
  const seat = game.seats.find((s) => s.playerId === playerId);
  if (!seat) return { ok: false, error: "你不在這局" };
  if (game.secrets[playerId]) return { ok: false, error: "你已經鎖定密碼" };
  if (payload?.random) {
    game.secrets[playerId] = randomSecret();
  } else {
    const raw = payload?.secret ?? payload?.guess ?? payload;
    const parsed = parseGuess(raw);
    if (!parsed.ok) return parsed;
    game.secrets[playerId] = parsed.guess;
  }
  if (allSecretsReady(game)) {
    game.phase = "playing";
    game.turn = 0;
    game.lastEvent = "全員鎖定。開始互猜，每回合一人猜一次。";
  } else {
    const pending = game.seats.filter((s) => !game.secrets[s.playerId]).map((s) => s.name);
    game.lastEvent = `${seat.name} 已鎖定。還等 ${pending.join("、")}`;
  }
  return { ok: true };
}

export function applyGuess(game, playerId, raw) {
  if (game.phase !== "playing") return { ok: false, error: game.phase === "set" ? "等大家鎖定密碼" : "對局已結束" };
  const seat = game.seats[game.turn];
  if (!seat || seat.playerId !== playerId) return { ok: false, error: "還沒輪到你" };
  const target = targetOf(game, game.turn);
  if (!target || target.playerId === playerId) return { ok: false, error: "沒有可猜的對手" };
  const secret = game.secrets[target.playerId];
  if (!secret) return { ok: false, error: "對手還沒設密碼" };
  const parsed = parseGuess(raw);
  if (!parsed.ok) return parsed;
  const { a, b } = scoreGuess(secret, parsed.guess);
  const entry = {
    playerId,
    name: seat.name,
    targetId: target.playerId,
    targetName: target.name,
    guess: parsed.guess,
    a,
    b,
  };
  game.history.push(entry);
  game.lastEvent = `${seat.name} 猜 ${target.name}　${parsed.guess}　${a}A${b}B`;
  if (a === DIGITS) {
    game.phase = "ended";
    game.winner = { playerId, name: seat.name };
    game.lastEvent = `${seat.name} 猜中 ${target.name} 的密碼`;
    return { ok: true, ...entry, win: true };
  }
  game.turn = nextTurn(game, game.turn);
  return { ok: true, ...entry, win: false };
}

export function pickAiGuess(game) {
  const seat = game.seats[game.turn];
  const target = targetOf(game, game.turn);
  const used = new Set(
    game.history.filter((h) => h.playerId === seat?.playerId && h.targetId === target?.playerId).map((h) => h.guess)
  );
  for (let n = 0; n < 80; n++) {
    const g = randomSecret();
    if (!used.has(g)) return g;
  }
  return randomSecret();
}

export function publicView(game, viewerId) {
  const you = game.seats.find((s) => s.playerId === viewerId);
  const pending = game.seats.filter((s) => !game.secrets[s.playerId]);
  const target = game.phase === "playing" ? targetOf(game, game.turn) : you ? targetOf(game, game.seats.indexOf(you)) : null;
  return {
    kind: "oneatwob",
    phase: game.phase,
    turn: game.turn,
    history: game.history.slice(-24),
    winner: game.winner,
    lastEvent: game.lastEvent,
    setterName: null,
    yourSet: game.phase === "set" && Boolean(you) && !game.secrets[you.playerId],
    youLocked: Boolean(you && game.secrets[you.playerId]),
    pendingNames: pending.map((s) => s.name),
    targetName: target?.name || null,
    yourTurn: game.phase === "playing" && you && game.seats[game.turn]?.playerId === viewerId,
    seats: game.seats.map((s, i) => ({
      name: s.name,
      type: s.type,
      you: s.playerId === viewerId,
      setter: false,
      locked: Boolean(game.secrets[s.playerId]),
      active: i === game.turn && game.phase === "playing",
    })),
  };
}
