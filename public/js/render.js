import {
  COLOR_META,
  COLORS,
  TRACK,
  pieceScreenPos,
  waypointScreenPos,
} from "/shared/board.js";

const PIP_COLORS = {
  yellow: "#e6c200",
  green: "#1f8a3a",
  red: "#d42323",
  blue: "#1a4fd8",
};

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = null;
    this.legal = new Set();
    this.anim = null;
    this.hover = null;
    this.raf = 0;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setState(state, legalPieceIds = []) {
    this.state = state;
    this.legal = new Set(legalPieceIds);
  }

  playMove(sim, onDone) {
    const pts = sim.path.map((wp) => {
      const [x, y] = waypointScreenPos(wp);
      return { x, y, kind: wp.kind, loc: wp.loc };
    });
    const hangarStart = sim.path[0]?.kind === "takeoff"
      ? pieceScreenPos({ loc: "hangar", slot: sim.path[0].slot ?? sim.pieceId }, sim.color)
      : null;
    if (hangarStart) pts.unshift({ x: hangarStart[0], y: hangarStart[1], kind: "from" });
    this.anim = {
      color: sim.color,
      pieceId: sim.pieceId,
      pts,
      t0: performance.now(),
      duration: Math.max(280, pts.length * 170),
      captures: sim.captured || [],
      onDone,
      done: false,
    };
  }

  hitTest(clientX, clientY) {
    if (!this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 950;
    const y = ((clientY - rect.top) / rect.height) * 950;
    let best = null;
    let bestD = 28;
    for (const color of COLORS) {
      for (const plane of this.state.planes[color]) {
        const [px, py] = this.drawPos(plane, color);
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) {
          bestD = d;
          best = { color, id: plane.id };
        }
      }
    }
    return best;
  }

  drawPos(plane, color) {
    if (
      this.anim &&
      !this.anim.done &&
      this.anim.color === color &&
      this.anim.pieceId === plane.id
    ) {
      return this.animPos();
    }
    return pieceScreenPos(plane, color);
  }

  animPos() {
    const { pts, t0, duration } = this.anim;
    const t = Math.min(1, (performance.now() - t0) / duration);
    if (pts.length === 1) return [pts[0].x, pts[0].y];
    const seg = t * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(seg));
    const f = seg - i;
    const eased = f * f * (3 - 2 * f);
    return [
      pts[i].x + (pts[i + 1].x - pts[i].x) * eased,
      pts[i].y + (pts[i + 1].y - pts[i].y) * eased,
    ];
  }

  loop() {
    this.draw();
    if (this.anim && !this.anim.done) {
      const t = (performance.now() - this.anim.t0) / this.anim.duration;
      if (t >= 1) {
        this.anim.done = true;
        const cb = this.anim.onDone;
        this.anim = null;
        if (cb) cb();
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.state) return;

    this.drawHighlights();

    const groups = [];
    for (const color of COLORS) {
      for (const plane of this.state.planes[color]) {
        const [x, y] = this.drawPos(plane, color);
        groups.push({ color, plane, x, y, key: `${plane.loc}:${plane.index}:${plane.slot}` });
      }
    }

    const stacks = new Map();
    for (const g of groups) {
      const k =
        g.plane.loc === "hangar" || g.plane.loc === "finished"
          ? `${g.color}-h-${g.plane.slot}`
          : `${g.plane.loc}-${g.color === "home" ? g.color : ""}-${g.plane.index}`;
      if (g.plane.loc === "track") {
        const key = `track-${g.plane.index}`;
        if (!stacks.has(key)) stacks.set(key, []);
        stacks.get(key).push(g);
      } else if (g.plane.loc === "home") {
        const key = `home-${g.color}-${g.plane.index}`;
        if (!stacks.has(key)) stacks.set(key, []);
        stacks.get(key).push(g);
      } else {
        this.drawPlane(g.x, g.y, g.color, g.plane, 0, this.legal.has(g.plane.id) && this.state.yourColor === g.color);
      }
    }

    for (const list of stacks.values()) {
      list.forEach((g, i) => {
        const ox = (i - (list.length - 1) / 2) * 11;
        const oy = (i - (list.length - 1) / 2) * -8;
        const legal =
          this.legal.has(g.plane.id) && this.state.yourColor === g.color && this.state.yourTurn;
        this.drawPlane(g.x + ox, g.y + oy, g.color, g.plane, heading(g, this.state), legal);
      });
    }
  }

  drawHighlights() {
    if (!this.state?.yourTurn || !this.legal.size) return;
    const { ctx } = this;
    const color = this.state.yourColor;
    for (const plane of this.state.planes[color]) {
      if (!this.legal.has(plane.id)) continue;
      const [x, y] = pieceScreenPos(plane, color);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      ctx.beginPath();
      ctx.arc(x, y, 26 + pulse * 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 248, 200, ${0.4 + pulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  drawPlane(x, y, color, plane, angle, legal) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    const finished = plane.loc === "finished";
    const fill = finished ? shade(PIP_COLORS[color], -0.35) : PIP_COLORS[color];
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#1b120b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-2, 3);
    ctx.lineTo(-14, 5);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-6, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, 0, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff8e8";
    ctx.fill();
    if (finished) {
      ctx.rotate(0.2);
      ctx.fillStyle = "#fff8e8";
      ctx.font = "700 11px sans-serif";
      ctx.fillText("完", -8, 4);
    }
    if (legal) {
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function heading(g, state) {
  if (g.plane.loc !== "track") {
    if (g.color === "yellow") return 0;
    if (g.color === "green") return Math.PI / 2;
    if (g.color === "red") return Math.PI;
    return -Math.PI / 2;
  }
  const i = g.plane.index;
  const a = TRACK[i];
  const b = TRACK[(i + 1) % 52];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function shade(hex, amt) {
  const n = hex.replace("#", "");
  const num = parseInt(n, 16);
  let r = (num >> 16) + Math.round(255 * amt);
  let g = ((num >> 8) & 0xff) + Math.round(255 * amt);
  let b = (num & 0xff) + Math.round(255 * amt);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

export { COLOR_META, COLORS };
