import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLOR_META, COLORS, globalToLocal, localToGlobal } from "../shared/board.js";
import {
  applySim,
  chooseMove,
  createGameState,
  legalMoves,
  pickAiMove,
  rollDie,
  simulateMove,
} from "../shared/engine.js";

function seats() {
  return COLORS.map((color, i) => ({
    color,
    name: color,
    type: "ai",
    ready: true,
    connected: true,
    isHost: i === 0,
    playerId: `p${i}`,
  }));
}

function stateWith(setup) {
  const state = createGameState(seats(), () => 0.99);
  if (setup) setup(state);
  return state;
}

function put(state, color, id, loc, index) {
  const p = state.planes[color][id];
  p.loc = loc;
  p.index = index;
}

describe("takeoff", () => {
  it("requires a 6 to leave the hangar", () => {
    const state = stateWith();
    assert.equal(legalMoves(state, "yellow", 5).length, 0);
    assert.equal(legalMoves(state, "yellow", 6).length, 4);
  });

  it("places a plane on the coloured launch square", () => {
    const state = stateWith();
    const sim = simulateMove(state, "yellow", 0, 6);
    assert.equal(sim.end.loc, "track");
    assert.equal(sim.end.index, COLOR_META.yellow.launch);
    assert.equal(sim.path[0].kind, "takeoff");
  });

  it("captures an opponent sitting on the launch square", () => {
    const state = stateWith((s) => {
      put(s, "red", 0, "track", COLOR_META.yellow.launch);
    });
    const sim = simulateMove(state, "yellow", 1, 6);
    assert.equal(sim.captured.length, 1);
    assert.equal(sim.captured[0].color, "red");
  });
});

describe("jump and fly", () => {
  it("jumps +4 when landing on own colour", () => {
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", 8);
    });
    const sim = simulateMove(state, "yellow", 0, 4);
    assert.equal(sim.end.loc, "track");
    assert.equal(sim.end.index, 16);
    assert.ok(sim.path.some((p) => p.kind === "jump"));
  });

  it("flies across then jumps +4 when the die lands on the dashed start", () => {
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", 18);
    });
    const sim = simulateMove(state, "yellow", 0, 2);
    assert.equal(sim.end.index, 36);
    assert.ok(sim.path.some((p) => p.kind === "fly"));
    assert.ok(sim.path.some((p) => p.kind === "jump"));
  });

  it("flies without the extra +4 if the dash start was reached by a jump", () => {
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", 12);
    });
    const sim = simulateMove(state, "yellow", 0, 4);
    assert.equal(sim.end.index, COLOR_META.yellow.flyEnd);
    assert.ok(sim.path.some((p) => p.kind === "fly"));
    const afterFly = sim.path.filter((p) => p.kind === "jump" && p.index === 36);
    assert.equal(afterFly.length, 0);
  });

  it("captures a plane on the opposite home stretch while flying", () => {
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", 18);
      put(s, "red", 0, "home", 2);
    });
    const sim = simulateMove(state, "yellow", 0, 2);
    assert.ok(sim.captured.some((c) => c.color === "red"));
  });
});

describe("home stretch", () => {
  it("needs an exact count to finish", () => {
    const state = stateWith((s) => put(s, "yellow", 0, "home", 4));
    const win = simulateMove(state, "yellow", 0, 1);
    assert.equal(win.finished, true);
    const bounce = simulateMove(state, "yellow", 0, 3);
    assert.equal(bounce.end.loc, "home");
    assert.equal(bounce.end.index, 3);
    assert.ok(bounce.path.some((p) => p.kind === "bounce"));
  });

  it("turns into the home stretch from the colour arrow", () => {
    const entrance = COLOR_META.yellow.entrance;
    const before = (entrance + 51) % 52;
    const state = stateWith((s) => put(s, "yellow", 0, "track", before));
    const sim = simulateMove(state, "yellow", 0, 2);
    assert.equal(sim.end.loc, "home");
    assert.equal(sim.end.index, 0);
  });

  it("finishes exactly with a 6 from the turning arrow", () => {
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", COLOR_META.yellow.entrance);
    });
    const sim = simulateMove(state, "yellow", 0, 6);
    assert.equal(sim.finished, true);
  });
});

describe("capture and stacks", () => {
  it("sends a whole opponent stack back to hangar", () => {
    const dest = localToGlobal("yellow", 5);
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", localToGlobal("yellow", 2));
      put(s, "blue", 0, "track", dest);
      put(s, "blue", 1, "track", dest);
    });
    const sim = simulateMove(state, "yellow", 0, 3);
    assert.equal(sim.captured.length, 2);
  });
});

describe("turns", () => {
  it("grants an extra roll after a 6 that was used", () => {
    const rngSeq = [5 / 6, 0.1];
    let i = 0;
    const state = createGameState(seats(), () => rngSeq[i++] ?? 0.1);
    put(state, "yellow", 0, "track", COLOR_META.yellow.launch);
    const rolled = rollDie(state);
    assert.equal(rolled.roll, 6);
    const chosen = chooseMove(state, 1);
    assert.equal(chosen.extraTurn, true);
    assert.equal(state.action, "roll");
    assert.equal(state.seats[state.turnIndex].color, "yellow");
  });

  it("returns a plane to hangar on three 6s in a row", () => {
    const state = createGameState(seats(), () => 0.99);
    put(state, "yellow", 0, "track", COLOR_META.yellow.launch);
    put(state, "yellow", 1, "track", localToGlobal("yellow", 4));
    rollDie(state);
    chooseMove(state, 0);
    rollDie(state);
    chooseMove(state, 1);
    const third = rollDie(state);
    assert.equal(third.threeSixes, true);
    assert.equal(state.planes.yellow[1].loc, "hangar");
    assert.equal(state.seats[state.turnIndex].color, "green");
  });
});

describe("AI", () => {
  it("prefers a capture over a quiet move", () => {
    const dest = localToGlobal("yellow", 6);
    const state = stateWith((s) => {
      put(s, "yellow", 0, "track", localToGlobal("yellow", 1));
      put(s, "yellow", 1, "track", localToGlobal("yellow", 3));
      put(s, "red", 0, "track", dest);
    });
    const moves = legalMoves(state, "yellow", 5);
    const pick = pickAiMove(moves, "yellow");
    assert.equal(pick.pieceId, 0);
    assert.ok(pick.captured.length);
  });

  it("never returns an illegal move", () => {
    const state = stateWith();
    const moves = legalMoves(state, "yellow", 3);
    assert.equal(moves.length, 0);
    assert.equal(pickAiMove(moves, "yellow"), null);
  });
});

describe("path helpers", () => {
  it("maps launch to local 0 and entrance to local 49", () => {
    for (const color of COLORS) {
      assert.equal(globalToLocal(color, COLOR_META[color].launch), 0);
      assert.equal(globalToLocal(color, COLOR_META[color].entrance), 49);
      assert.equal(localToGlobal(color, 0), COLOR_META[color].launch);
      assert.equal(localToGlobal(color, 49), COLOR_META[color].entrance);
    }
  });
});
