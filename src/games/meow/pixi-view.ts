/**
 * 喵星防线 · PixiJS 渲染层
 * 只读 MeowGame 的状态与事件来画画，不改任何游戏逻辑。
 */
import { AdvancedBloomFilter } from 'pixi-filters';
import { Application, CanvasSource, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import * as A from './art.ts';
import { BLOONS, TOWERS, type BloonId, type TowerDef, type TowerKind } from './data.ts';
import type { Bloon, GameEvent, MeowGame, Proj, Tower } from './engine.ts';
import { FIELD_H, FIELD_W, posAt } from './maps.ts';

export type Quality = 'high' | 'low';

export interface FrameView {
  time: number;
  hover: { x: number; y: number } | null;
  placing: TowerDef | null;
  placeOk: boolean;
  selected: Tower | null;
  hoverTower: Tower | null;
  banner: { title: string; sub: string; life: number; max: number } | null;
  speed: number;
  hint: string;
}

/** 气球和弹道离地的高度：画面上「浮」在路面上方，影子留在路上 */
const LIFT = 9;
/** 猫猫模型相对碰撞半径的放大倍数（纯视觉） */
const CAT_SCALE = 1.15;
const FONT = 'ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const POP_COLOR: Partial<Record<BloonId, string>> = {
  black: '#64748b',
  white: '#f8fafc',
  zebra: '#e2e8f0',
  rainbow: '#f0abfc',
  lead: '#cbd5e1',
};

/* ---------------- 纹理库 ---------------- */

function makeArt(key: string): A.Art | null {
  const [kind, arg] = key.split(':') as [string, string];
  switch (kind) {
    case 'b':
      return A.balloonArt(arg as BloonId);
    case 'crack':
      return A.crackArt(Number(arg));
    case 'plat':
      return A.platformArt(arg as TowerKind);
    case 'tail':
      return A.tailArt(arg as TowerKind);
    case 'body':
      return A.bodyArt(arg as TowerKind);
    case 'head':
      return A.headArt(arg as TowerKind);
    case 'eye':
      return A.eyeArt(arg as TowerKind);
    case 'wpn':
      return A.weaponArt(arg as TowerKind);
  }
  const fixed: Record<string, () => A.Art> = {
    camo: A.camoArt,
    frost: A.frostArt,
    sil: A.silhouetteArt,
    shard: A.shardArt,
    boss: A.bossArt,
    prop: A.propellerArt,
    rtail: A.ratTailArt,
    cape: A.capeArt,
    soft: A.softArt,
    ring: A.ringArt,
    star: A.starArt,
    smoke: A.smokeArt,
    flake: A.flakeArt,
    clawShot: A.clawShotArt,
    yarnShot: A.yarnShotArt,
    beam: A.beamArt,
    chev: A.chevronArt,
    shadow: A.shadowArt,
    vig: A.vignetteArt,
    fog: A.fogArt,
    house: A.warehouseArt,
  };
  return fixed[kind]?.() ?? null;
}

interface TexEntry {
  tex: Texture;
  ax: number;
  ay: number;
}

class Bank {
  private map = new Map<string, TexEntry | null>();

  add(key: string, art: A.Art | null) {
    if (!art) {
      this.map.set(key, null);
      return;
    }
    const tex = new Texture({ source: new CanvasSource({ resource: art.canvas, resolution: art.res }) });
    this.map.set(key, { tex, ax: art.ax, ay: art.ay });
  }

  get(key: string): TexEntry | null {
    if (!this.map.has(key)) this.add(key, makeArt(key));
    return this.map.get(key) ?? null;
  }

  sprite(key: string): Sprite {
    const e = this.get(key);
    const s = new Sprite(e ? e.tex : Texture.EMPTY);
    if (e) s.anchor.set(e.ax, e.ay);
    return s;
  }

  destroy() {
    for (const e of this.map.values()) e?.tex.destroy(true);
    this.map.clear();
  }
}

/* ---------------- 粒子 ---------------- */

interface Particle {
  s: Sprite;
  key: string;
  vx: number;
  vy: number;
  grav: number;
  drag: number;
  life: number;
  max: number;
  spin: number;
  s0: number;
  s1: number;
  sx: number;
  sy: number;
  a0: number;
  alive: boolean;
}

interface ParticleOpts {
  vx?: number;
  vy?: number;
  grav?: number;
  drag?: number;
  life?: number;
  spin?: number;
  rot?: number;
  s0?: number;
  s1?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
  tint?: number;
}

class Particles {
  private list: Particle[] = [];
  private layer: Container;
  private bank: Bank;
  private additive: boolean;
  cap = 700;

  constructor(layer: Container, bank: Bank, additive: boolean) {
    this.layer = layer;
    this.bank = bank;
    this.additive = additive;
  }

  spawn(key: string, x: number, y: number, o: ParticleOpts = {}): void {
    let p = this.list.find((q) => !q.alive);
    if (!p) {
      if (this.list.length >= this.cap) return;
      const s = this.bank.sprite(key);
      if (this.additive) s.blendMode = 'add';
      this.layer.addChild(s);
      p = { s, key, vx: 0, vy: 0, grav: 0, drag: 1, life: 0, max: 1, spin: 0, s0: 1, s1: 1, sx: 1, sy: 1, a0: 1, alive: false };
      this.list.push(p);
    }
    if (p.key !== key) {
      const e = this.bank.get(key);
      if (e) {
        p.s.texture = e.tex;
        p.s.anchor.set(e.ax, e.ay);
      }
      p.key = key;
    }
    p.alive = true;
    p.s.visible = true;
    p.s.position.set(x, y);
    p.s.rotation = o.rot ?? 0;
    p.s.tint = o.tint ?? 0xffffff;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.grav = o.grav ?? 0;
    p.drag = o.drag ?? 1;
    p.max = p.life = o.life ?? 0.5;
    p.spin = o.spin ?? 0;
    p.s0 = o.s0 ?? 1;
    p.s1 = o.s1 ?? p.s0;
    p.sx = o.sx ?? 1;
    p.sy = o.sy ?? 1;
    p.a0 = o.alpha ?? 1;
    this.apply(p, 0);
  }

  private apply(p: Particle, k: number) {
    const sc = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
    p.s.scale.set(sc * p.sx, sc * p.sy);
    p.s.alpha = p.a0 * (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
  }

  update(dt: number) {
    for (const p of this.list) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.s.visible = false;
        continue;
      }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + p.grav * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      this.apply(p, 1 - p.life / p.max);
    }
  }

  clear() {
    for (const p of this.list) {
      p.alive = false;
      p.s.visible = false;
    }
  }
}

/* ---------------- 视图对象 ---------------- */

interface BloonView {
  root: Container;
  body: Container;
  shadow: Sprite;
  frost?: Sprite;
  crack?: Sprite;
  crackStage: number;
  flash?: Sprite;
  hull?: Container;
  props?: Sprite[];
  tail?: Sprite;
  hp?: Graphics;
  hpKey: string;
  ang: number;
  born: number;
  lastHp: number;
  flashT: number;
  dmg: number;
  dmgT: number;
  seen: number;
}

interface CatRig {
  root: Container;
  rig: Container;
  weaponBack: Container;
  weaponFront: Container;
  weapon: Container | null;
  weaponBase: [number, number];
  tail: Sprite;
  head: Container;
  eyes: Container;
  cape: Sprite | null;
  body: Sprite;
}

interface TowerView extends CatRig {
  plat: Sprite;
  aura: Sprite;
  sel: Sprite;
  pips: Graphics;
  pipKey: string;
  born: number;
  lastShot: number;
  kick: number;
  jump: number;
  blinkAt: number;
  blinkT: number;
  seen: number;
  t: Tower;
}

interface Floater {
  t: Text;
  vy: number;
  life: number;
  max: number;
  alive: boolean;
}

/* ---------------- 渲染器 ---------------- */

export class PixiView {
  readonly app: Application;
  private bank = new Bank();
  quality: Quality;

  private world = new Container();
  private overlay = new Container();
  private decal = new Container();
  private flow = new Container();
  private shadows = new Container();
  private range = new Graphics();
  private units = new Container();
  private projLayer = new Container();
  private fxLayer = new Container();
  private fxAddLayer = new Container();
  private ambient = new Container();
  private ghostLayer = new Container();

  private fx: Particles;
  private fxAdd: Particles;
  private bloom: AdvancedBloomFilter;

  private bloons = new Map<number, BloonView>();
  private towers = new Map<number, TowerView>();
  private projs = new Map<Proj, Container>();
  private ghosts = new Map<TowerKind, CatRig>();
  private floaters: Floater[] = [];

  private fireflies: { s: Sprite; x: number; y: number; ph: number; sp: number }[] = [];
  private fogs: Sprite[] = [];
  private flowDots: Sprite[] = [];
  private chevrons: Sprite[] = [];
  private houseGlow: Sprite;
  private portalGlow: Sprite;
  private redFlash: Sprite;
  private hintL: Text;
  private hintR: Text;
  private banner = new Container();
  private bannerTitle: Text;
  private bannerSub: Text;
  private bannerBg: Sprite;
  private bannerRef: FrameView['banner'] = null;

  private game: MeowGame | null = null;
  private time = 0;
  private frameId = 0;
  private shake = 0;
  private flashRed = 0;
  private portalPulse = 0;
  private blockCd = 0;
  private houseX = 0;
  private houseY = 0;

  static async create(canvas: HTMLCanvasElement, quality: Quality): Promise<PixiView> {
    const app = new Application();
    await app.init({
      canvas,
      width: FIELD_W,
      height: FIELD_H,
      resolution: resolutionFor(quality),
      autoDensity: false,
      antialias: true,
      backgroundColor: 0x05070e,
      preference: 'webgl',
      autoStart: false,
      powerPreference: 'high-performance',
    });
    return new PixiView(app, quality);
  }

  private constructor(app: Application, quality: Quality) {
    this.app = app;
    this.quality = quality;
    app.ticker?.stop();

    this.fx = new Particles(this.fxLayer, this.bank, false);
    this.fxAdd = new Particles(this.fxAddLayer, this.bank, true);
    this.units.sortableChildren = true;
    this.flow.blendMode = 'add';
    this.world.addChild(
      this.decal,
      this.flow,
      this.shadows,
      this.range,
      this.units,
      this.projLayer,
      this.fxLayer,
      this.fxAddLayer,
      this.ambient,
      this.ghostLayer,
    );
    app.stage.addChild(this.world, this.overlay);

    this.bloom = new AdvancedBloomFilter({ threshold: 0.5, bloomScale: 0.9, brightness: 1, blur: 5, quality: 5 });
    this.world.filterArea = new Rectangle(0, 0, FIELD_W, FIELD_H);

    // 暗角 + 漏怪红闪
    const vig = this.bank.sprite('vig');
    vig.width = FIELD_W;
    vig.height = FIELD_H;
    this.redFlash = this.bank.sprite('vig');
    this.redFlash.width = FIELD_W;
    this.redFlash.height = FIELD_H;
    this.redFlash.tint = 0xff2a2a;
    this.redFlash.alpha = 0;
    this.redFlash.blendMode = 'add';
    this.overlay.addChild(vig, this.redFlash);

    const hintStyle = { fontFamily: FONT, fontSize: 11, fill: 0xffffff, fontWeight: '600' as const, letterSpacing: 0.5 };
    this.hintL = new Text({ text: '', style: hintStyle, resolution: 2 });
    this.hintL.alpha = 0.5;
    this.hintL.position.set(12, FIELD_H - 24);
    this.hintR = new Text({ text: '', style: { ...hintStyle, fill: 0x67e8f9 }, resolution: 2 });
    this.hintR.anchor.set(1, 0);
    this.hintR.position.set(FIELD_W - 12, FIELD_H - 24);

    this.bannerBg = this.bank.sprite('soft');
    this.bannerBg.tint = 0x03050b;
    this.bannerBg.width = FIELD_W * 1.1;
    this.bannerBg.height = 120;
    this.bannerBg.alpha = 0.85;
    this.bannerTitle = new Text({
      text: '',
      style: {
        fontFamily: FONT,
        fontSize: 28,
        fontWeight: '800',
        fill: 0xffffff,
        stroke: { color: 0x0b1020, width: 5 },
        dropShadow: { color: 0x22d3ee, blur: 14, distance: 0, alpha: 0.85, angle: 0 },
        letterSpacing: 2,
        padding: 24,
      },
      resolution: 2,
    });
    this.bannerTitle.anchor.set(0.5);
    this.bannerSub = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 13, fontWeight: '700', fill: 0xfbbf24, stroke: { color: 0x0b1020, width: 3 } },
      resolution: 2,
    });
    this.bannerSub.anchor.set(0.5);
    this.banner.addChild(this.bannerBg, this.bannerTitle, this.bannerSub);
    this.banner.position.set(FIELD_W / 2, 62);
    this.bannerBg.position.set(-this.bannerBg.width / 2, -this.bannerBg.height / 2);
    this.bannerBg.anchor.set(0, 0);
    this.bannerTitle.y = -8;
    this.bannerSub.y = 20;
    this.banner.visible = false;
    this.overlay.addChild(this.hintL, this.hintR, this.banner);

    this.houseGlow = this.bank.sprite('soft');
    this.portalGlow = this.bank.sprite('soft');
    this.setQuality(quality);
  }

  /* ---------- 场景 ---------- */

  private bindGame(game: MeowGame) {
    this.game = game;
    for (const v of this.bloons.values()) this.dropBloon(v);
    this.bloons.clear();
    for (const v of this.towers.values()) v.root.destroy({ children: true });
    this.towers.clear();
    for (const c of this.projs.values()) c.destroy({ children: true });
    this.projs.clear();
    this.fx.clear();
    this.fxAdd.clear();
    if (this.decal.children.length) return;

    // 静态背景只画一次
    const bgKey = `map:${game.map.id}`;
    this.bank.add(bgKey, A.mapArt(game.map, game.geo));
    const bg = this.bank.sprite(bgKey);
    this.decal.addChild(bg);

    const pts = game.geo.pts;
    const [ex, ey] = pts[pts.length - 2];
    this.houseX = Math.min(FIELD_W - 44, ex + 48);
    this.houseY = ey + 6;
    const house = this.bank.sprite('house');
    house.position.set(this.houseX, this.houseY);
    house.zIndex = 1e6;
    this.units.addChild(house);
    this.houseGlow.blendMode = 'add';
    this.houseGlow.tint = 0xfbbf24;
    this.houseGlow.position.set(this.houseX, this.houseY - 16);
    this.fxAddLayer.addChild(this.houseGlow);

    const sy = pts[1][1];
    this.portalGlow.blendMode = 'add';
    this.portalGlow.tint = 0xc084fc;
    this.portalGlow.position.set(4, sy);
    this.portalGlow.scale.set(1.5, 2.3);
    this.fxAddLayer.addChild(this.portalGlow);
    for (let i = 0; i < 3; i++) {
      const c = this.bank.sprite('chev');
      c.blendMode = 'add';
      c.tint = 0xd8b4fe;
      c.position.set(14 + i * 11, sy);
      this.fxAddLayer.addChild(c);
      this.chevrons.push(c);
    }

    for (let i = 0; i < 18; i++) {
      const d = this.bank.sprite('soft');
      d.tint = 0x67e8f9;
      d.scale.set(0.22);
      d.alpha = 0.7;
      this.flow.addChild(d);
      this.flowDots.push(d);
    }

    for (let i = 0; i < 26; i++) {
      const s = this.bank.sprite('soft');
      s.blendMode = 'add';
      s.tint = i % 3 === 0 ? 0x67e8f9 : 0xbef264;
      s.scale.set(0.3);
      this.ambient.addChild(s);
      this.fireflies.push({ s, x: Math.random() * FIELD_W, y: Math.random() * FIELD_H, ph: Math.random() * 10, sp: 0.3 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 3; i++) {
      const f = this.bank.sprite('fog');
      f.tint = i === 1 ? 0x8b5cf6 : 0x22d3ee;
      f.alpha = 0.06;
      f.scale.set(2.4);
      f.position.set(i * 330, 120 + i * 150);
      this.ambient.addChild(f);
      this.fogs.push(f);
    }
    this.setQuality(this.quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const high = q === 'high';
    this.world.filters = high ? [this.bloom] : [];
    this.fx.cap = high ? 700 : 220;
    this.fxAdd.cap = high ? 500 : 160;
    for (const f of this.fogs) f.visible = high;
    this.fireflies.forEach((f, i) => (f.s.visible = high || i < 8));
    const res = resolutionFor(q);
    if (this.app.renderer.resolution !== res) this.app.renderer.resize(FIELD_W, FIELD_H, res);
  }

  /* ---------- 猫猫骨架 ---------- */

  private makeCat(kind: TowerKind): CatRig {
    const u = TOWERS[kind].r;
    const at = (s: Container, p: readonly [number, number]) => s.position.set(p[0] * u, p[1] * u);
    const root = new Container();
    const rig = new Container();
    const tail = this.bank.sprite(`tail:${kind}`);
    at(tail, A.CAT_RIG.tail);
    const cape = kind === 'super' ? this.bank.sprite('cape') : null;
    if (cape) cape.position.set(0, -0.72 * u);
    const body = this.bank.sprite(`body:${kind}`);
    at(body, A.CAT_RIG.body);
    const weaponBack = new Container();
    const weaponFront = new Container();
    let weapon: Container | null = null;
    let weaponBase: [number, number] = [A.CAT_RIG.weapon[0] * u, A.CAT_RIG.weapon[1] * u];
    if (this.bank.get(`wpn:${kind}`)) {
      weapon = new Container();
      weapon.addChild(this.bank.sprite(`wpn:${kind}`));
      if (kind === 'ice') weaponBase = [0.62 * u, -0.05 * u];
      weapon.position.set(...weaponBase);
      weaponFront.addChild(weapon);
    }
    const head = new Container();
    at(head, A.CAT_RIG.head);
    head.addChild(this.bank.sprite(`head:${kind}`));
    const eyes = new Container();
    for (const p of [A.CAT_RIG.eyeL, A.CAT_RIG.eyeR]) {
      const e = this.bank.sprite(`eye:${kind}`);
      e.position.set((p[0] - A.CAT_RIG.head[0]) * u, (p[1] - A.CAT_RIG.head[1]) * u);
      eyes.addChild(e);
    }
    head.addChild(eyes);
    rig.addChild(...[tail, cape, weaponBack, body, weaponFront, head].filter((x): x is Container => !!x));
    root.addChild(rig);
    return { root, rig, weaponBack, weaponFront, weapon, weaponBase, tail, head, eyes, cape, body };
  }

  private makeTower(t: Tower): TowerView {
    const kind = t.def.id;
    const u = t.def.r;
    const cat = this.makeCat(kind);
    const shadow = this.bank.sprite('shadow');
    shadow.scale.set((u + 8) / 20, (u + 8) / 20);
    shadow.position.set(2, 5);
    shadow.alpha = 0.8;
    const plat = this.bank.sprite(`plat:${kind}`);
    const aura = this.bank.sprite('soft');
    aura.blendMode = 'add';
    aura.tint = A.hexNum(A.CAT_LOOK[kind].accent);
    aura.position.set(0, -0.6 * u);
    aura.visible = false;
    const sel = this.bank.sprite('ring');
    sel.blendMode = 'add';
    sel.scale.set((u + 7) / 28, ((u + 7) / 28) * 0.6);
    sel.visible = false;
    const pips = new Graphics();
    cat.root.addChildAt(shadow, 0);
    cat.root.addChildAt(sel, 1);
    cat.root.addChildAt(plat, 2);
    cat.root.addChildAt(aura, 3);
    cat.root.addChild(pips);
    this.units.addChild(cat.root);

    // 落地扬尘
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.fx.spawn('smoke', t.x + Math.cos(a) * u, t.y + Math.sin(a) * u * 0.5, {
        vx: Math.cos(a) * 40,
        vy: Math.sin(a) * 20,
        drag: 0.9,
        life: 0.5,
        s0: 0.25,
        s1: 0.55,
        alpha: 0.35,
        tint: 0x94a3b8,
      });
    }
    this.fxAdd.spawn('ring', t.x, t.y, { life: 0.35, s0: 0.3, s1: (u + 14) / 28, sy: 0.6, tint: A.hexNum(t.def.color) });

    return {
      ...cat,
      plat,
      aura,
      sel,
      pips,
      pipKey: '',
      born: this.time,
      lastShot: t.shotAt,
      kick: 0,
      jump: 0,
      blinkAt: this.time + 1 + Math.random() * 3,
      blinkT: 0,
      seen: 0,
      t,
    };
  }

  private poseCat(c: CatRig, kind: TowerKind, ang: number, id: number, kick: number) {
    const u = TOWERS[kind].r;
    const time = this.time;
    c.body.scale.set(1, 1 + Math.sin(time * 2.4 + id) * 0.025 - kick * 0.05);
    c.head.y = A.CAT_RIG.head[1] * u + Math.sin(time * 2.4 + id + 0.4) * 0.5 + kick * 1.2;
    c.tail.rotation = Math.sin(time * 3.1 + id * 1.3) * 0.28;
    if (c.cape) c.cape.skew.x = Math.sin(time * 2.6 + id) * 0.08;
    const lx = Math.cos(ang);
    const ly = Math.sin(ang);
    c.eyes.position.set(lx * 1.1, ly * 0.7);
    c.head.rotation = lx * 0.05;

    if (!c.weapon) return;
    if (kind === 'ice') {
      c.weapon.y = c.weaponBase[1] + Math.sin(time * 2 + id) * 1.4 - kick * 3;
      c.weapon.rotation = Math.sin(time * 1.5 + id) * 0.06;
      return;
    }
    const back = ly < -0.45;
    const parent = back ? c.weaponBack : c.weaponFront;
    if (c.weapon.parent !== parent) parent.addChild(c.weapon);
    c.weapon.rotation = ang;
    c.weapon.scale.y = lx < 0 ? -1 : 1;
    c.weapon.position.set(c.weaponBase[0] - lx * kick * u * 0.22, c.weaponBase[1] - ly * kick * u * 0.22);
  }

  private weaponTip(v: TowerView): { x: number; y: number } {
    const t = v.t;
    const u = t.def.r;
    const len = { claw: 1.3, yarn: 1.35, snipe: 1.85, ice: 0, super: 0 }[t.def.id] * u;
    if (t.def.id === 'super') return { x: t.x, y: t.y + v.rig.y + (A.CAT_RIG.eyeL[1] - 0.02) * u * CAT_SCALE };
    if (!v.weapon) return { x: t.x, y: t.y };
    return {
      x: t.x + (v.weapon.x + Math.cos(t.ang) * len) * CAT_SCALE,
      y: t.y + v.rig.y + (v.weapon.y + Math.sin(t.ang) * len) * CAT_SCALE,
    };
  }

  private syncTowers(game: MeowGame, view: FrameView, dt: number) {
    const id = this.frameId;
    for (const t of game.towers) {
      let v = this.towers.get(t.id);
      if (!v) {
        v = this.makeTower(t);
        this.towers.set(t.id, v);
      }
      v.seen = id;
      const u = t.def.r;
      v.root.position.set(t.x, t.y);
      v.root.zIndex = t.y;

      // 开火
      if (t.shotAt !== v.lastShot) {
        v.lastShot = t.shotAt;
        v.kick = 1;
        this.muzzle(v);
      }
      v.kick = Math.max(0, v.kick - dt * 7);

      // 出生 / 升级跳
      const age = this.time - v.born;
      const k = clamp01(age / 0.42);
      const drop = (1 - k) * (1 - k) * 26;
      if (v.jump > 0) v.jump = Math.max(0, v.jump - dt * 2.8);
      const hop = v.jump > 0 ? Math.sin((1 - v.jump) * Math.PI) * u * 0.55 : 0;
      v.rig.y = -drop - hop;
      const sc = k < 1 ? 0.6 + easeOutBack(k) * 0.4 : 1;
      const hoverUp = view.hoverTower === t && !view.placing ? 1.05 : 1;
      v.rig.scale.set(sc * hoverUp * CAT_SCALE);

      // 眨眼
      if (this.time >= v.blinkAt) {
        v.blinkT = 0.13;
        v.blinkAt = this.time + 2 + Math.random() * 4;
      }
      v.blinkT -= dt;
      v.eyes.scale.y = v.blinkT > 0 ? 0.12 : 1;

      this.poseCat(v, t.def.id, t.ang, t.id, v.kick);

      const top = Math.max(t.tiers[0], t.tiers[1]);
      v.aura.visible = top >= 3;
      if (v.aura.visible) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 3 + t.id);
        v.aura.alpha = 0.25 + p * 0.25;
        v.aura.scale.set((u * 2.4) / 16 + p * 0.2);
      }

      const selected = view.selected === t;
      v.sel.visible = selected;
      if (selected) v.sel.alpha = 0.55 + 0.35 * Math.sin(this.time * 6);

      const key = t.tiers.join('-');
      if (key !== v.pipKey) {
        v.pipKey = key;
        v.pips.clear();
        const ry = (u + 3) * 0.6;
        for (let p = 0; p < 2; p++) {
          for (let i = 0; i < t.tiers[p]; i++) {
            const x = (p === 0 ? -1 : 1) * (4 + i * 4.6);
            v.pips
              .circle(x, ry + 4.5, 1.9)
              .fill({ color: p === 0 ? A.hexNum(A.CAT_LOOK[t.def.id].accent) : 0xffffff })
              .stroke({ color: 0x0a0e1a, width: 0.8 });
          }
        }
      }
    }
    for (const [tid, v] of this.towers) {
      if (v.seen === id) continue;
      this.poof(v.t.x, v.t.y - v.t.def.r * 0.6, v.t.def.r);
      v.root.destroy({ children: true });
      this.towers.delete(tid);
    }
  }

  private muzzle(v: TowerView) {
    const kind = v.t.def.id;
    const accent = A.hexNum(A.CAT_LOOK[kind].accent);
    if (kind === 'ice') {
      const u = v.t.def.r;
      const x = v.t.x + v.weaponBase[0] * CAT_SCALE;
      const y = v.t.y + v.rig.y + (v.weaponBase[1] - u * 1.15) * CAT_SCALE;
      this.fxAdd.spawn('soft', x, y, { life: 0.3, s0: 0.6, s1: 1.4, tint: 0x7dd3fc, alpha: 0.9 });
      this.fxAdd.spawn('star', x, y, { life: 0.25, s0: 1.2, s1: 0.4, tint: 0xe0f2fe, spin: 6 });
      return;
    }
    if (kind === 'super') {
      const u = v.t.def.r;
      for (const p of [A.CAT_RIG.eyeL, A.CAT_RIG.eyeR]) {
        this.fxAdd.spawn('soft', v.t.x + p[0] * u * CAT_SCALE, v.t.y + p[1] * u * CAT_SCALE + v.rig.y, {
          life: 0.07,
          s0: 0.32,
          s1: 0.18,
          tint: v.t.stats.type === 'energy' ? 0xff4d4d : 0xfde68a,
        });
      }
      return;
    }
    const tip = this.weaponTip(v);
    this.fxAdd.spawn('star', tip.x, tip.y, { life: 0.08, s0: kind === 'snipe' ? 1.3 : 0.8, s1: 0.4, rot: Math.random() * 3, tint: accent });
    this.fxAdd.spawn('soft', tip.x, tip.y, { life: 0.1, s0: 0.5, s1: 0.2, tint: accent });
    if (kind === 'snipe') {
      this.fx.spawn('smoke', tip.x, tip.y, { vx: Math.cos(v.t.ang) * 30, vy: -15, life: 0.5, s0: 0.15, s1: 0.4, alpha: 0.4, tint: 0x94a3b8 });
    }
  }

  /* ---------- 气球 ---------- */

  private makeBloon(b: Bloon): BloonView {
    const def = BLOONS[b.t];
    const root = new Container();
    const body = new Container();
    root.addChild(body);
    const shadow = this.bank.sprite('shadow');
    shadow.alpha = def.boss ? 0.7 : 0.55;
    const sr = def.boss ? def.r * 2.6 : def.r * 1.05;
    shadow.scale.set(sr / 20, sr / 20);
    this.shadows.addChild(shadow);
    const v: BloonView = {
      root,
      body,
      shadow,
      crackStage: 0,
      hpKey: '',
      ang: b.ang,
      born: this.time,
      lastHp: b.hp,
      flashT: 0,
      dmg: 0,
      dmgT: 0,
      seen: 0,
    };

    if (def.boss) {
      const hull = new Container();
      const tail = this.bank.sprite('rtail');
      tail.position.set(-def.r * 1.62, 0);
      const props = [-1, 1].map((s) => {
        const p = this.bank.sprite('prop');
        p.position.set(-def.r * 0.75, s * def.r * 0.98);
        return p;
      });
      hull.addChild(tail, this.bank.sprite('boss'), ...props);
      body.addChild(hull);
      const hp = new Graphics();
      root.addChild(hp);
      Object.assign(v, { hull, tail, props, hp });
    } else {
      body.addChild(this.bank.sprite(`b:${b.t}`));
      const k = def.r / 12;
      if (b.t === 'ceramic') {
        const crack = this.bank.sprite('crack:0');
        body.addChild(crack);
        v.crack = crack;
      }
      if (b.camo) {
        const camo = this.bank.sprite('camo');
        camo.scale.set(k);
        body.addChild(camo);
        body.alpha = 0.86;
      }
      const frost = this.bank.sprite('frost');
      frost.scale.set(k);
      frost.visible = false;
      body.addChild(frost);
      v.frost = frost;
      if (def.heavy) {
        const flash = this.bank.sprite('sil');
        flash.scale.set(k);
        flash.alpha = 0;
        flash.blendMode = 'add';
        body.addChild(flash);
        v.flash = flash;
      }
    }
    this.units.addChild(root);
    return v;
  }

  private dropBloon(v: BloonView) {
    v.root.destroy({ children: true });
    v.shadow.destroy();
  }

  private syncBloons(game: MeowGame, dt: number) {
    const id = this.frameId;
    for (const b of game.bloons) {
      let v = this.bloons.get(b.id);
      if (!v) {
        v = this.makeBloon(b);
        this.bloons.set(b.id, v);
      }
      v.seen = id;
      const def = BLOONS[b.t];
      const bob = Math.sin(this.time * 3 + b.id * 1.7) * 1.4;
      v.root.position.set(b.x, b.y - LIFT + bob);
      v.root.zIndex = b.y + (def.boss ? 500 : 0);
      v.shadow.position.set(b.x + 2, b.y + 3);

      const age = this.time - v.born;
      const s = age < 0.24 ? 0.55 + easeOutBack(age / 0.24) * 0.45 : 1;

      if (def.boss && v.hull) {
        v.ang = lerpAngle(v.ang, b.ang, 1 - Math.exp(-dt * 4));
        v.hull.rotation = v.ang;
        v.body.scale.set(s);
        for (const p of v.props!) p.scale.y = 0.25 + Math.abs(Math.cos(this.time * 32 + p.y));
        v.tail!.rotation = Math.sin(this.time * 5) * 0.3;
        const ratio = Math.max(0, b.hp / b.maxHp);
        const key = ratio.toFixed(3);
        const top = Math.abs(Math.sin(v.ang)) * def.r * 1.65 + Math.abs(Math.cos(v.ang)) * def.r * 1.1;
        v.hp!.y = -top - 12;
        if (key !== v.hpKey) {
          v.hpKey = key;
          const w = 54;
          v.hp!.clear()
            .roundRect(-w / 2 - 1.5, -1.5, w + 3, 8, 3)
            .fill({ color: 0x05070d, alpha: 0.85 })
            .roundRect(-w / 2, 0, w * ratio, 5, 2)
            .fill({ color: ratio > 0.5 ? 0xa78bfa : ratio > 0.25 ? 0xfbbf24 : 0xfb7185 });
        }
      } else {
        v.root.rotation = Math.sin(this.time * 2.1 + b.id) * 0.08;
        v.body.scale.set(s);
        if (v.frost) {
          v.frost.visible = b.frozen > 0;
          v.frost.alpha = Math.min(1, b.frozen * 4);
        }
        (v.body.children[0] as Sprite).tint = b.slow > 0 && b.frozen <= 0 ? 0xbfe6ff : 0xffffff;
        if (v.crack) {
          const r = b.hp / b.maxHp;
          const stage = r > 0.7 ? 0 : r > 0.45 ? 1 : r > 0.2 ? 2 : 3;
          if (stage !== v.crackStage) {
            v.crackStage = stage;
            const e = this.bank.get(`crack:${stage}`);
            if (e) v.crack.texture = e.tex;
            this.fx.spawn('shard', b.x, b.y - LIFT, { vx: (Math.random() - 0.5) * 120, vy: -80, grav: 400, life: 0.5, spin: 8, tint: 0xc2410c });
          }
        }
      }

      // 命中闪白 + 伤害数字
      if (b.hp < v.lastHp) {
        v.flashT = 0.09;
        v.dmg += v.lastHp - b.hp;
      }
      v.lastHp = b.hp;
      if (v.flash) v.flash.alpha = Math.max(0, v.flashT / 0.09) * 0.8;
      if (def.boss) v.body.alpha = v.flashT > 0 ? 0.75 : 1;
      v.flashT -= dt;
      if (v.dmg > 0 && this.time - v.dmgT > 0.2 && this.quality === 'high') {
        this.float(`-${Math.round(v.dmg)}`, b.x + (Math.random() - 0.5) * 12, b.y - LIFT - def.r - 4, 0xfde68a, 12);
        v.dmg = 0;
        v.dmgT = this.time;
      }
    }
    for (const [bid, v] of this.bloons) {
      if (v.seen === id) continue;
      this.dropBloon(v);
      this.bloons.delete(bid);
    }
  }

  /* ---------- 弹道 ---------- */

  private syncProjs(game: MeowGame) {
    const live = new Set<Proj>();
    for (const p of game.projs) {
      if (p.dead) continue;
      live.add(p);
      let c = this.projs.get(p);
      if (!c) {
        c = new Container();
        if (p.kind === 'yarn') {
          const glow = this.bank.sprite('soft');
          glow.blendMode = 'add';
          glow.tint = 0xf472b6;
          glow.scale.set(0.5);
          glow.alpha = 0.5;
          c.addChild(glow, this.bank.sprite('yarnShot'));
        } else {
          const energy = p.type === 'energy';
          const tint = p.kind === 'claw' ? 0x22d3ee : energy ? 0xff5a5a : 0xfde68a;
          const trail = this.bank.sprite('beam');
          trail.anchor.set(1, 0.5);
          trail.blendMode = 'add';
          trail.tint = tint;
          trail.scale.set(p.kind === 'super' ? 0.9 : 0.75, p.kind === 'super' ? 1.1 : 0.9);
          c.addChild(trail);
          if (p.kind === 'claw') c.addChild(this.bank.sprite('clawShot'));
          else {
            const core = this.bank.sprite('soft');
            core.blendMode = 'add';
            core.tint = 0xffffff;
            core.scale.set(0.28);
            c.addChild(core);
          }
        }
        this.projLayer.addChild(c);
        this.projs.set(p, c);
      }
      c.position.set(p.x, p.y - LIFT);
      if (p.kind === 'yarn') c.children[1].rotation += 0.25;
      else c.rotation = Math.atan2(p.vy, p.vx);
    }
    for (const [p, c] of this.projs) {
      if (live.has(p)) continue;
      c.destroy({ children: true });
      this.projs.delete(p);
    }
  }

  /* ---------- 特效 ---------- */

  events(list: GameEvent[]) {
    for (const e of list) {
      if (e.k === 'pop') this.fxPop(e.x, e.y, e.t);
      else if (e.k === 'block') this.fxBlock(e.x, e.y);
      else if (e.k === 'boom') this.fxBoom(e.x, e.y, e.r);
      else if (e.k === 'tracer') this.fxTracer(e.x1, e.y1, e.x2, e.y2);
      else if (e.k === 'pulse') this.fxPulse(e.x, e.y, e.r);
      else if (e.k === 'leak') {
        this.flashRed = 0.6;
        this.shake = Math.max(this.shake, 5);
        this.fxAdd.spawn('soft', this.houseX, this.houseY - 10, { life: 0.5, s0: 2, s1: 3.5, tint: 0xff3b3b });
      } else if (e.k === 'waveStart') this.portalPulse = 1;
    }
  }

  private fxPop(x: number, y0: number, t: BloonId) {
    const def = BLOONS[t];
    const y = y0 - LIFT;
    const color = A.hexNum(POP_COLOR[t] ?? def.color);
    const high = this.quality === 'high';
    const n = def.boss ? 34 : def.heavy ? 10 : high ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (def.boss ? 260 : 110) * (0.4 + Math.random() * 0.8);
      this.fx.spawn('shard', x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        grav: 480,
        drag: 0.93,
        life: 0.4 + Math.random() * 0.35,
        spin: (Math.random() - 0.5) * 22,
        rot: a,
        s0: (def.r / 11) * (0.7 + Math.random() * 0.6),
        tint: color,
      });
    }
    this.fxAdd.spawn('ring', x, y, { life: 0.22, s0: 0.15, s1: (def.r * 1.7) / 28, tint: color, alpha: 0.9 });
    this.fxAdd.spawn('soft', x, y, { life: 0.1, s0: def.r / 10, s1: def.r / 22, alpha: 0.8 });
    if (def.boss) {
      this.shake = Math.max(this.shake, 12);
      this.fxAdd.spawn('soft', x, y, { life: 0.35, s0: 4, s1: 9, tint: 0xc4b5fd });
      this.fxAdd.spawn('ring', x, y, { life: 0.6, s0: 0.4, s1: 4.2, tint: 0xa78bfa });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.spawn('smoke', x + Math.cos(a) * 12, y + Math.sin(a) * 8, {
          vx: Math.cos(a) * 90,
          vy: Math.sin(a) * 60 - 30,
          drag: 0.9,
          life: 0.9 + Math.random() * 0.4,
          s0: 0.6,
          s1: 1.8,
          alpha: 0.7,
          tint: 0x2a2440,
        });
        this.fxAdd.spawn('star', x, y, { vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, drag: 0.9, life: 0.7, spin: 8, s0: 1, s1: 0.3, tint: 0xfde68a });
      }
      this.float('鼠王飞艇被击落！', x, y - 30, 0xfde68a, 16);
    }
  }

  private fxBlock(x: number, y: number) {
    if (this.blockCd > 0) return;
    this.blockCd = 0.06;
    this.fxAdd.spawn('star', x, y - LIFT, { life: 0.16, s0: 0.9, s1: 0.3, rot: Math.random() * 3, tint: 0x94a3b8, alpha: 0.9 });
  }

  private fxBoom(x: number, y0: number, r: number) {
    const y = y0 - LIFT;
    this.fxAdd.spawn('soft', x, y, { life: 0.16, s0: r / 24, s1: r / 15, tint: 0xff9a4d, alpha: 0.55 });
    this.fxAdd.spawn('ring', x, y, { life: 0.32, s0: 0.2, s1: r / 28, tint: 0xfdba74, alpha: 0.85 });
    this.fxAdd.spawn('ring', x, y0 + 2, { life: 0.4, s0: 0.2, s1: r / 28, tint: 0xfb923c, alpha: 0.45 });
    const n = this.quality === 'high' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('smoke', x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.2, {
        vx: Math.cos(a) * 30,
        vy: -18 - Math.random() * 20,
        drag: 0.94,
        life: 0.6 + Math.random() * 0.3,
        s0: r / 60,
        s1: r / 28,
        alpha: 0.55,
        tint: 0x3b3346,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('shard', x, y, {
        vx: Math.cos(a) * 160,
        vy: Math.sin(a) * 160 - 60,
        grav: 420,
        life: 0.5,
        spin: 12,
        s0: 0.6,
        tint: i % 2 ? 0xf472b6 : 0xfb923c,
      });
    }
    this.shake = Math.max(this.shake, r > 50 ? 3 : 1.5);
  }

  private fxTracer(x1: number, y1: number, x2: number, y2b: number) {
    let from = { x: x1, y: y1 - LIFT };
    for (const v of this.towers.values()) {
      if (v.t.x === x1 && v.t.y === y1) {
        from = this.weaponTip(v);
        break;
      }
    }
    const y2 = y2b - LIFT;
    const dx = x2 - from.x;
    const dy = y2 - from.y;
    const len = Math.hypot(dx, dy);
    this.fxAdd.spawn('beam', x2, y2, { life: 0.14, s0: 1, sx: len / 32, sy: 0.7, rot: Math.atan2(dy, dx), tint: 0xd9f99d });
    this.fxAdd.spawn('star', x2, y2, { life: 0.12, s0: 1, s1: 0.3, tint: 0xecfccb, rot: Math.random() * 3 });
  }

  private fxPulse(x: number, y: number, r: number) {
    this.fxAdd.spawn('soft', x, y, { life: 0.45, s0: r / 40, s1: r / 17, tint: 0x7dd3fc, alpha: 0.28 });
    this.fxAdd.spawn('ring', x, y, { life: 0.45, s0: 0.25, s1: r / 28, tint: 0xbae6fd, alpha: 0.85 });
    const n = this.quality === 'high' ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.3 + Math.random() * 0.6);
      this.fxAdd.spawn('flake', x + Math.cos(a) * d, y + Math.sin(a) * d - 6, {
        vx: Math.cos(a) * 20,
        vy: -12,
        life: 0.7 + Math.random() * 0.4,
        spin: (Math.random() - 0.5) * 4,
        s0: 0.6 + Math.random() * 0.5,
        s1: 0.2,
        tint: 0xe0f2fe,
      });
    }
  }

  private poof(x: number, y: number, u: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.fx.spawn('smoke', x + Math.cos(a) * 6, y + Math.sin(a) * 6, {
        vx: Math.cos(a) * 50,
        vy: Math.sin(a) * 40 - 20,
        drag: 0.9,
        life: 0.55,
        s0: u / 40,
        s1: u / 18,
        alpha: 0.6,
        tint: 0xcbd5e1,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.fxAdd.spawn('star', x, y, { vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 80, grav: 260, life: 0.6, spin: 6, s0: 0.8, s1: 0.3, tint: 0xfbbf24 });
    }
  }

  /** 页面在升级成功后调用 */
  upgraded(t: Tower, name: string) {
    const v = this.towers.get(t.id);
    if (v) v.jump = 1;
    const color = A.hexNum(A.CAT_LOOK[t.def.id].accent);
    this.fxAdd.spawn('ring', t.x, t.y, { life: 0.5, s0: 0.3, s1: (t.def.r + 22) / 28, sy: 0.6, tint: 0xfbbf24 });
    this.fxAdd.spawn('soft', t.x, t.y - t.def.r * 0.8, { life: 0.35, s0: 1.2, s1: 2.6, tint: color, alpha: 0.7 });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 80 + Math.random() * 120;
      this.fxAdd.spawn('star', t.x, t.y - t.def.r * 0.6, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        grav: 220,
        drag: 0.95,
        life: 0.7,
        spin: 7,
        s0: 0.9,
        s1: 0.3,
        tint: i % 2 ? 0xfde68a : color,
      });
    }
    this.float(`升级 · ${name}`, t.x, t.y - t.def.r * 2.2, 0xfde68a, 13);
  }

  sold(t: Tower, value: number) {
    this.float(`+$${value}`, t.x, t.y - t.def.r * 2, 0xfbbf24, 14);
  }

  private float(text: string, x: number, y: number, color: number, size: number) {
    let f = this.floaters.find((q) => !q.alive);
    if (!f) {
      if (this.floaters.length >= 30) return;
      const t = new Text({
        text: '',
        style: { fontFamily: FONT, fontSize: 14, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x0b1020, width: 3 } },
        resolution: 2,
      });
      t.anchor.set(0.5);
      this.overlay.addChild(t);
      f = { t, vy: 0, life: 0, max: 1, alive: false };
      this.floaters.push(f);
    }
    f.alive = true;
    f.t.visible = true;
    f.t.text = text;
    f.t.style.fill = color;
    f.t.style.fontSize = size;
    f.t.position.set(x, y);
    f.vy = -34;
    f.max = f.life = size > 13 ? 1.2 : 0.7;
  }

  /* ---------- 每帧 ---------- */

  frame(game: MeowGame, view: FrameView, dt: number) {
    if (this.game !== game) this.bindGame(game);
    this.time = view.time;
    this.frameId += 1;
    this.blockCd -= dt;

    this.syncBloons(game, dt);
    this.syncTowers(game, view, dt);
    this.syncProjs(game);
    this.fx.update(dt);
    this.fxAdd.update(dt);
    this.drawRange(view);
    this.drawGhost(view);
    this.ambientStep(game, dt);

    for (const f of this.floaters) {
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.alive = false;
        f.t.visible = false;
        continue;
      }
      f.t.y += f.vy * dt;
      f.vy *= Math.pow(0.9, dt * 60);
      const k = f.life / f.max;
      f.t.alpha = Math.min(1, k * 3);
      f.t.scale.set(1 + Math.max(0, k - 0.8) * 1.2);
    }

    this.bannerStep(view);
    this.hintL.text = view.hint;
    this.hintR.text = view.speed > 1 ? `▶▶ ${view.speed}×` : '';

    this.flashRed = Math.max(0, this.flashRed - dt * 1.6);
    this.redFlash.alpha = this.flashRed * 0.7;
    this.shake *= Math.exp(-dt * 9);
    if (this.shake < 0.05) this.shake = 0;
    this.world.position.set((Math.random() - 0.5) * this.shake * 2, (Math.random() - 0.5) * this.shake * 2);

    this.app.render();
  }

  private drawRange(view: FrameView) {
    const g = this.range;
    g.clear();
    const t = view.selected ?? (view.placing ? null : view.hoverTower);
    if (t && t.stats.range < 2000) {
      const c = A.hexNum(t.def.color);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      g.circle(t.x, t.y, t.stats.range)
        .fill({ color: c, alpha: view.selected ? 0.07 : 0.04 })
        .stroke({ color: c, alpha: 0.35 + pulse * 0.25, width: 1.4 });
    }
    if (view.placing && view.hover && view.placing.base.range < 2000) {
      const c = view.placeOk ? 0x22d3ee : 0xfb7185;
      g.circle(view.hover.x, view.hover.y, view.placing.base.range)
        .fill({ color: c, alpha: 0.08 })
        .stroke({ color: c, alpha: 0.7, width: 1.4 });
    }
  }

  private drawGhost(view: FrameView) {
    for (const [k, c] of this.ghosts) c.root.visible = view.placing?.id === k && !!view.hover;
    if (!view.placing || !view.hover) return;
    const kind = view.placing.id;
    let c = this.ghosts.get(kind);
    if (!c) {
      c = this.makeCat(kind);
      c.root.addChildAt(this.bank.sprite(`plat:${kind}`), 0);
      c.rig.scale.set(CAT_SCALE);
      this.ghostLayer.addChild(c.root);
      this.ghosts.set(kind, c);
    }
    c.root.visible = true;
    c.root.position.set(view.hover.x, view.hover.y);
    c.root.alpha = view.placeOk ? 0.85 : 0.55;
    c.root.tint = view.placeOk ? 0xffffff : 0xff7a7a;
    this.poseCat(c, kind, -Math.PI / 2, 0, 0);
  }

  private ambientStep(game: MeowGame, dt: number) {
    const time = this.time;
    for (const f of this.fireflies) {
      f.s.position.set(f.x + Math.sin(time * f.sp + f.ph) * 34, f.y + Math.cos(time * f.sp * 0.8 + f.ph) * 22);
      f.s.alpha = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2.6 + f.ph * 3));
    }
    for (const f of this.fogs) {
      f.x += dt * 7;
      if (f.x > FIELD_W + 300) f.x = -300;
    }
    const total = game.geo.total;
    this.flowDots.forEach((d, i) => {
      const p = posAt(game.geo, (time * 46 + (i * total) / this.flowDots.length) % total);
      d.position.set(p.x, p.y);
    });
    this.chevrons.forEach((c, i) => {
      c.alpha = 0.15 + 0.75 * Math.max(0, Math.sin(time * 4 - i * 0.9));
    });
    this.portalPulse = Math.max(0, this.portalPulse - dt * 1.2);
    this.portalGlow.alpha = 0.2 + 0.08 * Math.sin(time * 2) + this.portalPulse * 0.45;
    this.houseGlow.alpha = 0.35 + 0.1 * Math.sin(time * 1.7);
    this.houseGlow.scale.set(2.2);
  }

  private bannerStep(view: FrameView) {
    const b = view.banner;
    if (!b) {
      this.banner.visible = false;
      this.bannerRef = null;
      return;
    }
    if (b !== this.bannerRef) {
      this.bannerRef = b;
      this.bannerTitle.text = b.title;
      this.bannerSub.text = b.sub;
      this.bannerTitle.y = b.sub ? -8 : 0;
    }
    const t = 1 - b.life / b.max;
    const inK = clamp01(t * 6);
    const outK = clamp01((b.life / b.max) * 6);
    this.banner.visible = true;
    this.banner.alpha = Math.min(inK, outK);
    this.bannerTitle.scale.set(1 + (1 - easeOutBack(inK)) * 0.35);
    this.banner.y = 62 - (1 - inK) * 10;
  }

  destroy() {
    this.app.destroy({ removeView: false }, { children: true, texture: false });
    this.bank.destroy();
  }
}

function resolutionFor(q: Quality): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return q === 'high' ? Math.min(2, dpr) : 1;
}
