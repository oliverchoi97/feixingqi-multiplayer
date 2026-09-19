import {
  COLOR_META,
  COLORS,
  pieceScreenPos,
  waypointScreenPos,
} from "/shared/board.js";

const PIP_COLORS = {
  yellow: "#e6c200",
  green: "#1f8a3a",
  red: "#d42323",
  blue: "#1a4fd8",
};

const TOKEN_R = 24;
const HIT_R = 64;

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
    const pts = [];
    for (const wp of sim.path || []) {
      const pos = waypointScreenPos(wp);
      if (!pos) continue;
      pts.push({ x: pos[0], y: pos[1], kind: wp.kind, loc: wp.loc });
    }
    if (sim.path?.[0]?.kind === "takeoff") {
      const hangarStart = pieceScreenPos(
        { loc: "hangar", slot: sim.path[0].slot ?? sim.pieceId },
        sim.color
      );
      if (hangarStart) pts.unshift({ x: hangarStart[0], y: hangarStart[1], kind: "from" });
    }
    const finish = () => {
      this.anim = null;
      onDone?.();
    };
    if (pts.length < 1) {
      finish();
      return;
    }
    this.anim = {
      color: sim.color,
      pieceId: sim.pieceId,
      pts,
      t0: performance.now(),
      duration: Math.max(320, pts.length * 180),
      captures: sim.captured || [],
      onDone,
      done: false,
    };
  }

  hitTest(clientX, clientY) {
    if (!this.state) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((clientX - rect.left) / rect.width) * 950;
    const y = ((clientY - rect.top) / rect.height) * 950;
    let best = null;
    let bestD = HIT_R;
    const color = this.state.yourColor;
    const list = color ? this.state.planes[color] : [];
    for (const plane of list) {
      const pos = this.drawPos(plane, color);
      if (!pos) continue;
      const d = Math.hypot(pos[0] - x, pos[1] - y);
      if (d < bestD) {
        bestD = d;
        best = { color, id: plane.id };
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
    try {
      this.draw();
    } catch (err) {
      console.error(err);
    }
    if (this.anim && !this.anim.done) {
      const t = (performance.now() - this.anim.t0) / Math.max(1, this.anim.duration);
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
        const pos = this.drawPos(plane, color);
        if (!pos) continue;
        groups.push({ color, plane, x: pos[0], y: pos[1] });
      }
    }

    const stacks = new Map();
    for (const g of groups) {
      if (g.plane.loc === "track") {
        const key = `track-${g.plane.index}`;
        if (!stacks.has(key)) stacks.set(key, []);
        stacks.get(key).push(g);
      } else if (g.plane.loc === "home") {
        const key = `home-${g.color}-${g.plane.index}`;
        if (!stacks.has(key)) stacks.set(key, []);
        stacks.get(key).push(g);
      } else {
        this.drawToken(
          g.x,
          g.y,
          g.color,
          g.plane,
          this.legal.has(g.plane.id) && this.state.yourColor === g.color
        );
      }
    }

    for (const list of stacks.values()) {
      list.forEach((g, i) => {
        const ox = (i - (list.length - 1) / 2) * 12;
        const oy = (i - (list.length - 1) / 2) * -9;
        const legal =
          this.legal.has(g.plane.id) && this.state.yourColor === g.color && this.state.yourTurn;
        this.drawToken(g.x + ox, g.y + oy, g.color, g.plane, legal);
      });
    }
  }

  drawHighlights() {
    if (!this.state?.yourTurn || !this.legal.size) return;
    const { ctx } = this;
    const color = this.state.yourColor;
    if (!color || !this.state.planes[color]) return;
    for (const plane of this.state.planes[color]) {
      if (!this.legal.has(plane.id)) continue;
      const pos = pieceScreenPos(plane, color);
      if (!pos) continue;
      const [x, y] = pos;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
      ctx.beginPath();
      ctx.arc(x, y, TOKEN_R + 8 + pulse * 5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 248, 200, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  drawToken(x, y, color, plane, legal) {
    const ctx = this.ctx;
    const r = TOKEN_R;
    const finished = plane.loc === "finished";
    const base = finished ? shade(PIP_COLORS[color], -0.38) : PIP_COLORS[color];
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.ellipse(2.2, 3.2, r * 0.96, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 12, 6, 0.32)";
    ctx.fill();

    const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.12, 0, 0, r);
    g.addColorStop(0, shade(base, 0.28));
    g.addColorStop(0.55, base);
    g.addColorStop(1, shade(base, -0.28));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#1b120b";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r - 3.6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 248, 232, 0.42)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (finished) {
      ctx.fillStyle = "#fff8e8";
      ctx.font = "800 13px 'Noto Sans TC', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("完", 0, 1);
    } else {
      ctx.save();
      ctx.translate(0, -4);
      drawPlaneMark(ctx, r);
      ctx.restore();
      ctx.fillStyle = "rgba(27, 18, 11, 0.78)";
      ctx.font = "800 10px 'Noto Sans TC', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(plane.id + 1), 0, r * 0.52);
    }

    if (legal) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlaneMark(ctx, r) {
  const s = r / 24;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "#fff8e8";
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(6.2, 3.2);
  ctx.lineTo(1.8, 1.4);
  ctx.lineTo(3.2, 10);
  ctx.lineTo(0, 7.2);
  ctx.lineTo(-3.2, 10);
  ctx.lineTo(-1.8, 1.4);
  ctx.lineTo(-6.2, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(27, 18, 11, 0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
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
