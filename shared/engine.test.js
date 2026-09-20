import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLOR_META, COLORS, globalToLocal, localToGlobal, trackColor } from "../shared/board.js";
import {
  applySim,
  chooseMove,
  createGameState,
  legalMoves,
  pickAiMove,
  rollDie,
  sampleDieFace,
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

  it("places a plane on the takeoff pad, not the first track cell", () => {
    const state = stateWith();
    const sim = simulateMove(state, "yellow", 0, 6);
    assert.equal(sim.end.loc, "launch");
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

describe("first step after takeoff", () => {
  const firstCellColor = {
    yellow: "blue",
    green: "yellow",
    red: "green",
    blue: "red",
  };

  for (const color of COLORS) {
    it(`${color}: roll 1 from the pad lands on the launch track cell with no jump`, () => {
      const launch = COLOR_META[color].launch;
      const state = stateWith();
      const takeoff = simulateMove(state, color, 0, 6);
      applySim(state, takeoff);
      assert.equal(state.planes[color][0].loc, "launch");

      const step = simulateMove(state, color, 0, 1);
      assert.ok(step);
      assert.equal(step.end.loc, "track");
      // Pad is not a track index; first step occupies `launch` (yellow → 3 blue).
      assert.equal(step.end.index, launch);
      assert.equal(trackColor(step.end.index), firstCellColor[color], `${color} first cell`);
      assert.equal(
        step.path.some((p) => p.kind === "jump"),
        false,
        `${color} roll 1 must not same-color jump`
      );
      assert.equal(step.path.filter((p) => p.kind === "step").length, 1);
    });
  }

  it("yellow roll 1 after takeoff is the blue cell, not a yellow jump", () => {
    const state = stateWith();
    applySim(state, simulateMove(state, "yellow", 0, 6));
    const step = simulateMove(state, "yellow", 0, 1);
    assert.equal(step.end.index, 3);
    assert.equal(trackColor(3), "blue");
    assert.notEqual(step.end.index, 8);
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

describe("dice", () => {
  it("boosts sixes to about 25% while that color is still fully in hangar", () => {
    const N = 20000;
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const state = createGameState(seats());
      const rolled = rollDie(state);
      counts[rolled.roll] += 1;
    }
    const p6 = counts[6] / N;
    assert.ok(Math.abs(p6 - 0.25) < 0.02, `P(6)=${p6}`);
    for (let face = 1; face <= 5; face++) {
      const p = counts[face] / N;
      assert.ok(Math.abs(p - 0.15) < 0.02, `P(${face})=${p}`);
    }
  });

  it("uses a fair die after that color has taken off", () => {
    const N = 20000;
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const state = createGameState(seats());
      put(state, "yellow", 0, "track", COLOR_META.yellow.launch);
      const rolled = rollDie(state);
      counts[rolled.roll] += 1;
    }
    const p6 = counts[6] / N;
    assert.ok(Math.abs(p6 - 1 / 6) < 0.02, `P(6)=${p6}`);
    for (let face = 1; face <= 5; face++) {
      const p = counts[face] / N;
      assert.ok(Math.abs(p - 1 / 6) < 0.02, `P(${face})=${p}`);
    }
  });

  it("keeps the boost only for colors that have not launched", () => {
    assert.equal(sampleDieFace(() => 0.74, true), 5);
    assert.equal(sampleDieFace(() => 0.75, true), 6);
    assert.equal(sampleDieFace(() => 0.74, false), 5);
    assert.equal(sampleDieFace(() => 5 / 6, false), 6);
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

  it("maps seats to animal pieces", () => {
    assert.equal(COLOR_META.yellow.animalZh, "貓");
    assert.equal(COLOR_META.blue.animalZh, "狗");
    assert.equal(COLOR_META.green.animalZh, "龜");
    assert.equal(COLOR_META.red.animalZh, "兔");
  });
});
