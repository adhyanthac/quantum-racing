// Canvas renderer: pseudo-3D road, obstacles, car and branch ghosts.
import { LANE_WIDTH, VIEW_DISTANCE } from './engine';

const Z_OFF = 6.5; // camera distance behind the car (m)
const ROAD_HALF = LANE_WIDTH * 1.5;
const RUMBLE = 0.6;
const SEG = 2;

const C = {
  skyTop: [10, 11, 15],
  skyLow: [34, 33, 40],
  glow: [92, 64, 56],
  fog: [30, 30, 36],
  groundA: [19, 21, 25],
  groundB: [23, 25, 30],
  roadA: [38, 40, 46],
  roadB: [41, 43, 49],
  rumbleA: [196, 72, 48],
  rumbleB: [222, 217, 205],
  paint: [222, 217, 205],
  danger: [255, 98, 58],
  dangerDark: [150, 46, 22],
  observer: [242, 214, 92],
  quantum: [143, 211, 255],
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function ridge(seed, count, amp) {
  const pts = [];
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i += 1) pts.push(r() * amp);
  // smooth
  return pts.map((_, i) => (pts[(i - 1 + count) % count] + pts[i] * 2 + pts[(i + 1) % count]) / 4);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let horizon = 0;
  let f = 1;
  let camH = 1;
  let cx = 0;
  let sky = null;
  let vignette = null;

  const far = ridge(7, 48, 1);
  const near = ridge(113, 36, 1);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const portrait = h > w;
    horizon = h * (portrait ? 0.36 : 0.42);
    const carY = h * (portrait ? 0.8 : 0.86);
    const roadHalfPx = Math.min(w * 0.46, h * 0.5);
    f = (roadHalfPx * Z_OFF) / (ROAD_HALF + RUMBLE);
    camH = ((carY - horizon) * Z_OFF) / f;
    cx = w / 2;

    sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgb(C.skyTop));
    sky.addColorStop(0.7, rgb(C.skyLow));
    sky.addColorStop(1, rgb(mix(C.skyLow, C.glow, 0.55)));

    vignette = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  }

  function draw(game, { carColor = '#e8e4da', shake = true } = {}) {
    if (!w) resize();
    const body = hexToRgb(carColor);

    // Camera follows the car loosely so lane changes feel physical.
    const focusX = game.split
      ? game.branches.reduce((s, b) => s + b.lane * b.p, 0)
      : game.x;
    const camX = (focusX - 1) * LANE_WIDTH * 0.32;
    const curve = game.curve;
    const curveAt = (z) => (z > 0 ? curve * z * z : 0);

    const project = (xw, yw, z) => {
      const zc = z + Z_OFF;
      const s = f / zc;
      return [cx + (xw + curveAt(z) - camX) * s, horizon + (camH - yw) * s, s];
    };

    ctx.save();
    if (shake && game.shake > 0) {
      const m = game.shake * game.shake * 10;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }

    // --- sky
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, w + 40, horizon + 21);

    // moon
    const span = w * 1.6;
    const mx = ((((w * 0.8 - game.heading * 0.05 + w * 0.3) % span) + span) % span) - w * 0.3;
    ctx.fillStyle = 'rgba(236,230,214,0.06)';
    ctx.beginPath();
    ctx.arc(mx, horizon * 0.34, Math.min(w, h) * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(236,230,214,0.85)';
    ctx.beginPath();
    ctx.arc(mx, horizon * 0.34, Math.min(w, h) * 0.035, 0, Math.PI * 2);
    ctx.fill();

    drawRidge(far, horizon, h * 0.09, game.heading * 0.12, rgb([26, 26, 33]));
    drawRidge(near, horizon, h * 0.05, game.heading * 0.3, rgb([20, 21, 26]));

    // --- ground base
    ctx.fillStyle = rgb(mix(C.groundA, C.fog, 0.4));
    ctx.fillRect(-20, horizon, w + 40, h - horizon + 20);

    // --- road segments, far to near
    const kFar = Math.floor((game.dist + VIEW_DISTANCE) / SEG);
    const kNear = Math.floor((game.dist - Z_OFF + 0.8) / SEG);
    for (let k = kFar; k >= kNear; k -= 1) {
      const zFar = (k + 1) * SEG - game.dist;
      let zNear = k * SEG - game.dist;
      if (zNear < -Z_OFF + 0.8) zNear = -Z_OFF + 0.8;
      if (zFar <= zNear) continue;
      const fogT = Math.pow(clamp01((zNear - 25) / (VIEW_DISTANCE - 25)), 1.25);

      const a = project(0, 0, zFar);
      const b = project(0, 0, zNear);
      const sa = a[2];
      const sb = b[2];

      const band = Math.floor((k * SEG) / 6) % 2 === 0;
      ctx.fillStyle = rgb(mix(band ? C.groundA : C.groundB, C.fog, fogT));
      ctx.fillRect(-20, a[1], w + 40, b[1] - a[1] + 1);

      const rumbleOuter = ROAD_HALF + RUMBLE;
      quad(a[0], a[1], sa, b[0], b[1], sb, -rumbleOuter, rumbleOuter, rgb(mix(k % 2 ? C.rumbleA : C.rumbleB, C.fog, fogT)));
      quad(a[0], a[1], sa, b[0], b[1], sb, -ROAD_HALF, ROAD_HALF, rgb(mix(band ? C.roadA : C.roadB, C.fog, fogT)));

      // lane dashes: 4m on, 8m off
      if (Math.floor(k / 2) % 3 === 0) {
        const paint = rgb(mix(C.paint, C.fog, fogT), 0.75);
        const dw = 0.12;
        quad(a[0], a[1], sa, b[0], b[1], sb, -LANE_WIDTH / 2 - dw, -LANE_WIDTH / 2 + dw, paint);
        quad(a[0], a[1], sa, b[0], b[1], sb, LANE_WIDTH / 2 - dw, LANE_WIDTH / 2 + dw, paint);
      }
      // solid edge lines
      const edge = rgb(mix(C.paint, C.fog, fogT), 0.55);
      quad(a[0], a[1], sa, b[0], b[1], sb, -ROAD_HALF + 0.15, -ROAD_HALF + 0.3, edge);
      quad(a[0], a[1], sa, b[0], b[1], sb, ROAD_HALF - 0.3, ROAD_HALF - 0.15, edge);
    }

    // horizon haze
    const haze = ctx.createLinearGradient(0, horizon - h * 0.04, 0, horizon + h * 0.06);
    haze.addColorStop(0, rgb(C.fog, 0));
    haze.addColorStop(0.5, rgb(mix(C.fog, C.glow, 0.25), 0.7));
    haze.addColorStop(1, rgb(C.fog, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - h * 0.04, w, h * 0.1);

    // --- objects, sorted far to near (the car sits at z = 0)
    const items = [];
    for (const row of game.rows) {
      const z = row.at - game.dist;
      if (z > VIEW_DISTANCE || z < -Z_OFF + 1) continue;
      if (row.type === 'gate') items.push({ z, fn: () => drawGate(z, game.t, project) });
      else {
        for (const lane of row.blocked) items.push({ z: z + 0.01, fn: () => drawWall(lane, z, project, game.t) });
        for (const lane of row.orbs) {
          if (row.orbsTaken.includes(lane)) continue;
          items.push({ z, fn: () => drawOrb(lane, z, game.t + row.id, project) });
        }
      }
    }
    items.push({ z: 0, fn: () => drawPlayer(game, project, body) });
    items.sort((p, q) => q.z - p.z);
    for (const it of items) it.fn();

    // particles
    for (const p of game.particles) {
      if (p.z < -3.5) continue;
      const [sx, sy, s] = project(p.x, p.y, p.z);
      const col = p.kind === 'danger' ? C.danger : C.quantum;
      const size = Math.min(7, Math.max(1.5, 0.1 * s));
      ctx.fillStyle = rgb(col, clamp01(p.life * 1.6));
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    ctx.restore();

    // overlays
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    if (game.hitFlash > 0) {
      ctx.fillStyle = rgb(C.danger, game.hitFlash * 0.22);
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ------------------------------------------------------------- primitives

  function quad(ax, ay, sa, bx, by, sb, x0, x1, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(ax + x0 * sa, ay);
    ctx.lineTo(ax + x1 * sa, ay);
    ctx.lineTo(bx + x1 * sb, by + 0.5);
    ctx.lineTo(bx + x0 * sb, by + 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function poly(pts, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function drawRidge(pts, base, amp, offset, fill) {
    const n = pts.length;
    const span = w * 1.5;
    const step = span / n;
    const shift = ((offset % span) + span) % span;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-step, base + 1);
    for (let i = -1; i <= n * 1.2 + 2; i += 1) {
      const x = i * step - shift + step;
      const idx = ((i % n) + n) % n;
      ctx.lineTo(x, base - pts[idx] * amp - amp * 0.15);
    }
    ctx.lineTo(w + step * 2, base + 1);
    ctx.closePath();
    ctx.fill();
  }

  // Fade in at the horizon and out once an object is behind the car.
  function fade(z) {
    if (z < 0) return clamp01(1 + z / 2.2);
    return clamp01((VIEW_DISTANCE - z) / 30);
  }

  function drawWall(lane, z, project, t) {
    const xc = (lane - 1) * LANE_WIDTH;
    const hw = LANE_WIDTH * 0.42;
    const H = 1.15;
    const D = 0.9;
    const fogT = Math.pow(clamp01((z - 25) / (VIEW_DISTANCE - 25)), 1.1);
    const alpha = fade(z);
    if (alpha <= 0) return;

    const ftl = project(xc - hw, H, z);
    const ftr = project(xc + hw, H, z);
    const fbl = project(xc - hw, 0, z);
    const fbr = project(xc + hw, 0, z);
    const btl = project(xc - hw, H, z + D);
    const btr = project(xc + hw, H, z + D);
    const bbl = project(xc - hw, 0, z + D);
    const bbr = project(xc + hw, 0, z + D);
    const s = ftl[2];

    ctx.globalAlpha = alpha;
    // shadow
    poly([fbl, fbr, project(xc + hw + 0.3, 0, z - 0.6), project(xc - hw - 0.3, 0, z - 0.6)], 'rgba(0,0,0,0.28)');

    // visible side face
    const side = rgb(mix(C.dangerDark, C.fog, fogT));
    if (fbl[0] > cx) poly([ftl, btl, bbl, fbl], side);
    if (fbr[0] < cx) poly([ftr, btr, bbr, fbr], side);
    // top
    poly([ftl, ftr, btr, btl], rgb(mix([255, 150, 110], C.fog, fogT)));
    // front
    const front = rgb(mix(C.danger, C.fog, fogT));
    poly([ftl, ftr, fbr, fbl], front);

    // chevron stripes
    if (s > 7) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ftl[0], ftl[1], ftr[0] - ftl[0], fbl[1] - ftl[1]);
      ctx.clip();
      ctx.fillStyle = rgb(mix([24, 20, 20], C.fog, fogT), 0.85);
      const fw = ftr[0] - ftl[0];
      const fh = fbl[1] - ftl[1];
      const band = 0.38 * s;
      const dir = lane === 0 ? 1 : lane === 2 ? -1 : 1;
      for (let x = -fh; x < fw + fh; x += band * 2) {
        ctx.beginPath();
        ctx.moveTo(ftl[0] + x, ftl[1] + fh * 0.18);
        ctx.lineTo(ftl[0] + x + band, ftl[1] + fh * 0.18);
        ctx.lineTo(ftl[0] + x + band + dir * fh * 0.64, ftl[1] + fh * 0.82);
        ctx.lineTo(ftl[0] + x + dir * fh * 0.64, ftl[1] + fh * 0.82);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // beacon
      if (Math.sin(t * 9 + lane) > 0) {
        const bx = (ftl[0] + ftr[0]) / 2;
        ctx.fillStyle = rgb([255, 200, 120], 0.9);
        ctx.fillRect(bx - 0.12 * s, ftl[1] - 0.14 * s, 0.24 * s, 0.1 * s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawGate(z, t, project) {
    const alpha = fade(z);
    if (alpha <= 0) return;
    const fogT = Math.pow(clamp01((z - 25) / (VIEW_DISTANCE - 25)), 1.1);
    const col = mix(C.observer, C.fog, fogT);
    const x = ROAD_HALF + 0.5;
    const H = 3.6;
    const post = 0.35;

    ctx.globalAlpha = alpha;
    // light curtain
    const tl = project(-x, H, z);
    const tr = project(x, H, z);
    const bl = project(-x, 0, z);
    const br = project(x, 0, z);
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    poly([tl, tr, br, bl], rgb(col, 0.05 + 0.04 * pulse));
    // scan line on road
    poly([project(-x, 0, z - 0.25), project(x, 0, z - 0.25), project(x, 0, z + 0.25), project(-x, 0, z + 0.25)], rgb(col, 0.45 + 0.35 * pulse));
    // posts
    for (const sx of [-x, x - post]) {
      poly([project(sx, H, z), project(sx + post, H, z), project(sx + post, 0, z), project(sx, 0, z)], rgb(mix(col, [40, 36, 20], 0.35)));
    }
    // beam
    const b0 = project(-x, H + 0.45, z);
    const b1 = project(x, H, z);
    ctx.fillStyle = rgb(col);
    ctx.fillRect(b0[0], b0[1], b1[0] - b0[0], b1[1] - b0[1]);
    const s = b0[2];
    if (s > 9) {
      ctx.fillStyle = rgb([20, 18, 10], 0.9);
      ctx.font = `700 ${Math.max(8, 0.3 * s)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O B S E R V E R', (b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawOrb(lane, z, t, project) {
    const alpha = fade(z);
    if (alpha <= 0) return;
    const [sx, sy, s] = project((lane - 1) * LANE_WIDTH, 0.95 + Math.sin(t * 3) * 0.12, z);
    const r = 0.34 * s;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.2);
    g.addColorStop(0, rgb(C.quantum, 0.45));
    g.addColorStop(1, rgb(C.quantum, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
    const wx = r * (0.35 + 0.65 * Math.abs(Math.cos(t * 2.2)));
    ctx.fillStyle = rgb([226, 244, 255]);
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + wx, sy);
    ctx.lineTo(sx, sy + r);
    ctx.lineTo(sx - wx, sy);
    ctx.closePath();
    ctx.fill();
    // ground dot
    const [gx, gy, gs] = project((lane - 1) * LANE_WIDTH, 0, z);
    ctx.fillStyle = rgb(C.quantum, 0.18);
    ctx.beginPath();
    ctx.ellipse(gx, gy, 0.5 * gs, 0.12 * gs, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlayer(game, project, body) {
    if (game.split) {
      const pts = game.branches.map((b) => ({ b, p: project((b.lane - 1) * LANE_WIDTH, 0, 0) }));
      // interference line linking branches
      if (pts.length > 1) {
        const first = pts[0].p;
        const last = pts[pts.length - 1].p;
        const y = first[1] - 0.55 * first[2];
        ctx.strokeStyle = rgb(C.quantum, 0.4);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const span = last[0] - first[0];
        for (let i = 0; i <= 80; i += 1) {
          const u = i / 80;
          const xx = first[0] + span * u;
          const yy = y + Math.sin(u * Math.PI * 9 - game.t * 14) * 5 * Math.sin(u * Math.PI);
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      const flicker = game.coherence < 0.2 ? 0.55 + 0.45 * Math.sin(game.t * 40) : 1;
      for (const { b, p } of pts) {
        drawCar(p[0], p[1], p[2], mix(body, C.quantum, 0.82), (0.16 + 0.84 * b.p) * flicker, true, 0, false, b.p);
        ctx.font = `600 ${Math.max(11, 0.26 * p[2])}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = rgb([226, 244, 255], 0.5 + 0.5 * b.p);
        ctx.fillText(`${Math.round(b.p * 100)}%`, p[0], p[1] + 0.18 * p[2]);
      }
      return;
    }
    const [sx, sy, s] = project((game.x - 1) * LANE_WIDTH, 0, 0);
    const blink = game.invuln > 0 && Math.floor(game.t * 14) % 2 === 0;
    const tiltAmt = (game.lane - game.x) * 0.12;
    drawCar(sx, sy, s, body, blink ? 0.35 : 1, false, tiltAmt, game.hitFlash > 0.3);
    if (game.collapseFlash > 0) {
      ctx.strokeStyle = rgb(C.quantum, game.collapseFlash * 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy - 0.5 * s, (1.4 + (1 - game.collapseFlash) * 1.6) * s, (0.6 + (1 - game.collapseFlash) * 0.6) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Rear view of an open-wheel car. (sx, sy) is the road contact point.
  function drawCar(sx, sy, s, color, alpha, ghost, lean = 0, brake = false, glow = 0) {
    const m = (v) => v * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ghost) {
      ctx.shadowColor = rgb(C.quantum, 0.9);
      ctx.shadowBlur = 6 + 18 * glow;
    }
    ctx.translate(sx, sy);
    ctx.transform(1, 0, lean, 1, 0, 0);

    if (!ghost) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(0, 0, m(1.15), m(0.16), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const tire = ghost ? rgb(mix(color, [10, 20, 30], 0.6)) : '#111214';
    const bodyCol = rgb(color);
    const dark = rgb(mix(color, [8, 8, 10], 0.55));
    const darker = rgb(mix(color, [8, 8, 10], 0.78));

    // tyres
    ctx.fillStyle = tire;
    roundRect(-m(1.0), -m(0.62), m(0.4), m(0.62), m(0.06));
    roundRect(m(0.6), -m(0.62), m(0.4), m(0.62), m(0.06));
    if (!ghost) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(-m(0.96), -m(0.58), m(0.06), m(0.54));
      ctx.fillRect(m(0.64), -m(0.58), m(0.06), m(0.54));
    }

    // diffuser
    ctx.fillStyle = ghost ? dark : '#17181b';
    ctx.beginPath();
    ctx.moveTo(-m(0.58), -m(0.1));
    ctx.lineTo(m(0.58), -m(0.1));
    ctx.lineTo(m(0.5), -m(0.3));
    ctx.lineTo(-m(0.5), -m(0.3));
    ctx.closePath();
    ctx.fill();

    // body / sidepods
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-m(0.6), -m(0.28));
    ctx.lineTo(m(0.6), -m(0.28));
    ctx.lineTo(m(0.5), -m(0.6));
    ctx.lineTo(m(0.24), -m(0.72));
    ctx.lineTo(-m(0.24), -m(0.72));
    ctx.lineTo(-m(0.5), -m(0.6));
    ctx.closePath();
    ctx.fill();

    // engine cover / airbox
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-m(0.24), -m(0.7));
    ctx.lineTo(m(0.24), -m(0.7));
    ctx.lineTo(m(0.13), -m(1.0));
    ctx.lineTo(-m(0.13), -m(1.0));
    ctx.closePath();
    ctx.fill();

    // helmet
    ctx.fillStyle = ghost ? rgb(mix(color, [255, 255, 255], 0.4)) : '#e9e6df';
    ctx.beginPath();
    ctx.arc(0, -m(1.0), m(0.12), Math.PI, 0);
    ctx.fill();

    // rear wing
    ctx.fillStyle = darker;
    ctx.fillRect(-m(0.05), -m(1.05), m(0.1), m(0.4));
    ctx.fillStyle = ghost ? bodyCol : '#141518';
    ctx.fillRect(-m(0.78), -m(1.18), m(1.56), m(0.16));
    ctx.fillStyle = bodyCol;
    ctx.fillRect(-m(0.78), -m(1.18), m(1.56), m(0.04));
    ctx.fillStyle = darker;
    ctx.fillRect(-m(0.82), -m(1.24), m(0.06), m(0.36));
    ctx.fillRect(m(0.76), -m(1.24), m(0.06), m(0.36));

    // lights
    const lit = brake ? 1 : 0.75;
    ctx.fillStyle = ghost ? rgb([226, 244, 255], 0.8) : `rgba(255,64,48,${lit})`;
    ctx.fillRect(-m(0.06), -m(0.42), m(0.12), m(0.08));
    if (!ghost && brake) {
      ctx.fillStyle = 'rgba(255,64,48,0.25)';
      ctx.beginPath();
      ctx.arc(0, -m(0.38), m(0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    if (ghost) {
      ctx.strokeStyle = rgb([226, 244, 255], 0.55);
      ctx.lineWidth = 1;
      ctx.strokeRect(-m(0.78), -m(1.18), m(1.56), m(0.16));
    }

    ctx.restore();
  }

  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + ww - r, y);
    ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
    ctx.lineTo(x + ww, y + hh - r);
    ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
    ctx.lineTo(x + r, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  return { resize, draw };
}
