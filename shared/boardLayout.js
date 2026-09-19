/** Shared CSS-pixel board geometry for 黑白棋 (cells) and 圍棋／五子棋 (intersections). */

export function boardLayout(kind, size, width, height) {
  const w = Number(width);
  const h = Number(height);
  const side = Math.min(w, h);
  const ox = (w - side) / 2;
  const oy = (h - side) / 2;
  if (kind === "othello") {
    const pad = Math.max(6, side * 0.028);
    const cell = (side - pad * 2) / size;
    return { kind, size, w, h, side, ox, oy, pad, cell, gap: cell, mode: "cells" };
  }
  const pad = side / (size + 1);
  const gap = size === 1 ? 0 : (side - pad * 2) / (size - 1);
  return { kind, size, w, h, side, ox, oy, pad, cell: gap, gap, mode: "lines" };
}

export function cellCenter(layout, x, y) {
  if (layout.mode === "cells") {
    return {
      x: layout.ox + layout.pad + (x + 0.5) * layout.cell,
      y: layout.oy + layout.pad + (y + 0.5) * layout.cell,
    };
  }
  return {
    x: layout.ox + layout.pad + x * layout.gap,
    y: layout.oy + layout.pad + y * layout.gap,
  };
}

export function hitCell(layout, px, py) {
  if (!layout) return null;
  if (layout.mode === "cells") {
    const x = Math.floor((px - layout.ox - layout.pad) / layout.cell);
    const y = Math.floor((py - layout.oy - layout.pad) / layout.cell);
    if (x < 0 || y < 0 || x >= layout.size || y >= layout.size) return null;
    return { x, y };
  }
  const x = Math.round((px - layout.ox - layout.pad) / layout.gap);
  const y = Math.round((py - layout.oy - layout.pad) / layout.gap);
  if (x < 0 || y < 0 || x >= layout.size || y >= layout.size) return null;
  const c = cellCenter(layout, x, y);
  const lim = Math.max(10, layout.gap * 0.48);
  if (Math.hypot(px - c.x, py - c.y) > lim) return null;
  return { x, y };
}

export function eventOffset(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { px: event.clientX - rect.left, py: event.clientY - rect.top, rect };
}
