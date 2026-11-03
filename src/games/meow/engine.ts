/**
 * 喵星防线 · 逻辑引擎
 * 纯逻辑、不碰 DOM：页面负责输入与绘制，Node 里也能直接跑模拟
 */
import {
  BLOONS,
  TOWERS,
  computeStats,
  rbe,
  type BloonId,
  type DmgType,
  type TargetMode,
  type TowerDef,
  type TowerKind,
  type TowerStats,
  type Upgrade,
} from './data.ts';
import { FIELD_H, FIELD_W, buildPath, distToPath, posAt, type MapDef, type PathGeo } from './maps.ts';
import { TOTAL_WAVES, waveHpMul, waveSpawns, type Spawn } from './waves.ts';

/** 速度倍率 1 对应的像素速度 */
export const UNIT = 52;
export const START_MONEY = 700;
export const START_LIVES = 100;
export const SELL_RATE = 0.7;
const STEP = 1 / 60;

export interface Bloon {
  id: number;
  t: BloonId;
  d: number;
  hp: number;
  maxHp: number;
  camo: boolean;
  frozen: number;
  slow: number;
  slowF: number;
  x: number;
  y: number;
  ang: number;
  dead: boolean;
}

export interface Tower {
  id: number;
  def: TowerDef;
  x: number;
  y: number;
  tiers: [number, number];
  stats: TowerStats;
  cd: number;
  ang: number;
  target: TargetMode;
  spent: number;
  pops: number;
  /** 最近一次开火的时间，用于后坐动画 */
  shotAt: number;
}

export interface Proj {
  kind: TowerKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** 毛线球：剩余飞行距离，到点即炸 */
  travel: number;
  pierce: number;
  dmg: number;
  type: DmgType;
  bossDmg: number;
  splash: number;
  splashPierce: number;
  r: number;
  hit: Set<number>;
  src: Tower;
  dead: boolean;
}

export type GameEvent =
  | { k: 'pop'; x: number; y: number; t: BloonId }
  | { k: 'block'; x: number; y: number }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'tracer'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'pulse'; x: number; y: number; r: number }
  | { k: 'leak'; n: number; t: BloonId }
  | { k: 'waveStart'; wave: number }
  | { k: 'waveEnd'; wave: number; bonus: number }
  | { k: 'over' }
  | { k: 'win' };

export type GameState = 'build' | 'wave' | 'over' | 'won';

export type UpgradeCheck =
  | { state: 'max' }
  | { state: 'locked'; up: Upgrade }
  | { state: 'poor' | 'ok'; up: Upgrade; cost: number };

const TARGET_CYCLE: TargetMode[] = ['first', 'last', 'strong', 'close'];

export class MeowGame {
  map: MapDef;
  geo: PathGeo;
  bloons: Bloon[] = [];
  towers: Tower[] = [];
  projs: Proj[] = [];
  events: GameEvent[] = [];
  money = START_MONEY;
  lives = START_LIVES;
  wave = 0;
  pops = 0;
  time = 0;
  state: GameState = 'build';
  endless = false;
  auto = false;

  private queue: Spawn[] = [];
  private qi = 0;
  private waveTime = 0;
  private hpMul = 1;
  private nextId = 1;
  private acc = 0;

  constructor(map: MapDef) {
    this.map = map;
    this.geo = buildPath(map.points);
  }

  /* ---------------- 建造 ---------------- */

  canPlace(kind: TowerKind, x: number, y: number): boolean {
    const def = TOWERS[kind];
    const r = def.r;
    if (x < r || y < r || x > FIELD_W - r || y > FIELD_H - r) return false;
    if (distToPath(this.geo, x, y) < this.map.width / 2 + r - 3) return false;
    for (const t of this.towers) {
      if (Math.hypot(t.x - x, t.y - y) < t.def.r + r) return false;
    }
    return true;
  }

  place(kind: TowerKind, x: number, y: number): Tower | null {
    const def = TOWERS[kind];
    if (this.state === 'over' || this.money < def.cost || !this.canPlace(kind, x, y)) return null;
    this.money -= def.cost;
    const t: Tower = {
      id: this.nextId++,
      def,
      x,
      y,
      tiers: [0, 0],
      stats: computeStats(def, [0, 0]),
      cd: 0,
      ang: -Math.PI / 2,
      target: def.target,
      spent: def.cost,
      pops: 0,
      shotAt: -1,
    };
    this.towers.push(t);
    return t;
  }

  towerAt(x: number, y: number): Tower | null {
    for (const t of this.towers) {
      if (Math.hypot(t.x - x, t.y - y) <= t.def.r + 3) return t;
    }
    return null;
  }

  checkUpgrade(t: Tower, path: 0 | 1): UpgradeCheck {
    const tier = t.tiers[path];
    if (tier >= 3) return { state: 'max' };
    const up = t.def.paths[path][tier];
    // 两条路线不能同时升到第三级
    if (tier + 1 >= 3 && t.tiers[1 - path] >= 3) return { state: 'locked', up };
    return { state: this.money >= up.cost ? 'ok' : 'poor', up, cost: up.cost };
  }

  upgrade(t: Tower, path: 0 | 1): boolean {
    const c = this.checkUpgrade(t, path);
    if (c.state !== 'ok' || this.state === 'over') return false;
    this.money -= c.cost;
    t.spent += c.cost;
    t.tiers[path] += 1;
    t.stats = computeStats(t.def, t.tiers);
    return true;
  }

  sellValue(t: Tower): number {
    return Math.floor(t.spent * SELL_RATE);
  }

  sell(t: Tower): void {
    const i = this.towers.indexOf(t);
    if (i < 0 || this.state === 'over') return;
    this.towers.splice(i, 1);
    this.money += this.sellValue(t);
  }

  cycleTarget(t: Tower): void {
    if (t.def.id === 'ice') return;
    t.target = TARGET_CYCLE[(TARGET_CYCLE.indexOf(t.target) + 1) % TARGET_CYCLE.length];
  }

  /* ---------------- 波次 ---------------- */

  startWave(): boolean {
    if (this.state !== 'build') return false;
    this.wave += 1;
    this.queue = waveSpawns(this.wave);
    this.qi = 0;
    this.waveTime = 0;
    this.hpMul = waveHpMul(this.wave);
    this.state = 'wave';
    this.events.push({ k: 'waveStart', wave: this.wave });
    return true;
  }

  /** 本波已放出的比例，0–1 */
  get waveProgress(): number {
    if (this.state !== 'wave' || !this.queue.length) return this.state === 'build' ? 0 : 1;
    return this.qi / this.queue.length;
  }

  /** 通关后继续无尽模式 */
  continueEndless(): void {
    if (this.state !== 'won') return;
    this.endless = true;
    this.state = 'build';
  }

  /* ---------------- 主循环 ---------------- */

  update(dt: number): void {
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 12) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= 12) this.acc = 0;
  }

  private step(dt: number): void {
    if (this.state === 'over' || this.state === 'won') return;
    this.time += dt;

    if (this.state === 'wave') {
      this.waveTime += dt;
      while (this.qi < this.queue.length && this.queue[this.qi].at <= this.waveTime) {
        const s = this.queue[this.qi++];
        this.spawn(s.t, 0, s.camo);
      }
    }

    this.moveBloons(dt);
    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'over';
      this.events.push({ k: 'over' });
      return;
    }

    for (const t of this.towers) this.towerStep(t, dt);
    this.projStep(dt);

    this.bloons = this.bloons.filter((b) => !b.dead);
    this.projs = this.projs.filter((p) => !p.dead);

    if (this.state === 'wave' && this.qi >= this.queue.length && this.bloons.length === 0) {
      const bonus = 120 + this.wave * 12;
      this.money += bonus;
      this.events.push({ k: 'waveEnd', wave: this.wave, bonus });
      this.projs = [];
      if (this.wave >= TOTAL_WAVES && !this.endless) {
        this.state = 'won';
        this.events.push({ k: 'win' });
        return;
      }
      this.state = 'build';
      if (this.auto) this.startWave();
    }
  }

  private spawn(t: BloonId, d: number, camo: boolean): Bloon {
    const def = BLOONS[t];
    const hp = def.heavy ? Math.round(def.hp * this.hpMul) : def.hp;
    const p = posAt(this.geo, d);
    const b: Bloon = {
      id: this.nextId++,
      t,
      d,
      hp,
      maxHp: hp,
      camo,
      frozen: 0,
      slow: 0,
      slowF: 1,
      x: p.x,
      y: p.y,
      ang: p.ang,
      dead: false,
    };
    this.bloons.push(b);
    return b;
  }

  private moveBloons(dt: number): void {
    const total = this.geo.total;
    for (const b of this.bloons) {
      if (b.dead) continue;
      let v = BLOONS[b.t].speed * UNIT;
      if (b.frozen > 0) {
        b.frozen -= dt;
        v = 0;
      } else if (b.slow > 0) {
        v *= b.slowF;
      }
      if (b.slow > 0) {
        b.slow -= dt;
        if (b.slow <= 0) b.slowF = 1;
      }
      b.d += v * dt;
      if (b.d >= total) {
        b.dead = true;
        const n = rbe(b.t);
        this.lives -= n;
        this.events.push({ k: 'leak', n, t: b.t });
        continue;
      }
      const p = posAt(this.geo, b.d);
      b.x = p.x;
      b.y = p.y;
      b.ang = p.ang;
    }
  }

  /* ---------------- 伤害 ---------------- */

  /** 命中一个气球。返回 null 表示免疫，否则返回由它裂出的子气球 */
  hurt(b: Bloon, dmg: number, type: DmgType, bossDmg: number, src: Tower): Bloon[] | null {
    const def = BLOONS[b.t];
    if (def.immune.includes(type)) {
      this.events.push({ k: 'block', x: b.x, y: b.y });
      return null;
    }
    const kids: Bloon[] = [];
    this.damage(b, dmg + (def.heavy ? bossDmg : 0), type, src, kids);
    return kids;
  }

  private damage(b: Bloon, amount: number, type: DmgType, src: Tower, kids: Bloon[]): void {
    if (b.dead || amount <= 0) return;
    b.hp -= amount;
    if (b.hp > 0) return;
    const overflow = -b.hp;
    b.dead = true;
    this.money += 1;
    this.pops += 1;
    src.pops += 1;
    this.events.push({ k: 'pop', x: b.x, y: b.y, t: b.t });

    const children = BLOONS[b.t].children;
    const born: Bloon[] = [];
    for (let i = 0; i < children.length; i++) {
      const off = (i - (children.length - 1) / 2) * 9;
      born.push(this.spawn(children[i], Math.max(0, b.d + off), b.camo));
    }
    kids.push(...born);
    // 溢出伤害只往下传给第一个子气球，并照样检查免疫
    if (overflow > 0 && born.length && !BLOONS[born[0].t].immune.includes(type)) {
      this.damage(born[0], overflow, type, src, kids);
    }
  }

  /* ---------------- 塔 ---------------- */

  private findTarget(t: Tower): Bloon | null {
    const s = t.stats;
    let best: Bloon | null = null;
    let score = -Infinity;
    for (const b of this.bloons) {
      if (b.dead || (b.camo && !s.camo) || b.x < -6) continue;
      const dx = b.x - t.x;
      const dy = b.y - t.y;
      const reach = s.range + BLOONS[b.t].r;
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      let v: number;
      if (t.target === 'first') v = b.d;
      else if (t.target === 'last') v = -b.d;
      else if (t.target === 'strong') v = BLOONS[b.t].rank * 1e5 + b.d;
      else v = -d2;
      if (v > score) {
        score = v;
        best = b;
      }
    }
    return best;
  }

  /** 按弹速预判落点 */
  private lead(b: Bloon, x: number, y: number, speed: number): { x: number; y: number } {
    if (speed <= 0) return { x: b.x, y: b.y };
    const v = b.frozen > 0 ? 0 : BLOONS[b.t].speed * UNIT * (b.slow > 0 ? b.slowF : 1);
    const tt = Math.hypot(b.x - x, b.y - y) / speed;
    const p = posAt(this.geo, Math.min(this.geo.total, b.d + v * tt));
    return { x: p.x, y: p.y };
  }

  private towerStep(t: Tower, dt: number): void {
    if (t.cd > 0) t.cd -= dt;
    if (t.cd > 0) return;
    const s = t.stats;

    if (t.def.id === 'ice') {
      this.icePulse(t);
      return;
    }

    const target = this.findTarget(t);
    if (!target) return;
    t.cd = s.rate;
    t.shotAt = this.time;

    if (s.speed <= 0) {
      t.ang = Math.atan2(target.y - t.y, target.x - t.x);
      this.events.push({ k: 'tracer', x1: t.x, y1: t.y, x2: target.x, y2: target.y });
      this.hurt(target, s.dmg, s.type, s.bossDmg, t);
      return;
    }

    const aim = this.lead(target, t.x, t.y, s.speed);
    const base = Math.atan2(aim.y - t.y, aim.x - t.x);
    t.ang = base;
    const yarn = t.def.id === 'yarn';
    for (let k = 0; k < s.count; k++) {
      const a = base + (k - (s.count - 1) / 2) * s.spread;
      this.projs.push({
        kind: t.def.id,
        x: t.x + Math.cos(a) * 12,
        y: t.y + Math.sin(a) * 12,
        vx: Math.cos(a) * s.speed,
        vy: Math.sin(a) * s.speed,
        life: (s.range + 60) / s.speed,
        travel: yarn ? Math.max(10, Math.hypot(aim.x - t.x, aim.y - t.y) - 12) : Infinity,
        pierce: s.pierce,
        dmg: s.dmg,
        type: s.type,
        bossDmg: s.bossDmg,
        splash: s.splash,
        splashPierce: s.splashPierce,
        r: yarn ? 6 : 4,
        hit: new Set(),
        src: t,
        dead: false,
      });
    }
  }

  private icePulse(t: Tower): void {
    const s = t.stats;
    const near: { b: Bloon; d2: number }[] = [];
    for (const b of this.bloons) {
      if (b.dead) continue;
      const reach = s.range + BLOONS[b.t].r;
      const d2 = (b.x - t.x) ** 2 + (b.y - t.y) ** 2;
      if (d2 <= reach * reach) near.push({ b, d2 });
    }
    if (!near.length) return;
    near.sort((a, b) => a.d2 - b.d2);
    t.cd = s.rate;
    t.shotAt = this.time;
    this.events.push({ k: 'pulse', x: t.x, y: t.y, r: s.range });

    const n = Math.min(near.length, s.pierce);
    for (let i = 0; i < n; i++) {
      const b = near[i].b;
      if (b.dead) continue;
      const def = BLOONS[b.t];
      if (def.boss) {
        if (s.bossSlow > 0) {
          b.slow = Math.max(b.slow, s.freeze + 1);
          b.slowF = Math.min(b.slowF, 1 - s.bossSlow);
        }
      } else if (!def.noFreeze) {
        b.frozen = Math.max(b.frozen, s.freeze);
        if (s.slowTime > 0) {
          b.slow = Math.max(b.slow, s.freeze + s.slowTime);
          b.slowF = Math.min(b.slowF, s.slow);
        }
      }
      if (s.dmg > 0 && !def.immune.includes('cold')) this.hurt(b, s.dmg, 'cold', 0, t);
    }
  }

  private projStep(dt: number): void {
    for (const p of this.projs) {
      if (p.dead) continue;
      const sp = Math.hypot(p.vx, p.vy);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.kind === 'yarn') {
        p.travel -= sp * dt;
        if (p.travel <= 0) {
          this.explode(p);
          continue;
        }
      }
      if (p.life <= 0 || p.x < -40 || p.y < -40 || p.x > FIELD_W + 40 || p.y > FIELD_H + 40) {
        p.dead = true;
        continue;
      }

      for (const b of this.bloons) {
        if (b.dead || p.hit.has(b.id)) continue;
        const rr = BLOONS[b.t].r + p.r;
        if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 > rr * rr) continue;
        if (p.kind === 'yarn') {
          this.explode(p);
          break;
        }
        p.hit.add(b.id);
        const kids = this.hurt(b, p.dmg, p.type, p.bossDmg, p.src);
        if (kids === null) {
          p.dead = true;
          break;
        }
        for (const k of kids) p.hit.add(k.id);
        p.pierce -= 1;
        if (p.pierce <= 0) {
          p.dead = true;
          break;
        }
      }
    }
  }

  private explode(p: Proj): void {
    p.dead = true;
    this.events.push({ k: 'boom', x: p.x, y: p.y, r: p.splash });
    const hits: { b: Bloon; d2: number }[] = [];
    for (const b of this.bloons) {
      if (b.dead) continue;
      const reach = p.splash + BLOONS[b.t].r;
      const d2 = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      if (d2 <= reach * reach) hits.push({ b, d2 });
    }
    hits.sort((a, b) => a.d2 - b.d2);
    const n = Math.min(hits.length, p.splashPierce);
    for (let i = 0; i < n; i++) this.hurt(hits[i].b, p.dmg, p.type, p.bossDmg, p.src);
  }

  /** 页面每帧取走事件用于特效 */
  drain(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
