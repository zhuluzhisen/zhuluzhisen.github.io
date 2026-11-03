/**
 * 喵星防线 · 美术
 * 用 Canvas 2D 按 3 倍精度画好每个「模型」部件，交给 Pixi 当纹理。
 * 猫猫拆成 底座/尾巴/身体/头/眼睛/武器，方便分别做动画。
 */
import { BLOONS, TOWERS, type BloonId, type TowerKind } from './data.ts';
import { FIELD_H, FIELD_W, distToPath, type MapDef, type PathGeo } from './maps.ts';

export const SS = 3;
type G = CanvasRenderingContext2D;

export interface Art {
  canvas: HTMLCanvasElement;
  /** 锚点（0–1） */
  ax: number;
  ay: number;
  /** 采样倍率 */
  res: number;
}

/** 画一张 w×h（逻辑像素）的图，原点平移到 (ox, oy) */
function paint(w: number, h: number, ox: number, oy: number, draw: (g: G) => void, res = SS): Art {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * res);
  c.height = Math.ceil(h * res);
  const g = c.getContext('2d')!;
  g.scale(res, res);
  g.translate(ox, oy);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g);
  return { canvas: c, ax: ox / w, ay: oy / h, res };
}

/* ---------------- 颜色 ---------------- */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const light = (c: string, t: number) => mix(c, '#ffffff', t);
const dark = (c: string, t: number) => mix(c, '#000000', t);

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function hexNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const INK = '#0a0e1a';

/* ---------------- 气球 ---------------- */

function balloonPath(g: G, r: number) {
  g.beginPath();
  g.moveTo(0, -r * 1.05);
  g.bezierCurveTo(r * 0.98, -r * 1.05, r * 1.08, r * 0.25, r * 0.12, r * 0.98);
  g.quadraticCurveTo(0, r * 1.04, -r * 0.12, r * 0.98);
  g.bezierCurveTo(-r * 1.08, r * 0.25, -r * 0.98, -r * 1.05, 0, -r * 1.05);
  g.closePath();
}

const BALLOON_TONE: Partial<Record<BloonId, [string, string, string]>> = {
  black: ['#717c97', '#283044', '#06080e'],
  white: ['#ffffff', '#e6ebf3', '#8b9ab3'],
  ceramic: ['#fdba74', '#c2410c', '#5a1d06'],
};

function balloonBody(g: G, t: BloonId, r: number) {
  const base = BLOONS[t].color;
  const [hi, mid, lo] = BALLOON_TONE[t] ?? [light(base, 0.55), base, dark(base, 0.5)];

  balloonPath(g, r);
  if (t === 'lead') {
    const lg = g.createLinearGradient(-r, -r, r, r);
    lg.addColorStop(0, '#e2e8f0');
    lg.addColorStop(0.3, '#7b879a');
    lg.addColorStop(0.52, '#d5dce6');
    lg.addColorStop(0.75, '#56627a');
    lg.addColorStop(1, '#2b3344');
    g.fillStyle = lg;
  } else if (t === 'rainbow') {
    const lg = g.createLinearGradient(-r, -r * 1.1, r * 0.8, r);
    ['#fb7185', '#fb923c', '#fde047', '#4ade80', '#22d3ee', '#818cf8', '#e879f9'].forEach((c, i, a) =>
      lg.addColorStop(i / (a.length - 1), c),
    );
    g.fillStyle = lg;
  } else if (t === 'zebra') {
    g.fillStyle = '#f4f7fb';
  } else {
    const rg = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.25);
    rg.addColorStop(0, hi);
    rg.addColorStop(0.42, mid);
    rg.addColorStop(1, lo);
    g.fillStyle = rg;
  }
  g.fill();

  g.save();
  balloonPath(g, r);
  g.clip();

  if (t === 'zebra') {
    g.fillStyle = '#10141f';
    for (let k = -3; k <= 3; k++) {
      const y = k * r * 0.46;
      g.beginPath();
      g.moveTo(-r * 1.3, y - r * 0.2);
      g.quadraticCurveTo(0, y - r * 0.02, r * 1.3, y + r * 0.08);
      g.lineTo(r * 1.3, y + r * 0.26);
      g.quadraticCurveTo(0, y + r * 0.16, -r * 1.3, y - r * 0.02);
      g.closePath();
      g.fill();
    }
  }

  if (t === 'ceramic') {
    // 釉面花纹
    g.strokeStyle = 'rgba(254,215,170,0.55)';
    g.lineWidth = r * 0.07;
    for (const y of [-0.35, 0.3]) {
      g.beginPath();
      g.ellipse(0, y * r, r * 1.1, r * 0.22, 0, 0, Math.PI);
      g.stroke();
    }
    g.fillStyle = 'rgba(254,215,170,0.5)';
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.arc(i * r * 0.32, -r * 0.02 + Math.abs(i) * r * 0.04, r * 0.06, 0, Math.PI * 2);
      g.fill();
    }
  }

  // 体积阴影
  const sh = g.createRadialGradient(-r * 0.3, -r * 0.42, r * 0.2, 0, 0, r * 1.2);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0.08)');
  sh.addColorStop(1, t === 'black' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.42)');
  g.fillStyle = sh;
  g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);

  // 底部反光
  const bounce = g.createRadialGradient(r * 0.25, r * 0.72, 0, r * 0.25, r * 0.72, r * 0.65);
  bounce.addColorStop(0, 'rgba(255,255,255,0.2)');
  bounce.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = bounce;
  g.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);

  // 边缘光
  const rim = g.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, 'rgba(255,255,255,0.7)');
  rim.addColorStop(0.45, 'rgba(255,255,255,0)');
  rim.addColorStop(1, t === 'black' ? 'rgba(148,163,184,0.5)' : 'rgba(255,255,255,0.22)');
  g.strokeStyle = rim;
  g.lineWidth = r * 0.16;
  balloonPath(g, r * 0.99);
  g.stroke();
  g.restore();

  // 描边
  g.strokeStyle = t === 'lead' ? '#262e3d' : 'rgba(6,8,16,0.55)';
  g.lineWidth = t === 'lead' ? 1.2 : 0.8;
  balloonPath(g, r);
  g.stroke();

  // 高光
  const sp = g.createRadialGradient(-r * 0.38, -r * 0.5, 0, -r * 0.38, -r * 0.5, r * 0.42);
  sp.addColorStop(0, 'rgba(255,255,255,0.55)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp;
  g.beginPath();
  g.ellipse(-r * 0.38, -r * 0.5, r * 0.3, r * 0.42, -0.45, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.ellipse(-r * 0.43, -r * 0.56, r * 0.08, r * 0.15, -0.45, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(-r * 0.18, -r * 0.78, r * 0.045, 0, Math.PI * 2);
  g.fill();
  if (t === 'lead') {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(r * 0.28, -r * 0.55, r * 0.08, r * 0.9);
  }
}

export function balloonArt(t: BloonId): Art {
  const r = BLOONS[t].r;
  const w = r * 2.6;
  const h = r * 3.7;
  return paint(w, h, w / 2, r * 1.3, (g) => {
    // 绳子
    g.strokeStyle = 'rgba(226,232,240,0.5)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(0, r * 1.12);
    g.bezierCurveTo(r * 0.35, r * 1.5, -r * 0.35, r * 1.85, r * 0.08, r * 2.3);
    g.stroke();
    // 气球嘴
    const knot = t === 'zebra' || t === 'rainbow' ? '#cbd5e1' : t === 'black' ? '#2a3142' : dark(BLOONS[t].color, 0.15);
    g.fillStyle = knot;
    g.beginPath();
    g.moveTo(-r * 0.1, r * 0.95);
    g.lineTo(-r * 0.22, r * 1.2);
    g.quadraticCurveTo(0, r * 1.1, r * 0.22, r * 1.2);
    g.lineTo(r * 0.1, r * 0.95);
    g.closePath();
    g.fill();
    balloonBody(g, t, r);
  });
}

const NOMINAL = 12;

/** 迷彩斑点 + 虚线圈，按 12 像素半径画，用时缩放 */
export function camoArt(): Art {
  const r = NOMINAL;
  const w = r * 3;
  return paint(w, w, w / 2, w / 2, (g) => {
    g.save();
    balloonPath(g, r);
    g.clip();
    const rand = rng(11);
    const colors = ['rgba(63,98,18,0.75)', 'rgba(113,63,18,0.6)', 'rgba(101,163,13,0.6)', 'rgba(20,40,10,0.55)'];
    for (let i = 0; i < 14; i++) {
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      const x = (rand() - 0.5) * r * 2;
      const y = (rand() - 0.5) * r * 2.2;
      g.ellipse(x, y, r * (0.18 + rand() * 0.22), r * (0.12 + rand() * 0.18), rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(163,230,53,0.85)';
    g.lineWidth = 1;
    g.setLineDash([2.5, 2.5]);
    g.beginPath();
    g.arc(0, 0, r * 1.38, 0, Math.PI * 2);
    g.stroke();
  });
}

export function frostArt(): Art {
  const r = NOMINAL;
  const w = r * 3.2;
  return paint(w, w, w / 2, w / 2, (g) => {
    g.save();
    g.scale(1.14, 1.12);
    balloonPath(g, r);
    const ice = g.createLinearGradient(-r, -r, r, r);
    ice.addColorStop(0, 'rgba(240,249,255,0.75)');
    ice.addColorStop(0.5, 'rgba(147,210,250,0.38)');
    ice.addColorStop(1, 'rgba(56,189,248,0.5)');
    g.fillStyle = ice;
    g.fill();
    g.strokeStyle = 'rgba(224,242,254,0.95)';
    g.lineWidth = 0.9;
    g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    const rand = rng(5);
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const d = r * (1.05 + rand() * 0.15);
      const x = Math.cos(a) * d * 0.95;
      const y = Math.sin(a) * d * 1.08;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(r * 0.35, 0);
      g.lineTo(0, -r * 0.1);
      g.lineTo(0, r * 0.1);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.6);
    g.lineTo(-r * 0.2, -r * 0.9);
    g.moveTo(-r * 0.62, -r * 0.2);
    g.lineTo(-r * 0.45, -r * 0.4);
    g.stroke();
  });
}

/** 陶瓷裂纹：1–3 档 */
export function crackArt(stage: number): Art {
  const r = BLOONS.ceramic.r;
  const w = r * 2.6;
  const lines = [
    [-0.5, -0.6, -0.15, -0.15, -0.32, 0.3, -0.1, 0.5],
    [0.5, -0.55, 0.12, -0.08, 0.42, 0.38],
    [-0.62, 0.2, -0.22, 0.25, 0.02, 0.72],
    [0.15, -0.9, 0.02, -0.35, 0.3, -0.05, 0.6, 0.1],
    [-0.25, 0.65, 0.2, 0.45, 0.35, 0.8],
  ];
  const n = [0, 2, 3, 5][stage];
  return paint(w, w, w / 2, w / 2, (g) => {
    g.save();
    balloonPath(g, r);
    g.clip();
    for (let i = 0; i < n; i++) {
      const p = lines[i];
      for (const [color, width, off] of [
        ['rgba(255,237,213,0.5)', 1.6, 0.6],
        ['rgba(40,12,2,0.95)', 1.1, 0],
      ] as const) {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(p[0] * r + off, p[1] * r + off);
        for (let k = 2; k < p.length; k += 2) g.lineTo(p[k] * r + off, p[k + 1] * r + off);
        g.stroke();
      }
    }
    g.restore();
  });
}

/** 白色剪影，命中闪白用 */
export function silhouetteArt(): Art {
  const r = NOMINAL;
  const w = r * 2.6;
  return paint(w, w, w / 2, w / 2, (g) => {
    balloonPath(g, r);
    g.fillStyle = '#ffffff';
    g.fill();
  });
}

/** 橡皮碎片（白色，用时着色） */
export function shardArt(): Art {
  return paint(10, 8, 5, 4, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-4.5, 1);
    g.quadraticCurveTo(-1, -3.8, 4.5, -1.8);
    g.quadraticCurveTo(1.5, -0.6, 3, 2.6);
    g.quadraticCurveTo(-1, 0.6, -4.5, 1);
    g.closePath();
    g.fill();
  });
}

/* ---------------- 鼠王飞艇 ---------------- */

export function bossArt(): Art {
  const r = BLOONS.boss.r;
  const w = r * 4.4;
  const h = r * 2.8;
  return paint(w, h, r * 2.1, h / 2, (g) => {
    // 尾翼
    for (const s of [-1, 1]) {
      const fin = g.createLinearGradient(-r * 1.2, 0, -r * 1.9, s * r * 1.15);
      fin.addColorStop(0, '#5b21b6');
      fin.addColorStop(1, '#2e1065');
      g.fillStyle = fin;
      g.strokeStyle = INK;
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(-r * 1.05, s * r * 0.45);
      g.lineTo(-r * 1.85, s * r * 1.18);
      g.quadraticCurveTo(-r * 1.95, s * r * 0.7, -r * 1.6, s * r * 0.18);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(196,181,253,0.6)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(-r * 1.15, s * r * 0.5);
      g.lineTo(-r * 1.75, s * r * 1.05);
      g.stroke();
    }

    // 艇身
    const body = g.createLinearGradient(0, -r * 0.95, 0, r * 0.95);
    body.addColorStop(0, '#ede9fe');
    body.addColorStop(0.25, '#a78bfa');
    body.addColorStop(0.65, '#6d28d9');
    body.addColorStop(1, '#2e1065');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, r * 1.65, r * 0.9, 0, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.beginPath();
    g.ellipse(0, 0, r * 1.65, r * 0.9, 0, 0, Math.PI * 2);
    g.clip();
    // 蒙皮分块
    for (const x of [-1.05, -0.35, 0.35]) {
      g.strokeStyle = 'rgba(30,10,60,0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(x * r, 0, r * 0.18, r * 0.95, 0, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.strokeStyle = 'rgba(237,233,254,0.35)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.ellipse(x * r - 1, 0, r * 0.18, r * 0.95, 0, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.fillStyle = 'rgba(237,233,254,0.55)';
      for (const y of [-0.55, -0.2, 0.2, 0.55]) {
        g.beginPath();
        g.arc(x * r + r * 0.16, y * r, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 顶部高光
    const hl = g.createRadialGradient(-r * 0.2, -r * 0.55, 0, -r * 0.2, -r * 0.55, r * 1.1);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(-r * 2, -r, r * 4, r * 2);
    // 金色腰带
    g.fillStyle = 'rgba(251,191,36,0.85)';
    g.fillRect(-r * 1.7, -r * 0.06, r * 3.4, r * 0.12);
    g.restore();

    g.strokeStyle = INK;
    g.lineWidth = 1.3;
    g.beginPath();
    g.ellipse(0, 0, r * 1.65, r * 0.9, 0, 0, Math.PI * 2);
    g.stroke();

    // 王冠徽记
    g.fillStyle = '#fbbf24';
    g.strokeStyle = '#78350f';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-r * 0.3, -r * 0.1);
    g.lineTo(-r * 0.3, -r * 0.5);
    g.lineTo(-r * 0.15, -r * 0.3);
    g.lineTo(0, -r * 0.6);
    g.lineTo(r * 0.15, -r * 0.3);
    g.lineTo(r * 0.3, -r * 0.5);
    g.lineTo(r * 0.3, -r * 0.1);
    g.closePath();
    g.fill();
    g.stroke();

    // 鼠头
    g.save();
    g.translate(r * 1.4, 0);
    for (const s of [-1, 1]) {
      g.fillStyle = '#a78bfa';
      g.strokeStyle = INK;
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(-r * 0.05, s * r * 0.78, r * 0.38, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#f9a8d4';
      g.beginPath();
      g.arc(-r * 0.02, s * r * 0.8, r * 0.22, 0, Math.PI * 2);
      g.fill();
    }
    const face = g.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
    face.addColorStop(0, '#ddd6fe');
    face.addColorStop(1, '#7c3aed');
    g.fillStyle = face;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(-r * 0.2, -r * 0.52);
    g.quadraticCurveTo(r * 0.55, -r * 0.42, r * 0.72, 0);
    g.quadraticCurveTo(r * 0.55, r * 0.42, -r * 0.2, r * 0.52);
    g.closePath();
    g.fill();
    g.stroke();
    // 眼睛
    for (const s of [-1, 1]) {
      g.fillStyle = '#1a0510';
      g.beginPath();
      g.ellipse(r * 0.18, s * r * 0.26, r * 0.13, r * 0.11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff3b3b';
      g.beginPath();
      g.arc(r * 0.2, s * r * 0.26, r * 0.07, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(r * 0.18, s * r * 0.24, r * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fb7185';
    g.strokeStyle = INK;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(r * 0.74, 0, r * 0.12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(r * 0.62, s * r * 0.08);
      g.lineTo(r * 1.05, s * r * 0.3);
      g.moveTo(r * 0.6, s * r * 0.13);
      g.lineTo(r * 0.95, s * r * 0.5);
    }
    g.stroke();
    g.restore();
  });
}

export function propellerArt(): Art {
  const r = BLOONS.boss.r;
  return paint(r * 0.5, r * 1.6, r * 0.25, r * 0.8, (g) => {
    const bl = g.createLinearGradient(-3, 0, 3, 0);
    bl.addColorStop(0, '#94a3b8');
    bl.addColorStop(0.5, '#f1f5f9');
    bl.addColorStop(1, '#475569');
    g.fillStyle = bl;
    g.strokeStyle = INK;
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(0, s * r * 0.4, r * 0.11, r * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#fbbf24';
    g.beginPath();
    g.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });
}

export function ratTailArt(): Art {
  const r = BLOONS.boss.r;
  return paint(r * 1.8, r * 0.9, r * 1.75, r * 0.45, (g) => {
    g.strokeStyle = INK;
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-r * 0.5, -r * 0.35, -r * 1.0, r * 0.35, -r * 1.6, 0);
    g.stroke();
    g.strokeStyle = '#f9a8d4';
    g.lineWidth = 1.8;
    g.stroke();
  });
}

/* ---------------- 猫猫 ---------------- */

interface CatLook {
  fur: string;
  furDark: string;
  furLight: string;
  belly: string;
  eye: string;
  accent: string;
}

export const CAT_LOOK: Record<TowerKind, CatLook> = {
  claw: { fur: '#9fb2c8', furDark: '#55677e', furLight: '#e6edf5', belly: '#f1f5f9', eye: '#22d3ee', accent: '#22d3ee' },
  yarn: { fur: '#fb923c', furDark: '#b9480f', furLight: '#fed7aa', belly: '#fff7ed', eye: '#a3e635', accent: '#f472b6' },
  snipe: { fur: '#2d3443', furDark: '#12161f', furLight: '#566074', belly: '#3d4555', eye: '#a3e635', accent: '#a3e635' },
  ice: { fur: '#eaf2fb', furDark: '#a9bcd4', furLight: '#ffffff', belly: '#ffffff', eye: '#38bdf8', accent: '#7dd3fc' },
  super: { fur: '#fbbf24', furDark: '#b45309', furLight: '#fef3c7', belly: '#fffbeb', eye: '#ff4d4d', accent: '#ef4444' },
};

/** 猫猫各部件相对底座中心的位置（单位：塔半径 u） */
export const CAT_RIG = {
  body: [0, -0.32],
  head: [0, -1.02],
  eyeL: [-0.26, -0.98],
  eyeR: [0.26, -0.98],
  weapon: [0.34, -0.36],
  tail: [-0.42, -0.1],
} as const;

function fur(g: G, look: CatLook, cx: number, cy: number, rad: number) {
  const fg = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.45, rad * 0.05, cx, cy, rad * 1.15);
  fg.addColorStop(0, look.furLight);
  fg.addColorStop(0.45, look.fur);
  fg.addColorStop(1, look.furDark);
  return fg;
}

function outline(g: G, w = 1.1) {
  g.strokeStyle = INK;
  g.lineWidth = w;
  g.stroke();
}

export function platformArt(kind: TowerKind): Art {
  const def = TOWERS[kind];
  const u = def.r;
  const rx = u + 3;
  const ry = rx * 0.6;
  const w = rx * 2 + 6;
  const h = ry * 2 + 10;
  return paint(w, h, w / 2, ry + 3, (g) => {
    // 侧面
    const side = g.createLinearGradient(-rx, 0, rx, 0);
    side.addColorStop(0, '#0b1020');
    side.addColorStop(0.5, '#1c2538');
    side.addColorStop(1, '#070a14');
    g.fillStyle = side;
    g.beginPath();
    g.ellipse(0, 4, rx, ry, 0, 0, Math.PI);
    g.lineTo(-rx, 0);
    g.ellipse(0, 0, rx, ry, 0, Math.PI, 0, true);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.stroke();
    // 侧面灯带
    g.strokeStyle = rgba(def.color, 0.9);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 2.4, rx - 0.5, ry - 0.3, 0, 0.15, Math.PI - 0.15);
    g.stroke();
    // 顶面
    const top = g.createLinearGradient(0, -ry, 0, ry);
    top.addColorStop(0, '#2a3550');
    top.addColorStop(1, '#121a2b');
    g.fillStyle = top;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.stroke();
    // 霓虹圈
    g.strokeStyle = rgba(def.color, 0.85);
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, 0, rx - 2.5, ry - 1.6, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(0, -0.6, rx - 0.8, ry - 0.6, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    // 刻度
    g.fillStyle = rgba(def.color, 0.55);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * (rx - 5), Math.sin(a) * (ry - 3.2), 0.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function tailArt(kind: TowerKind): Art {
  const look = CAT_LOOK[kind];
  const u = TOWERS[kind].r;
  // 锚点在尾根，尾巴朝左上翘
  return paint(u * 1.3, u * 1.4, u * 1.05, u * 1.2, (g) => {
    const path = () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-u * 0.7, -u * 0.05, -u * 0.95, -u * 0.6, -u * 0.6, -u * 1.05);
    };
    path();
    g.strokeStyle = INK;
    g.lineWidth = u * 0.34;
    g.stroke();
    path();
    g.strokeStyle = look.fur;
    g.lineWidth = u * 0.24;
    g.stroke();
    if (kind === 'yarn') {
      g.strokeStyle = look.furDark;
      g.lineWidth = u * 0.26;
      g.setLineDash([u * 0.12, u * 0.2]);
      path();
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = look.furLight;
    g.beginPath();
    g.arc(-u * 0.6, -u * 1.05, u * 0.12, 0, Math.PI * 2);
    g.fill();
  });
}

export function capeArt(): Art {
  const u = TOWERS.super.r;
  return paint(u * 1.8, u * 1.4, u * 0.9, u * 0.15, (g) => {
    const cg = g.createLinearGradient(0, 0, 0, u * 1.2);
    cg.addColorStop(0, '#f87171');
    cg.addColorStop(1, '#7f1d1d');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-u * 0.42, 0);
    g.quadraticCurveTo(-u * 0.85, u * 0.7, -u * 0.72, u * 1.15);
    g.quadraticCurveTo(-u * 0.35, u * 1.0, 0, u * 1.18);
    g.quadraticCurveTo(u * 0.35, u * 1.0, u * 0.72, u * 1.15);
    g.quadraticCurveTo(u * 0.85, u * 0.7, u * 0.42, 0);
    g.closePath();
    g.fill();
    outline(g);
  });
}

export function bodyArt(kind: TowerKind): Art {
  const look = CAT_LOOK[kind];
  const u = TOWERS[kind].r;
  return paint(u * 1.6, u * 1.4, u * 0.8, u * 0.75, (g) => {
    const path = () => {
      g.beginPath();
      g.moveTo(0, -u * 0.5);
      g.bezierCurveTo(u * 0.42, -u * 0.5, u * 0.62, u * 0.05, u * 0.58, u * 0.36);
      g.quadraticCurveTo(u * 0.55, u * 0.5, u * 0.3, u * 0.5);
      g.lineTo(-u * 0.3, u * 0.5);
      g.quadraticCurveTo(-u * 0.55, u * 0.5, -u * 0.58, u * 0.36);
      g.bezierCurveTo(-u * 0.62, u * 0.05, -u * 0.42, -u * 0.5, 0, -u * 0.5);
      g.closePath();
    };
    path();
    g.fillStyle = fur(g, look, 0, 0, u * 0.6);
    g.fill();
    g.save();
    path();
    g.clip();
    if (kind === 'yarn') {
      g.strokeStyle = rgba(look.furDark, 0.8);
      g.lineWidth = u * 0.08;
      for (const y of [-0.15, 0.08, 0.3]) {
        g.beginPath();
        g.moveTo(-u * 0.7, y * u);
        g.quadraticCurveTo(-u * 0.45, y * u - u * 0.08, -u * 0.32, y * u + u * 0.02);
        g.moveTo(u * 0.7, y * u);
        g.quadraticCurveTo(u * 0.45, y * u - u * 0.08, u * 0.32, y * u + u * 0.02);
        g.stroke();
      }
    }
    // 胸口白毛
    g.fillStyle = rgba(look.belly, kind === 'snipe' ? 0.55 : 0.92);
    g.beginPath();
    g.ellipse(0, u * 0.1, u * 0.26, u * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    // 背光
    const sh = g.createLinearGradient(-u * 0.6, 0, u * 0.6, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.12)');
    sh.addColorStop(0.6, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = sh;
    g.fillRect(-u, -u, u * 2, u * 2);
    g.restore();
    path();
    outline(g);

    // 服饰
    if (kind === 'claw') {
      g.fillStyle = look.accent;
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-u * 0.42, -u * 0.42);
      g.quadraticCurveTo(0, -u * 0.22, u * 0.42, -u * 0.42);
      g.lineTo(u * 0.4, -u * 0.26);
      g.quadraticCurveTo(0, -u * 0.06, -u * 0.4, -u * 0.26);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(-u * 0.22, -u * 0.18);
      g.lineTo(-u * 0.32, u * 0.18);
      g.lineTo(-u * 0.12, u * 0.12);
      g.closePath();
      g.fill();
      g.stroke();
    } else if (kind === 'snipe') {
      g.strokeStyle = '#4d7c0f';
      g.lineWidth = u * 0.12;
      g.beginPath();
      g.moveTo(-u * 0.38, -u * 0.3);
      g.lineTo(u * 0.4, u * 0.32);
      g.stroke();
      g.fillStyle = '#a3e635';
      g.fillRect(u * 0.02, -u * 0.04, u * 0.1, u * 0.1);
    } else if (kind === 'super') {
      g.fillStyle = '#ef4444';
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(0, -u * 0.12);
      g.lineTo(u * 0.16, u * 0.06);
      g.lineTo(0, u * 0.28);
      g.lineTo(-u * 0.16, u * 0.06);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fde68a';
      g.beginPath();
      g.arc(0, u * 0.08, u * 0.05, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'ice') {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.arc(i * u * 0.13, -u * 0.38 + Math.abs(i) * u * 0.03, u * 0.11, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 前爪
    for (const s of [-1, 1]) {
      g.fillStyle = look.furLight;
      g.beginPath();
      g.ellipse(s * u * 0.2, u * 0.46, u * 0.16, u * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      outline(g, 0.9);
      g.strokeStyle = rgba(INK, 0.6);
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(s * u * 0.2 - u * 0.04, u * 0.42);
      g.lineTo(s * u * 0.2 - u * 0.04, u * 0.5);
      g.moveTo(s * u * 0.2 + u * 0.04, u * 0.42);
      g.lineTo(s * u * 0.2 + u * 0.04, u * 0.5);
      g.stroke();
    }
  });
}

export function headArt(kind: TowerKind): Art {
  const look = CAT_LOOK[kind];
  const u = TOWERS[kind].r;
  const hr = u * 0.62;
  return paint(u * 1.9, u * 2, u * 0.95, u * 1.12, (g) => {
    // 耳朵
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * hr * 0.92, -hr * 0.25);
      g.quadraticCurveTo(s * hr * 1.02, -hr * 1.15, s * hr * 0.82, -hr * 1.38);
      g.quadraticCurveTo(s * hr * 0.4, -hr * 1.08, s * hr * 0.2, -hr * 0.82);
      g.closePath();
      g.fillStyle = fur(g, look, s * hr * 0.6, -hr * 0.9, hr * 0.6);
      g.fill();
      outline(g);
      g.beginPath();
      g.moveTo(s * hr * 0.8, -hr * 0.5);
      g.quadraticCurveTo(s * hr * 0.86, -hr * 1.05, s * hr * 0.76, -hr * 1.16);
      g.quadraticCurveTo(s * hr * 0.5, -hr * 0.95, s * hr * 0.36, -hr * 0.8);
      g.closePath();
      g.fillStyle = kind === 'snipe' ? '#7c5363' : '#f9a8d4';
      g.fill();
    }

    // 脸
    const face = () => {
      g.beginPath();
      g.ellipse(0, 0, hr * 1.06, hr * 0.92, 0, 0, Math.PI * 2);
    };
    face();
    g.fillStyle = fur(g, look, 0, 0, hr);
    g.fill();
    g.save();
    face();
    g.clip();
    if (kind === 'yarn') {
      // 虎斑「M」纹
      g.strokeStyle = rgba(look.furDark, 0.9);
      g.lineWidth = hr * 0.11;
      g.beginPath();
      g.moveTo(-hr * 0.32, -hr * 0.45);
      g.lineTo(-hr * 0.18, -hr * 0.78);
      g.lineTo(0, -hr * 0.5);
      g.lineTo(hr * 0.18, -hr * 0.78);
      g.lineTo(hr * 0.32, -hr * 0.45);
      g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * hr * 1.1, -hr * 0.05);
        g.lineTo(s * hr * 0.72, 0);
        g.moveTo(s * hr * 1.1, hr * 0.22);
        g.lineTo(s * hr * 0.78, hr * 0.22);
        g.stroke();
      }
    }
    if (kind === 'ice') {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(s * hr * (0.95 - i * 0.05), hr * (0.1 + i * 0.22), hr * 0.18, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // 口鼻白毛
    g.fillStyle = rgba(look.belly, kind === 'snipe' ? 0.35 : 0.95);
    g.beginPath();
    g.ellipse(-hr * 0.2, hr * 0.42, hr * 0.32, hr * 0.26, 0, 0, Math.PI * 2);
    g.ellipse(hr * 0.2, hr * 0.42, hr * 0.32, hr * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    // 右下阴影
    const sh = g.createLinearGradient(-hr, -hr, hr, hr);
    sh.addColorStop(0, 'rgba(255,255,255,0.16)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = sh;
    g.fillRect(-hr * 1.2, -hr * 1.2, hr * 2.4, hr * 2.4);
    g.restore();
    face();
    outline(g, 1.2);

    // 腮红
    g.fillStyle = 'rgba(251,113,133,0.4)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * hr * 0.66, hr * 0.32, hr * 0.17, hr * 0.1, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 鼻子与嘴
    g.fillStyle = '#fb7185';
    g.strokeStyle = INK;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-hr * 0.11, hr * 0.22);
    g.quadraticCurveTo(0, hr * 0.16, hr * 0.11, hr * 0.22);
    g.lineTo(0, hr * 0.34);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, hr * 0.34);
    g.quadraticCurveTo(-hr * 0.08, hr * 0.5, -hr * 0.2, hr * 0.42);
    g.moveTo(0, hr * 0.34);
    g.quadraticCurveTo(hr * 0.08, hr * 0.5, hr * 0.2, hr * 0.42);
    g.stroke();
    // 胡须
    g.strokeStyle = kind === 'snipe' ? 'rgba(226,232,240,0.7)' : 'rgba(30,35,50,0.55)';
    g.lineWidth = 0.55;
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(s * hr * 0.42, hr * 0.38);
      g.lineTo(s * hr * 1.22, hr * 0.26);
      g.moveTo(s * hr * 0.42, hr * 0.46);
      g.lineTo(s * hr * 1.2, hr * 0.52);
    }
    g.stroke();

    // 头饰
    if (kind === 'claw') {
      g.fillStyle = look.accent;
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-hr * 0.98, -hr * 0.38);
      g.quadraticCurveTo(0, -hr * 0.78, hr * 0.98, -hr * 0.38);
      g.lineTo(hr * 0.94, -hr * 0.2);
      g.quadraticCurveTo(0, -hr * 0.6, -hr * 0.94, -hr * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(hr * 0.92, -hr * 0.3);
      g.lineTo(hr * 1.35, -hr * 0.5);
      g.lineTo(hr * 1.3, -hr * 0.12);
      g.closePath();
      g.fill();
      g.stroke();
    } else if (kind === 'snipe') {
      g.save();
      g.rotate(-0.18);
      const beret = g.createLinearGradient(0, -hr * 1.2, 0, -hr * 0.5);
      beret.addColorStop(0, '#65a30d');
      beret.addColorStop(1, '#365314');
      g.fillStyle = beret;
      g.beginPath();
      g.ellipse(hr * 0.1, -hr * 0.72, hr * 0.95, hr * 0.38, 0, 0, Math.PI * 2);
      g.fill();
      outline(g);
      g.fillStyle = '#facc15';
      g.beginPath();
      g.arc(-hr * 0.45, -hr * 0.66, hr * 0.12, 0, Math.PI * 2);
      g.fill();
      outline(g, 0.6);
      g.restore();
    } else if (kind === 'ice') {
      g.fillStyle = '#e0f2fe';
      g.strokeStyle = '#0c4a6e';
      g.lineWidth = 0.8;
      for (const [x, hgt] of [
        [-0.42, 0.42],
        [0, 0.62],
        [0.42, 0.42],
      ]) {
        g.beginPath();
        g.moveTo(x * hr - hr * 0.13, -hr * 0.74);
        g.lineTo(x * hr, -hr * (0.74 + hgt));
        g.lineTo(x * hr + hr * 0.13, -hr * 0.74);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.fillStyle = '#7dd3fc';
      g.fillRect(-hr * 0.6, -hr * 0.8, hr * 1.2, hr * 0.12);
    } else if (kind === 'super') {
      const crown = g.createLinearGradient(0, -hr * 1.5, 0, -hr * 0.7);
      crown.addColorStop(0, '#fff7c2');
      crown.addColorStop(1, '#d97706');
      g.fillStyle = crown;
      g.strokeStyle = INK;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(-hr * 0.55, -hr * 0.72);
      g.lineTo(-hr * 0.6, -hr * 1.28);
      g.lineTo(-hr * 0.28, -hr * 1.02);
      g.lineTo(0, -hr * 1.45);
      g.lineTo(hr * 0.28, -hr * 1.02);
      g.lineTo(hr * 0.6, -hr * 1.28);
      g.lineTo(hr * 0.55, -hr * 0.72);
      g.closePath();
      g.fill();
      g.stroke();
      for (const [x, c] of [
        [-0.3, '#ef4444'],
        [0, '#38bdf8'],
        [0.3, '#ef4444'],
      ] as const) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x * hr, -hr * 0.86, hr * 0.08, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

export function eyeArt(kind: TowerKind): Art {
  const look = CAT_LOOK[kind];
  const u = TOWERS[kind].r;
  const ex = u * 0.13;
  const ey = u * 0.17;
  return paint(ex * 3, ey * 3, ex * 1.5, ey * 1.5, (g) => {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(0, 0, ex + 0.7, ey + 0.7, 0, 0, Math.PI * 2);
    g.fill();
    const iris = g.createRadialGradient(0, ey * 0.2, 0, 0, 0, ey);
    iris.addColorStop(0, light(look.eye, 0.5));
    iris.addColorStop(0.7, look.eye);
    iris.addColorStop(1, dark(look.eye, 0.35));
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(0, 0, ex, ey, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05070d';
    g.beginPath();
    g.ellipse(0, ey * 0.05, ex * 0.34, ey * 0.78, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(-ex * 0.35, -ey * 0.42, ex * 0.3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ex * 0.3, ey * 0.35, ex * 0.14, 0, Math.PI * 2);
    g.fill();
  });
}

/** 武器朝 +x，锚点在握持处 */
export function weaponArt(kind: TowerKind): Art | null {
  const look = CAT_LOOK[kind];
  const u = TOWERS[kind].r;
  if (kind === 'super') return null;
  if (kind === 'claw') {
    return paint(u * 1.5, u * 0.9, u * 0.2, u * 0.45, (g) => {
      // 爪套
      g.fillStyle = '#334155';
      g.beginPath();
      g.roundRect(0, -u * 0.16, u * 0.55, u * 0.32, u * 0.08);
      g.fill();
      outline(g, 0.9);
      g.fillStyle = look.accent;
      g.fillRect(u * 0.12, -u * 0.16, u * 0.06, u * 0.32);
      g.fillStyle = look.furLight;
      g.beginPath();
      g.arc(-u * 0.02, 0, u * 0.17, 0, Math.PI * 2);
      g.fill();
      outline(g, 0.9);
      // 三片爪刃
      for (const s of [-1, 0, 1]) {
        g.save();
        g.translate(u * 0.55, s * u * 0.11);
        g.rotate(s * 0.18);
        const bl = g.createLinearGradient(0, -2, 0, 2);
        bl.addColorStop(0, '#ecfeff');
        bl.addColorStop(1, look.accent);
        g.fillStyle = bl;
        g.beginPath();
        g.moveTo(0, -u * 0.05);
        g.quadraticCurveTo(u * 0.4, -u * 0.08, u * 0.62, u * 0.04);
        g.quadraticCurveTo(u * 0.35, u * 0.03, 0, u * 0.05);
        g.closePath();
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 0.6;
        g.stroke();
        g.restore();
      }
    });
  }
  if (kind === 'yarn') {
    return paint(u * 1.7, u * 1, u * 0.25, u * 0.5, (g) => {
      const tube = g.createLinearGradient(0, -u * 0.22, 0, u * 0.22);
      tube.addColorStop(0, '#fcd34d');
      tube.addColorStop(0.5, '#b45309');
      tube.addColorStop(1, '#78350f');
      g.fillStyle = tube;
      g.beginPath();
      g.roundRect(-u * 0.1, -u * 0.2, u * 1.0, u * 0.4, u * 0.08);
      g.fill();
      outline(g, 0.9);
      g.fillStyle = '#451a03';
      g.fillRect(u * 0.3, -u * 0.2, u * 0.08, u * 0.4);
      g.fillRect(u * 0.62, -u * 0.2, u * 0.08, u * 0.4);
      // 装填的毛线球
      g.fillStyle = look.accent;
      g.beginPath();
      g.arc(u * 1.05, 0, u * 0.26, 0, Math.PI * 2);
      g.fill();
      outline(g, 0.9);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.arc(u * 1.05, 0, u * 0.16, -1.2, 1.6);
      g.moveTo(u * 0.85, -u * 0.08);
      g.quadraticCurveTo(u * 1.05, -u * 0.2, u * 1.25, -u * 0.02);
      g.stroke();
    });
  }
  if (kind === 'snipe') {
    return paint(u * 2.2, u * 0.9, u * 0.35, u * 0.45, (g) => {
      // 枪托
      g.fillStyle = '#5b3a1e';
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.1);
      g.lineTo(u * 0.25, -u * 0.12);
      g.lineTo(u * 0.25, u * 0.14);
      g.lineTo(-u * 0.3, u * 0.2);
      g.closePath();
      g.fill();
      outline(g, 0.8);
      // 枪管
      const bar = g.createLinearGradient(0, -u * 0.08, 0, u * 0.08);
      bar.addColorStop(0, '#94a3b8');
      bar.addColorStop(0.5, '#334155');
      bar.addColorStop(1, '#0f172a');
      g.fillStyle = bar;
      g.fillRect(u * 0.2, -u * 0.07, u * 1.55, u * 0.14);
      g.strokeStyle = INK;
      g.lineWidth = 0.8;
      g.strokeRect(u * 0.2, -u * 0.07, u * 1.55, u * 0.14);
      g.fillStyle = '#1e293b';
      g.fillRect(u * 1.65, -u * 0.11, u * 0.16, u * 0.22);
      // 瞄准镜
      g.fillStyle = '#1f2937';
      g.beginPath();
      g.roundRect(u * 0.35, -u * 0.3, u * 0.6, u * 0.16, u * 0.06);
      g.fill();
      outline(g, 0.7);
      g.fillStyle = look.accent;
      g.beginPath();
      g.arc(u * 0.95, -u * 0.22, u * 0.07, 0, Math.PI * 2);
      g.fill();
    });
  }
  // 冰霜法杖：竖着立在身边
  return paint(u * 0.8, u * 2, u * 0.4, u * 1.4, (g) => {
    g.strokeStyle = INK;
    g.lineWidth = u * 0.16;
    g.beginPath();
    g.moveTo(0, u * 0.5);
    g.lineTo(0, -u * 0.8);
    g.stroke();
    g.strokeStyle = '#94a3b8';
    g.lineWidth = u * 0.09;
    g.stroke();
    const cr = g.createLinearGradient(-u * 0.2, -u * 1.35, u * 0.2, -u * 0.8);
    cr.addColorStop(0, '#f0f9ff');
    cr.addColorStop(0.5, look.accent);
    cr.addColorStop(1, '#0369a1');
    g.fillStyle = cr;
    g.beginPath();
    g.moveTo(0, -u * 1.38);
    g.lineTo(u * 0.22, -u * 1.02);
    g.lineTo(0, -u * 0.74);
    g.lineTo(-u * 0.22, -u * 1.02);
    g.closePath();
    g.fill();
    outline(g, 0.8);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-u * 0.08, -u * 1.15);
    g.lineTo(0, -u * 1.3);
    g.stroke();
  });
}

/** 商店 / 面板里用的猫猫头像 */
export function catPortrait(kind: TowerKind, size = 72): string {
  const u = TOWERS[kind].r;
  const parts: [Art | null, number, number][] = [
    [tailArt(kind), CAT_RIG.tail[0] * u, CAT_RIG.tail[1] * u],
    [kind === 'super' ? capeArt() : null, 0, -0.72 * u],
    [bodyArt(kind), CAT_RIG.body[0] * u, CAT_RIG.body[1] * u],
    [weaponArt(kind), CAT_RIG.weapon[0] * u, CAT_RIG.weapon[1] * u],
    [headArt(kind), CAT_RIG.head[0] * u, CAT_RIG.head[1] * u],
    [eyeArt(kind), CAT_RIG.eyeL[0] * u, CAT_RIG.eyeL[1] * u],
    [eyeArt(kind), CAT_RIG.eyeR[0] * u, CAT_RIG.eyeR[1] * u],
  ];
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const scale = size / (u * 2.5);
  g.translate(size / 2, size * 0.86);
  g.scale(scale, scale);
  for (const [art, x, y] of parts) {
    if (!art) continue;
    const w = art.canvas.width / art.res;
    const h = art.canvas.height / art.res;
    g.drawImage(art.canvas, x - art.ax * w, y - art.ay * h, w, h);
  }
  return c.toDataURL('image/png');
}

/* ---------------- 特效贴图 ---------------- */

export function softArt(): Art {
  return paint(32, 32, 16, 16, (g) => {
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(-16, -16, 32, 32);
  }, 2);
}

export function ringArt(): Art {
  return paint(64, 64, 32, 32, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 28, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.8;
    g.stroke();
  }, 2);
}

export function starArt(): Art {
  return paint(16, 16, 8, 8, (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? 7.5 : 1.6;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  });
}

export function smokeArt(): Art {
  return paint(40, 40, 20, 20, (g) => {
    const rand = rng(3);
    for (let i = 0; i < 7; i++) {
      const x = (rand() - 0.5) * 14;
      const y = (rand() - 0.5) * 14;
      const rr = 7 + rand() * 6;
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

export function flakeArt(): Art {
  return paint(14, 14, 7, 7, (g) => {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.1;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      g.lineTo(-Math.cos(a) * 6, -Math.sin(a) * 6);
    }
    g.stroke();
  });
}

export function clawShotArt(): Art {
  return paint(16, 10, 9, 5, (g) => {
    g.fillStyle = '#ecfeff';
    g.strokeStyle = '#0e7490';
    g.lineWidth = 0.5;
    for (const s of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(-6, s * 2.4);
      g.quadraticCurveTo(1, s * 2.4 - 1.5, 6, s * 3);
      g.quadraticCurveTo(0, s * 2.4 + 0.8, -6, s * 2.4 + 0.9);
      g.closePath();
      g.fill();
      g.stroke();
    }
  });
}

export function yarnShotArt(): Art {
  return paint(16, 16, 8, 8, (g) => {
    const yg = g.createRadialGradient(-2, -2, 0, 0, 0, 7);
    yg.addColorStop(0, '#fbcfe8');
    yg.addColorStop(1, '#db2777');
    g.fillStyle = yg;
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 0.8;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-5, -1);
    g.quadraticCurveTo(0, -5, 5, -1);
    g.moveTo(-5, 2);
    g.quadraticCurveTo(0, -2, 5, 2);
    g.moveTo(-2, 5);
    g.quadraticCurveTo(-1, 0, 2, -5);
    g.stroke();
  });
}

/** 横向的光束：激光弹、拖尾、狙击弹道都用它拉伸 */
export function beamArt(): Art {
  return paint(32, 8, 16, 4, (g) => {
    const lg = g.createLinearGradient(-16, 0, 16, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    lg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg;
    g.beginPath();
    g.ellipse(0, 0, 16, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(-4, -0.8, 20, 1.6);
  }, 2);
}

export function chevronArt(): Art {
  return paint(12, 14, 6, 7, (g) => {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-3, -5);
    g.lineTo(3, 0);
    g.lineTo(-3, 5);
    g.stroke();
  });
}

export function shadowArt(): Art {
  return paint(40, 20, 20, 10, (g) => {
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, 20);
    rg.addColorStop(0, 'rgba(0,0,0,0.75)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.scale(1, 0.5);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }, 2);
}

export function vignetteArt(): Art {
  return paint(FIELD_W, FIELD_H, 0, 0, (g) => {
    const vg = g.createRadialGradient(FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.32, FIELD_W / 2, FIELD_H / 2, FIELD_W * 0.66);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = vg;
    g.fillRect(0, 0, FIELD_W, FIELD_H);
  }, 0.5);
}

export function fogArt(): Art {
  return paint(260, 140, 130, 70, (g) => {
    const rand = rng(21);
    for (let i = 0; i < 14; i++) {
      const x = (rand() - 0.5) * 170;
      const y = (rand() - 0.5) * 60;
      const rr = 30 + rand() * 40;
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.22)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
  }, 0.5);
}

export function warehouseArt(): Art {
  return paint(80, 84, 40, 58, (g) => {
    // 投影
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(4, 22, 36, 9, 0, 0, Math.PI * 2);
    g.fill();
    // 墙
    const wall = g.createLinearGradient(-28, 0, 28, 0);
    wall.addColorStop(0, '#2b3247');
    wall.addColorStop(1, '#151a28');
    g.fillStyle = wall;
    g.beginPath();
    g.roundRect(-26, -16, 52, 38, 3);
    g.fill();
    outline(g, 1.2);
    // 屋顶
    const roof = g.createLinearGradient(0, -48, 0, -12);
    roof.addColorStop(0, '#f59e0b');
    roof.addColorStop(1, '#92400e');
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(-34, -12);
    g.lineTo(0, -46);
    g.lineTo(34, -12);
    g.closePath();
    g.fill();
    outline(g, 1.2);
    g.strokeStyle = 'rgba(69,26,3,0.6)';
    g.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(-34 + i * 8.5, -12 - i * 8.5 + 0.5);
      g.lineTo(34 - i * 8.5, -12 - i * 8.5 + 0.5);
      g.stroke();
    }
    // 门
    g.fillStyle = '#05070d';
    g.beginPath();
    g.roundRect(-9, 2, 18, 20, [8, 8, 0, 0]);
    g.fill();
    const door = g.createLinearGradient(0, 2, 0, 22);
    door.addColorStop(0, 'rgba(251,191,36,0.0)');
    door.addColorStop(1, 'rgba(251,191,36,0.35)');
    g.fillStyle = door;
    g.fill();
    // 鱼招牌
    g.fillStyle = '#fbbf24';
    g.strokeStyle = '#78350f';
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(-3, -22, 9, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(5, -22);
    g.lineTo(12, -27);
    g.lineTo(12, -17);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1c1206';
    g.beginPath();
    g.arc(-8, -23, 1.3, 0, Math.PI * 2);
    g.fill();
  });
}

/* ---------------- 地图 ---------------- */

function strokePath(g: G, pts: [number, number][]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

function tuft(g: G, x: number, y: number, s: number, rand: () => number) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x + 1.5, y + 1.5, s * 1.3, s * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.45 + (rand() - 0.5) * 0.2;
    const len = s * (1.4 + rand() * 0.8);
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len;
    const lg = g.createLinearGradient(x, y, tx, ty);
    lg.addColorStop(0, '#14532d');
    lg.addColorStop(1, '#4d9a1f');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x - s * 0.18, y);
    g.quadraticCurveTo(x + Math.cos(a - 0.4) * len * 0.6, y + Math.sin(a - 0.4) * len * 0.6, tx, ty);
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.6, y + Math.sin(a + 0.4) * len * 0.6, x + s * 0.18, y);
    g.closePath();
    g.fill();
  }
  if (rand() < 0.35) {
    const color = rand() < 0.5 ? '#f472b6' : '#a78bfa';
    g.fillStyle = rgba(color, 0.25);
    g.beginPath();
    g.arc(x, y - s * 1.6, s * 0.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y - s * 1.6, s * 0.35, 0, Math.PI * 2);
    g.fill();
  }
}

function rock(g: G, x: number, y: number, s: number) {
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.ellipse(x + 2, y + s * 0.5, s * 1.2, s * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  const rg = g.createLinearGradient(x - s, y - s, x + s, y + s);
  rg.addColorStop(0, '#4b5568');
  rg.addColorStop(1, '#1a1f2c');
  g.fillStyle = rg;
  g.beginPath();
  g.ellipse(x, y, s, s * 0.7, 0.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 0.8;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.ellipse(x - s * 0.3, y - s * 0.3, s * 0.35, s * 0.18, 0.2, 0, Math.PI * 2);
  g.fill();
}

export function mapArt(map: MapDef, geo: PathGeo): Art {
  return paint(FIELD_W, FIELD_H, 0, 0, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, FIELD_H);
    bg.addColorStop(0, '#0b1120');
    bg.addColorStop(1, '#05070e');
    g.fillStyle = bg;
    g.fillRect(0, 0, FIELD_W, FIELD_H);

    const rand = rng(7);
    // 地面明暗块
    for (let i = 0; i < 26; i++) {
      const x = rand() * FIELD_W;
      const y = rand() * FIELD_H;
      const rr = 50 + rand() * 90;
      const tone = rand() < 0.5 ? '45,212,191' : '139,92,246';
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, `rgba(${tone},0.045)`);
      rg.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = rg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // 细噪点
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(255,255,255,${0.015 + rand() * 0.035})`;
      g.fillRect(rand() * FIELD_W, rand() * FIELD_H, 1, 1);
    }
    // 网点
    g.fillStyle = 'rgba(148,163,184,0.06)';
    for (let x = 13; x < FIELD_W; x += 26) {
      for (let y = 13; y < FIELD_H; y += 26) g.fillRect(x, y, 1.2, 1.2);
    }

    // 路
    const w = map.width;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.8)';
    g.shadowBlur = 16;
    g.shadowOffsetY = 5;
    g.strokeStyle = '#05070c';
    g.lineWidth = w + 10;
    strokePath(g, geo.pts);
    g.restore();

    g.save();
    g.shadowColor = 'rgba(34,211,238,0.9)';
    g.shadowBlur = 18;
    g.strokeStyle = 'rgba(34,211,238,0.45)';
    g.lineWidth = w + 7;
    strokePath(g, geo.pts);
    g.restore();

    for (const [lw, color] of [
      [w + 5, '#0e7490'],
      [w + 3, '#67e8f9'],
      [w + 1, '#0b1322'],
      [w - 3, '#0e1628'],
      [w - 9, '#111b30'],
      [w - 17, '#131f37'],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = lw;
      strokePath(g, geo.pts);
    }

    // 地砖缝
    for (let i = 1; i < geo.pts.length; i++) {
      const [ax, ay] = geo.pts[i - 1];
      const [bx, by] = geo.pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      for (let d = 12; d < len - 6; d += 22) {
        const cx = ax + ux * d;
        const cy = ay + uy * d;
        const half = w / 2 - 4;
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx - uy * half, cy + ux * half);
        g.lineTo(cx + uy * half, cy - ux * half);
        g.stroke();
        g.strokeStyle = 'rgba(148,163,184,0.06)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - uy * half + ux, cy + ux * half + uy);
        g.lineTo(cx + uy * half + ux, cy - ux * half + uy);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(167,139,250,0.16)';
    g.lineWidth = 1.2;
    g.setLineDash([6, 14]);
    strokePath(g, geo.pts);
    g.setLineDash([]);

    // 入口：紫色传送门
    const sy = geo.pts[1][1];
    const portal = g.createRadialGradient(0, sy, 0, 0, sy, 46);
    portal.addColorStop(0, 'rgba(192,132,252,0.32)');
    portal.addColorStop(1, 'rgba(192,132,252,0)');
    g.fillStyle = portal;
    g.fillRect(0, sy - 46, 46, 92);

    // 草丛和石头（避开路面）
    for (let i = 0; i < 70; i++) {
      const x = 10 + rand() * (FIELD_W - 20);
      const y = 14 + rand() * (FIELD_H - 20);
      if (distToPath(geo, x, y) < w / 2 + 12) continue;
      if (rand() < 0.22) rock(g, x, y, 3 + rand() * 4);
      else tuft(g, x, y, 3 + rand() * 3, rand);
    }
  }, 2);
}
