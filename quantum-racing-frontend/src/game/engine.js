// Race simulation. Pure game logic: no DOM, no rendering.
//
// The car lives on a 3-lane road (lanes 0, 1, 2). Normally it is in exactly one
// lane. Splitting puts it into a superposition of neighbouring lanes, each
// branch carrying a probability. Walls act as measurements: any branch inside
// a wall is projected out and the remaining probability is renormalised. If no
// branch survives, the car crashes. Observer gates force a full (random,
// probability-weighted) collapse.

export const LANE_COUNT = 3;
export const LANE_WIDTH = 3.4; // metres, used by the renderer
export const VIEW_DISTANCE = 190; // metres ahead that rows are spawned/visible
export const SECTOR_LENGTH = 1200;

export const DIFFICULTIES = {
  relaxed: { label: 'Relaxed', v0: 24, vMax: 46, gap: 1.2, hull: 4, drain: 0.26 },
  standard: { label: 'Standard', v0: 28, vMax: 58, gap: 1.0, hull: 3, drain: 0.32 },
  hard: { label: 'Hard', v0: 34, vMax: 70, gap: 0.86, hull: 3, drain: 0.38 },
};

const SPLIT_COST = 0.12;
const SPLIT_MIN = 0.25;
const REGEN_PER_SEC = 0.045;
const ORB_CHARGE = 0.22;
const TILT_STRENGTH = 0.8;
const MIN_BRANCH_P = 0.04;
const MAX_MULT = 5;
const INVULN_TIME = 1.5;

const POINTS_PER_METRE = 0.5;
const DODGE_POINTS = 150;
const ORB_POINTS = 50;
const GATE_POINTS = 100;

const DOUBLE_CHANCE = [0.3, 0.45, 0.55, 0.62, 0.68];

// First-run rows: teach steering, then a couple of double walls where
// splitting is the obvious answer.
const TUTORIAL_ROWS = [
  { blocked: [1], gap: 2.0 },
  { blocked: [0], gap: 1.8 },
  { blocked: [2], gap: 1.8, orb: 1 },
  { blocked: [0, 1], gap: 2.2 },
  { blocked: [1, 2], gap: 2.0 },
  { blocked: [0, 2], gap: 1.8 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export class Race {
  constructor({ difficulty = 'standard', tutorial = false, autopilot = false, seed = Date.now() } = {}) {
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 'standard';
    this.cfg = DIFFICULTIES[this.difficulty];
    this.rand = mulberry32(seed);
    this.tutorial = tutorial;
    this.autopilot = autopilot;

    this.t = 0;
    this.dist = 0;
    this.v = this.cfg.v0 * 0.55;
    this.sector = 1;
    this.curve = 0;
    this.heading = 0;

    this.lane = 1;
    this.x = 1;
    this.branches = [{ lane: 1, p: 1 }];
    this.split = false;
    this.splitAge = 0;
    this.coherence = 1;

    this.maxHull = this.cfg.hull;
    this.hull = this.cfg.hull;
    this.invuln = 0;

    this.score = 0;
    this.mult = 1;
    this.stats = { dodges: 0, splits: 0, orbs: 0, observed: 0, hits: 0, maxMult: 1 };

    this.rows = [];
    this.rowId = 0;
    this.nextRowAt = 95;
    this.gateCooldown = 6;
    this.lastKey = '';
    this.lastWasGate = false;
    this.scripted = tutorial ? TUTORIAL_ROWS.map((r) => ({ ...r })) : [];
    this.hinted = new Set();

    this.events = [];
    this.particles = [];
    this.shake = 0;
    this.hitFlash = 0;
    this.collapseFlash = 0;

    this.over = false;
    this.finished = false;
    this.deathTime = 0;
  }

  // ---------------------------------------------------------------- input

  steer(dir) {
    if (this.over) return;
    if (this.split) {
      this.tilt(dir);
      return;
    }
    const next = clamp(this.lane + dir, 0, LANE_COUNT - 1);
    if (next !== this.lane) {
      this.lane = next;
      this.emit('steer');
    }
  }

  toggleSplit() {
    if (this.over) return;
    if (this.split) {
      // Deliberate observation: collapse to the most likely branch.
      let best = this.branches[0];
      for (const b of this.branches) {
        if (b.p > best.p + 1e-6 || (Math.abs(b.p - best.p) < 1e-6 && b.lane === this.lane)) best = b;
      }
      this.collapseTo(best.lane, 'observe');
      return;
    }
    if (this.coherence < SPLIT_MIN) {
      this.emit('nocharge');
      return;
    }
    this.coherence -= SPLIT_COST;
    this.x = this.lane;
    const lanes = [this.lane - 1, this.lane, this.lane + 1].filter((l) => l >= 0 && l < LANE_COUNT);
    this.branches = lanes.map((lane) => ({ lane, p: 1 / lanes.length }));
    this.split = true;
    this.splitAge = 0;
    this.stats.splits += 1;
    this.emit('split', { lanes });
  }

  tilt(dir) {
    let next = this.branches.map((b) => ({ lane: b.lane, p: b.p * Math.exp(TILT_STRENGTH * dir * (b.lane - 1)) }));
    next = normalise(next).filter((b) => b.p >= MIN_BRANCH_P);
    next = normalise(next);
    if (next.length === 1) {
      this.collapseTo(next[0].lane, 'observe');
    } else {
      this.branches = next;
      this.emit('tilt', { dir });
    }
  }

  // ---------------------------------------------------------------- update

  step(rawDt) {
    let dt = Math.min(rawDt, 0.05);
    if (this.over) {
      this.deathTime += dt;
      dt *= Math.max(0.15, 1 - this.deathTime * 1.4);
      if (this.deathTime > 1.5 && !this.finished) {
        this.finished = true;
        this.emit('gameover');
      }
    }
    this.t += dt;

    const target = this.over ? 0 : this.baseSpeed(this.dist);
    this.v += (target - this.v) * Math.min(1, dt * (this.over ? 2 : 0.8));
    this.dist += this.v * dt;

    const sector = Math.floor(this.dist / SECTOR_LENGTH) + 1;
    if (sector !== this.sector && !this.over) {
      this.sector = sector;
      this.emit('sector', { sector, note: sectorNote(sector) });
    }

    this.curve = 0.0007 * Math.sin(this.dist / 820) * (0.55 + 0.45 * Math.sin(this.dist / 310 + 1.3));
    this.heading += this.curve * this.v * dt * 900;

    this.x += (this.lane - this.x) * Math.min(1, dt * 16);
    if (this.autopilot) this.drive();

    if (this.split) {
      this.splitAge += dt;
      this.coherence -= this.cfg.drain * dt;
      if (this.coherence <= 0) {
        this.coherence = 0;
        this.collapseRandom('decohere');
      }
    } else {
      this.coherence = Math.min(1, this.coherence + REGEN_PER_SEC * dt);
    }
    this.invuln = Math.max(0, this.invuln - dt);

    while (this.nextRowAt < this.dist + VIEW_DISTANCE) this.spawnNext();

    for (const row of this.rows) {
      if (!row.resolved && row.at <= this.dist) {
        row.resolved = true;
        if (!this.over) this.resolve(row);
      }
    }
    this.rows = this.rows.filter((r) => r.at > this.dist - 14);

    if (!this.over) this.score += this.v * dt * POINTS_PER_METRE * this.mult;

    this.checkHints();
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    this.collapseFlash = Math.max(0, this.collapseFlash - dt * 3);
  }

  baseSpeed(d) {
    return this.cfg.v0 + (this.cfg.vMax - this.cfg.v0) * (1 - Math.exp(-d / 4200));
  }

  sectorAt(d) {
    return Math.floor(d / SECTOR_LENGTH) + 1;
  }

  // ---------------------------------------------------------------- track generation

  spawnNext() {
    const at = this.nextRowAt;
    const speed = this.baseSpeed(at);

    if (this.scripted.length) {
      const r = this.scripted.shift();
      this.addRow({ type: 'walls', at, blocked: r.blocked, orbs: r.orb !== undefined ? [r.orb] : [] });
      this.nextRowAt += r.gap * speed;
      return;
    }

    const sector = this.sectorAt(at);
    const pace = smooth(at / 7000);
    // Ramps over the first ~7 km, then keeps tightening slowly so every run ends eventually.
    const late = Math.max(0, (at - 7000) / 1000) * 0.012;
    const gapT = Math.max(0.46, lerp(1.3, 0.6, pace) - late) * this.cfg.gap;

    // Observer gate
    if (sector >= 2 && this.gateCooldown <= 0 && !this.lastWasGate && this.rand() < 0.4) {
      this.addRow({ type: 'gate', at });
      this.gateCooldown = 5 + Math.floor(this.rand() * 4);
      this.lastWasGate = true;
      this.nextRowAt += gapT * 1.45 * speed;
      return;
    }
    this.gateCooldown -= 1;

    // Tight pair: two double walls with open lanes on opposite edges.
    if (sector >= 2 && !this.lastWasGate && this.rand() < (sector >= 3 ? 0.16 : 0.08)) {
      const leftFirst = this.rand() < 0.5;
      this.addRow({ type: 'walls', at, blocked: leftFirst ? [1, 2] : [0, 1], orbs: [] });
      const at2 = at + (sector >= 3 ? 0.55 : 0.7) * speed * this.cfg.gap;
      this.addRow({ type: 'walls', at: at2, blocked: leftFirst ? [0, 1] : [1, 2], orbs: [] });
      this.lastWasGate = false;
      this.lastKey = '';
      this.nextRowAt = at2 + gapT * 1.2 * speed;
      return;
    }

    const doubleChance = DOUBLE_CHANCE[Math.min(sector - 1, DOUBLE_CHANCE.length - 1)];
    const isDouble = !this.lastWasGate && this.rand() < doubleChance;
    let blocked = this.pickBlocked(isDouble);
    if (blocked.join() === this.lastKey) blocked = this.pickBlocked(isDouble);
    this.lastKey = blocked.join();

    const open = [0, 1, 2].filter((l) => !blocked.includes(l));
    const orbs = this.rand() < 0.38 ? [open[Math.floor(this.rand() * open.length)]] : [];
    this.addRow({ type: 'walls', at, blocked, orbs });

    // Occasional photon between rows.
    if (this.rand() < 0.28) {
      this.addRow({ type: 'walls', at: at + gapT * speed * 0.5, blocked: [], orbs: [Math.floor(this.rand() * 3)] });
    }

    this.lastWasGate = false;
    this.nextRowAt += gapT * speed;
  }

  pickBlocked(isDouble) {
    if (isDouble) {
      const open = Math.floor(this.rand() * 3);
      return [0, 1, 2].filter((l) => l !== open);
    }
    return [Math.floor(this.rand() * 3)];
  }

  addRow(row) {
    this.rowId += 1;
    this.rows.push({ id: this.rowId, resolved: false, orbsTaken: [], blocked: [], orbs: [], ...row });
    this.rows.sort((a, b) => a.at - b.at);
  }

  // ---------------------------------------------------------------- resolution

  resolve(row) {
    if (row.type === 'gate') {
      if (this.split && !this.autopilot) {
        this.stats.observed += 1;
        this.collapseRandom('observed');
      } else if (!this.autopilot) {
        this.score += GATE_POINTS * this.mult;
        this.emit('gateclear', { points: GATE_POINTS * this.mult });
      }
      return;
    }

    // Photons: in superposition you collect them in every lane you occupy.
    for (const lane of row.orbs) {
      const got = this.split
        ? this.branches.some((b) => b.lane === lane)
        : Math.abs(this.x - lane) < 0.5;
      if (got) {
        row.orbsTaken.push(lane);
        this.coherence = Math.min(1, this.coherence + ORB_CHARGE);
        this.stats.orbs += 1;
        this.score += ORB_POINTS * this.mult;
        this.burst(lane, 'quantum', 10, 0.9);
        this.emit('orb', { points: ORB_POINTS * this.mult });
      }
    }

    if (!row.blocked.length) return;

    if (this.split) {
      const alive = this.branches.filter((b) => !row.blocked.includes(b.lane));
      const dead = this.branches.filter((b) => row.blocked.includes(b.lane));
      if (!alive.length) {
        const b = this.pickWeighted(this.branches);
        this.collapseTo(b.lane, 'crash');
        this.hit(b.lane);
        return;
      }
      if (dead.length) {
        for (const b of dead) this.burst(b.lane, 'quantum', 14, 0.6);
        this.branches = normalise(alive);
        this.mult = Math.min(MAX_MULT, this.mult + 1);
        this.stats.maxMult = Math.max(this.stats.maxMult, this.mult);
        this.stats.dodges += 1;
        const points = DODGE_POINTS * this.mult;
        this.score += points;
        this.emit('dodge', { points, mult: this.mult });
        if (this.branches.length === 1) this.collapseTo(this.branches[0].lane, 'dodge');
      }
      return;
    }

    if (this.invuln > 0) return;
    const hitLane = row.blocked.find((l) => Math.abs(this.x - l) < 0.55);
    if (hitLane !== undefined) this.hit(hitLane);
    else this.emit('pass');
  }

  hit(lane) {
    if (this.autopilot) return;
    if (this.invuln > 0) return;
    this.hull -= 1;
    this.stats.hits += 1;
    this.mult = 1;
    this.invuln = INVULN_TIME;
    this.v *= 0.6;
    this.shake = 1;
    this.hitFlash = 1;
    this.burst(lane, 'danger', 26, 1.4);
    if (this.hull <= 0) {
      this.hull = 0;
      this.over = true;
      this.burst(lane, 'danger', 40, 2.2);
      this.emit('crash');
    } else {
      this.emit('hit', { hull: this.hull });
    }
  }

  collapseTo(lane, reason) {
    for (const b of this.branches) if (b.lane !== lane) this.burst(b.lane, 'quantum', 8, 0.5);
    this.lane = lane;
    this.x = lane;
    this.branches = [{ lane, p: 1 }];
    this.split = false;
    this.splitAge = 0;
    this.collapseFlash = 1;
    if (reason !== 'crash') this.emit('collapse', { reason, lane });
  }

  collapseRandom(reason) {
    const b = this.pickWeighted(this.branches);
    this.collapseTo(b.lane, reason);
  }

  pickWeighted(branches) {
    let r = this.rand();
    for (const b of branches) {
      r -= b.p;
      if (r <= 0) return b;
    }
    return branches[branches.length - 1];
  }

  // ---------------------------------------------------------------- attract-mode driver

  drive() {
    const next = this.rows.find((r) => !r.resolved && r.blocked.length && r.at - this.dist < 40);
    if (!next) {
      if (this.split && this.splitAge > 1.2) this.toggleSplit();
      return;
    }
    if (!this.split && next.blocked.length === 2 && this.lane === 1 && this.coherence > 0.6 && this.rand() < 0.02) {
      this.toggleSplit();
      return;
    }
    if (!this.split && next.blocked.includes(this.lane)) {
      const open = [0, 1, 2].filter((l) => !next.blocked.includes(l));
      open.sort((a, b) => Math.abs(a - this.lane) - Math.abs(b - this.lane));
      this.lane = open[0];
    }
  }

  // ---------------------------------------------------------------- hints

  checkHints() {
    if (!this.tutorial || this.over) return;
    const hint = (id) => {
      if (this.hinted.has(id)) return;
      this.hinted.add(id);
      this.emit('hint', { id });
    };
    if (this.t > 0.6) hint('steer');
    const doubleAhead = this.rows.find((r) => !r.resolved && r.blocked.length === 2 && r.at - this.dist < 85);
    if (doubleAhead && !this.split) hint('split');
    if (this.split && this.splitAge > 0.35) hint('tilt');
    const gateAhead = this.rows.find((r) => !r.resolved && r.type === 'gate' && r.at - this.dist < 110);
    if (gateAhead) hint('observer');
  }

  // ---------------------------------------------------------------- fx

  burst(lane, kind, count, power) {
    for (let i = 0; i < count; i += 1) {
      const a = this.rand() * Math.PI * 2;
      const sp = (0.5 + this.rand()) * 4 * power;
      this.particles.push({
        x: (lane - 1) * LANE_WIDTH + (this.rand() - 0.5) * 1.2,
        y: 0.4 + this.rand() * 0.8,
        z: (this.rand() - 0.2) * 1.5,
        vx: Math.cos(a) * sp,
        vy: Math.abs(Math.sin(a)) * sp * 0.9 + 1,
        vz: (this.rand() - 0.5) * sp,
        life: 0.5 + this.rand() * 0.5,
        max: 1,
        kind,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      p.z += p.vz * dt - this.v * dt * 0.35;
      p.vy -= 9 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot() {
    return {
      score: Math.floor(this.score),
      dist: Math.floor(this.dist),
      speed: Math.round(this.v * 3.6),
      hull: this.hull,
      maxHull: this.maxHull,
      mult: this.mult,
      coherence: this.coherence,
      split: this.split,
      branches: this.branches.map((b) => ({ ...b })),
      sector: this.sector,
      canSplit: this.coherence >= SPLIT_MIN,
      over: this.over,
    };
  }

  results() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.dist),
      difficulty: this.difficulty,
      sector: this.sector,
      ...this.stats,
    };
  }
}

function normalise(branches) {
  const total = branches.reduce((s, b) => s + b.p, 0) || 1;
  return branches.map((b) => ({ lane: b.lane, p: b.p / total }));
}

function sectorNote(sector) {
  if (sector === 2) return 'Observer gates ahead';
  if (sector === 3) return 'Tight pairs ahead';
  return 'Faster';
}

export const SPLIT_THRESHOLD = SPLIT_MIN;
