import {
  COLOR_META,
  COLORS,
  FINISH_INDEX,
  TRACK_PATH_LEN,
  globalToLocal,
  isFlyStart,
  isOwnColorSquare,
  localToGlobal,
} from "./board.js";

const LAST_LOCAL = TRACK_PATH_LEN - 1; // 49

export function createPlanes() {
  const planes = {};
  for (const color of COLORS) {
    planes[color] = [0, 1, 2, 3].map((slot) => ({
      id: slot,
      loc: "hangar",
      index: 0,
      slot,
    }));
  }
  return planes;
}

export function createGameState(seats, rng = Math.random) {
  return {
    phase: "playing",
    seats,
    planes: createPlanes(),
    turnIndex: 0,
    consecutiveSixes: 0,
    lastRoll: null,
    action: "roll",
    legalMoves: [],
    movedThisTurn: [],
    rankings: [],
    winner: null,
    log: [],
    rng,
  };
}

export function currentSeat(state) {
  return state.seats[state.turnIndex];
}

export function currentColor(state) {
  return currentSeat(state).color;
}

function clonePlanes(planes) {
  const out = {};
  for (const color of COLORS) {
    out[color] = planes[color].map((p) => ({ ...p }));
  }
  return out;
}

function planesAt(planes, loc, index, color = null) {
  const found = [];
  for (const c of COLORS) {
    for (const p of planes[c]) {
      if (p.loc !== loc) continue;
      if (loc === "hangar" || loc === "finished") continue;
      if (p.index !== index) continue;
      if (loc === "home" && c !== color) continue;
      found.push({ color: c, plane: p });
    }
  }
  return found;
}

function captureAt(planes, loc, index, byColor, extraColor = null) {
  const captured = [];
  const occupants = planesAt(planes, loc, index, extraColor);
  for (const { color, plane } of occupants) {
    if (color === byColor) continue;
    plane.loc = "hangar";
    plane.index = 0;
    captured.push({ color, id: plane.id, slot: plane.slot });
  }
  return captured;
}

function sendPlaneHome(plane) {
  if (plane.loc === "finished") return false;
  if (plane.loc === "hangar") return false;
  plane.loc = "hangar";
  plane.index = 0;
  return true;
}

function homeDestination(fromIndex, steps) {
  const finish = FINISH_INDEX;
  const dist = finish - fromIndex;
  if (steps === dist) return { loc: "finished", index: finish, bounced: false };
  if (steps < dist) return { loc: "home", index: fromIndex + steps, bounced: false };
  const overshoot = steps - dist;
  return { loc: "home", index: finish - overshoot, bounced: true };
}

function walkHomePath(color, fromIndex, steps) {
  const dest = homeDestination(fromIndex, steps);
  const path = [];
  if (dest.loc === "finished") {
    for (let i = fromIndex + 1; i <= FINISH_INDEX; i++) {
      path.push({ loc: "home", index: i, color, kind: "step" });
    }
    path.push({ loc: "finished", index: FINISH_INDEX, color, kind: "finish" });
    return { path, ...dest };
  }
  if (!dest.bounced) {
    for (let i = fromIndex + 1; i <= dest.index; i++) {
      path.push({ loc: "home", index: i, color, kind: "step" });
    }
    return { path, ...dest };
  }
  for (let i = fromIndex + 1; i <= FINISH_INDEX; i++) {
    path.push({ loc: "home", index: i, color, kind: "step" });
  }
  for (let i = FINISH_INDEX - 1; i >= dest.index; i--) {
    path.push({ loc: "home", index: i, color, kind: "bounce" });
  }
  return { path, ...dest };
}

function walkOnPath(color, local, steps) {
  const path = [];
  if (local + steps <= LAST_LOCAL) {
    for (let i = 1; i <= steps; i++) {
      path.push({
        loc: "track",
        index: localToGlobal(color, local + i),
        color,
        kind: "step",
      });
    }
    return { path, loc: "track", local: local + steps, homeIndex: 0, bounced: false };
  }

  const toEntrance = LAST_LOCAL - local;
  for (let i = 1; i <= toEntrance; i++) {
    path.push({
      loc: "track",
      index: localToGlobal(color, local + i),
      color,
      kind: "step",
    });
  }
  const intoHome = steps - toEntrance;
  const homeWalk = walkHomePath(color, -1, intoHome);
  path.push(...homeWalk.path);
  return {
    path,
    loc: homeWalk.loc,
    local: LAST_LOCAL,
    homeIndex: homeWalk.index,
    bounced: homeWalk.bounced,
  };
}

function applyJumpAndFly(color, globalIndex, arrivedByJump, planes) {
  const extra = [];
  const captured = [];
  let loc = "track";
  let index = globalIndex;
  let finished = false;

  const doFly = (fromJump) => {
    const meta = COLOR_META[color];
    extra.push({
      loc: "track",
      index: meta.flyEnd,
      color,
      kind: "fly",
      from: meta.flyStart,
    });
    captured.push(
      ...captureAt(planes, "home", 2, color, meta.opposite)
    );
    captured.push(...captureAt(planes, "track", meta.flyEnd, color));
    index = meta.flyEnd;
    if (!fromJump) {
      const local = globalToLocal(color, index);
      const jumped = advanceLocal(color, local, 4, planes, captured, extra, "jump");
      loc = jumped.loc;
      index = jumped.index;
      finished = jumped.finished;
    }
  };

  if (isFlyStart(color, index)) {
    doFly(arrivedByJump);
    return { extra, captured, loc, index, finished };
  }

  if (isOwnColorSquare(color, index) && globalIndex !== COLOR_META[color].entrance) {
    const local = globalToLocal(color, index);
    if (local + 4 <= LAST_LOCAL) {
      const jumped = advanceLocal(color, local, 4, planes, captured, extra, "jump");
      loc = jumped.loc;
      index = jumped.index;
      finished = jumped.finished;
      if (loc === "track" && isFlyStart(color, index)) {
        doFly(true);
      }
    }
  }

  return { extra, captured, loc, index, finished };
}

function advanceLocal(color, fromLocal, steps, planes, captured, extra, kind) {
  const destLocal = fromLocal + steps;
  if (destLocal <= LAST_LOCAL) {
    const g = localToGlobal(color, destLocal);
    extra.push({ loc: "track", index: g, color, kind });
    captured.push(...captureAt(planes, "track", g, color));
    return { loc: "track", index: g, finished: false };
  }
  const intoHome = destLocal - TRACK_PATH_LEN;
  if (intoHome > FINISH_INDEX) {
    const dest = homeDestination(0, intoHome);
    extra.push({ loc: "home", index: dest.index, color, kind });
    return { loc: dest.loc, index: dest.index, finished: dest.loc === "finished" };
  }
  extra.push({ loc: "home", index: intoHome, color, kind });
  if (intoHome === FINISH_INDEX) {
    extra.push({ loc: "finished", index: FINISH_INDEX, color, kind: "finish" });
    return { loc: "finished", index: FINISH_INDEX, finished: true };
  }
  return { loc: "home", index: intoHome, finished: false };
}

export function simulateMove(state, color, pieceId, roll) {
  const planes = clonePlanes(state.planes);
  const piece = planes[color][pieceId];
  if (!piece || piece.loc === "finished") return null;

  const captured = [];
  const path = [];

  if (piece.loc === "hangar") {
    if (roll !== 6) return null;
    const launch = COLOR_META[color].launch;
    path.push({ loc: "track", index: launch, color, kind: "takeoff", slot: piece.slot });
    captured.push(...captureAt(planes, "track", launch, color));
    piece.loc = "track";
    piece.index = launch;
    return {
      color,
      pieceId,
      roll,
      path,
      captured,
      end: { loc: "track", index: launch },
      finished: false,
    };
  }

  if (piece.loc === "home") {
    const walked = walkHomePath(color, piece.index, roll);
    path.push(...walked.path);
    if (walked.loc === "finished") {
      piece.loc = "finished";
      piece.index = FINISH_INDEX;
    } else {
      piece.loc = "home";
      piece.index = walked.index;
    }
    return {
      color,
      pieceId,
      roll,
      path,
      captured,
      end: { loc: piece.loc, index: piece.index },
      finished: piece.loc === "finished",
    };
  }

  const local = globalToLocal(color, piece.index);
  const walked = walkOnPath(color, local, roll);
  path.push(...walked.path);

  if (walked.loc === "finished") {
    piece.loc = "finished";
    piece.index = FINISH_INDEX;
    return {
      color,
      pieceId,
      roll,
      path,
      captured,
      end: { loc: "finished", index: FINISH_INDEX },
      finished: true,
    };
  }

  if (walked.loc === "home") {
    piece.loc = "home";
    piece.index = walked.homeIndex;
    return {
      color,
      pieceId,
      roll,
      path,
      captured,
      end: { loc: "home", index: piece.index },
      finished: false,
    };
  }

  const landGlobal = localToGlobal(color, walked.local);
  captured.push(...captureAt(planes, "track", landGlobal, color));
  piece.loc = "track";
  piece.index = landGlobal;

  const arrivedByJump = false;
  const bonus = applyJumpAndFly(color, landGlobal, arrivedByJump, planes);
  path.push(...bonus.extra);
  captured.push(...bonus.captured);

  if (bonus.finished) {
    piece.loc = "finished";
    piece.index = FINISH_INDEX;
  } else {
    piece.loc = bonus.loc;
    piece.index = bonus.index;
    if (bonus.loc === "track") {
      captured.push(...captureAt(planes, "track", piece.index, color));
    }
  }

  const uniqueCaptures = dedupeCaptures(captured);
  return {
    color,
    pieceId,
    roll,
    path,
    captured: uniqueCaptures,
    end: { loc: piece.loc, index: piece.index },
    finished: piece.loc === "finished",
  };
}

function dedupeCaptures(captured) {
  const seen = new Set();
  const out = [];
  for (const c of captured) {
    const key = `${c.color}-${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function legalMoves(state, color, roll) {
  const moves = [];
  const list = state.planes[color];
  for (const plane of list) {
    if (plane.loc === "finished") continue;
    if (plane.loc === "hangar") {
      if (roll === 6) {
        const sim = simulateMove(state, color, plane.id, roll);
        if (sim) moves.push(sim);
      }
      continue;
    }
    const sim = simulateMove(state, color, plane.id, roll);
    if (sim) moves.push(sim);
  }
  return moves;
}

export function applySim(state, sim) {
  const piece = state.planes[sim.color][sim.pieceId];
  for (const cap of sim.captured) {
    const victim = state.planes[cap.color][cap.id];
    victim.loc = "hangar";
    victim.index = 0;
  }
  piece.loc = sim.end.loc;
  piece.index = sim.end.index;
  if (sim.end.loc === "finished") {
    maybeRank(state, sim.color);
  }
}

function maybeRank(state, color) {
  const done = state.planes[color].every((p) => p.loc === "finished");
  if (!done) return;
  if (state.rankings.some((r) => r.color === color)) return;
  const rank = state.rankings.length + 1;
  const seat = state.seats.find((s) => s.color === color);
  state.rankings.push({
    color,
    name: seat?.name ?? color,
    rank,
  });
  if (rank === 1) {
    state.winner = color;
    finishRemainingRanks(state);
    state.phase = "ended";
    state.action = "ended";
  }
}

function finishRemainingRanks(state) {
  const rest = state.seats
    .filter((s) => !state.rankings.some((r) => r.color === s.color))
    .map((seat) => {
      const finished = state.planes[seat.color].filter((p) => p.loc === "finished").length;
      const best = Math.max(
        ...state.planes[seat.color].map((p) => progressScore(p, seat.color))
      );
      return { seat, finished, best };
    })
    .sort((a, b) => b.finished - a.finished || b.best - a.best);
  for (const row of rest) {
    state.rankings.push({
      color: row.seat.color,
      name: row.seat.name,
      rank: state.rankings.length + 1,
    });
  }
}

function nextTurnIndex(state) {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.turnIndex + i) % n;
    const color = state.seats[idx].color;
    if (state.planes[color].every((p) => p.loc === "finished")) continue;
    return idx;
  }
  return state.turnIndex;
}

export function rollDie(state) {
  if (state.phase !== "playing" || state.action !== "roll") {
    return { ok: false, error: "現在不能擲骰" };
  }
  const roll = 1 + Math.floor(state.rng() * 6);
  state.lastRoll = roll;
  const color = currentColor(state);

  if (roll === 6) {
    state.consecutiveSixes += 1;
  } else {
    state.consecutiveSixes = 0;
  }

  if (state.consecutiveSixes >= 3) {
    const punished = punishThreeSixes(state, color);
    state.consecutiveSixes = 0;
    state.movedThisTurn = [];
    state.legalMoves = [];
    state.action = "roll";
    state.turnIndex = nextTurnIndex(state);
    pushLog(state, `${COLOR_META[color].nameZh} 連續三次擲出 6，三次六返大陸！`);
    return {
      ok: true,
      roll,
      threeSixes: true,
      punished,
      extraTurn: false,
      skipped: true,
    };
  }

  const moves = legalMoves(state, color, roll);
  state.legalMoves = moves;
  if (moves.length === 0) {
    const extra = roll === 6;
    if (extra) {
      state.action = "roll";
      pushLog(state, `${COLOR_META[color].nameZh} 擲出 6，但沒有可走的棋，再擲一次。`);
      return { ok: true, roll, extraTurn: true, skipped: true, moves: [] };
    }
    state.consecutiveSixes = 0;
    state.movedThisTurn = [];
    state.action = "roll";
    state.turnIndex = nextTurnIndex(state);
    pushLog(state, `${COLOR_META[color].nameZh} 擲出 ${roll}，無法移動。`);
    return { ok: true, roll, extraTurn: false, skipped: true, moves: [] };
  }

  state.action = "select";
  return { ok: true, roll, extraTurn: false, skipped: false, moves };
}

function punishThreeSixes(state, color) {
  const moved = [...state.movedThisTurn].reverse();
  for (const id of moved) {
    const p = state.planes[color][id];
    if (sendPlaneHome(p)) return { color, id: p.id, slot: p.slot };
  }
  const onBoard = state.planes[color].filter((p) => p.loc === "track" || p.loc === "home");
  if (onBoard.length) {
    const p = onBoard[onBoard.length - 1];
    sendPlaneHome(p);
    return { color, id: p.id, slot: p.slot };
  }
  return null;
}

export function chooseMove(state, pieceId) {
  if (state.phase !== "playing" || state.action !== "select") {
    return { ok: false, error: "現在不能走棋" };
  }
  const sim = state.legalMoves.find((m) => m.pieceId === pieceId);
  if (!sim) return { ok: false, error: "這架飛機不能走" };

  applySim(state, sim);
  state.movedThisTurn.push(pieceId);
  state.legalMoves = [];

  const extra = state.lastRoll === 6 && state.phase === "playing";
  if (state.phase === "ended") {
    pushLog(state, `${COLOR_META[sim.color].nameZh} 的飛機全部到達終點，獲得冠軍！`);
    return { ok: true, sim, extraTurn: false };
  }

  if (extra) {
    state.action = "roll";
    pushLog(state, `${COLOR_META[sim.color].nameZh} 擲出 6，再擲一次。`);
    return { ok: true, sim, extraTurn: true };
  }

  state.consecutiveSixes = 0;
  state.movedThisTurn = [];
  state.action = "roll";
  state.turnIndex = nextTurnIndex(state);
  return { ok: true, sim, extraTurn: false };
}

export function pushLog(state, text) {
  state.log.push(text);
  if (state.log.length > 40) state.log.shift();
}

export function publicState(state, viewerPlayerId = null) {
  const you = state.seats.find((s) => s.playerId === viewerPlayerId) ?? null;
  return {
    phase: state.phase,
    seats: state.seats.map((s) => ({
      color: s.color,
      name: s.name,
      type: s.type,
      ready: s.ready,
      connected: s.connected,
      isHost: s.isHost,
      finished: state.planes[s.color].filter((p) => p.loc === "finished").length,
    })),
    planes: state.planes,
    turnColor: currentColor(state),
    consecutiveSixes: state.consecutiveSixes,
    lastRoll: state.lastRoll,
    action: state.action,
    legalPieceIds:
      you && you.color === currentColor(state) && state.action === "select"
        ? state.legalMoves.map((m) => m.pieceId)
        : [],
    rankings: state.rankings,
    winner: state.winner,
    log: state.log.slice(-12),
    yourColor: you?.color ?? null,
    yourTurn:
      !!you &&
      you.color === currentColor(state) &&
      you.type === "human" &&
      state.phase === "playing",
  };
}

/** Progress score used by AI: higher is better. */
export function progressScore(plane, color) {
  if (plane.loc === "finished") return 1000;
  if (plane.loc === "hangar") return 0;
  if (plane.loc === "home") return 500 + plane.index * 10;
  const local = globalToLocal(color, plane.index);
  return 10 + local * 2;
}

export function pickAiMove(moves, color) {
  if (!moves.length) return null;
  const ranked = moves.map((m) => {
    let score = 0;
    if (m.captured.length) score += 400 + m.captured.length * 80;
    if (m.finished) score += 350;
    if (m.path.some((p) => p.kind === "takeoff")) score += 120;
    if (m.path.some((p) => p.kind === "fly")) score += 90;
    if (m.path.some((p) => p.kind === "jump")) score += 40;
    const end = m.end;
    if (end.loc === "home") score += 200 + end.index * 15;
    if (end.loc === "track") score += globalToLocal(color, end.index);
    score += m.path.length;
    return { m, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].m;
}
