/**
 * 喵星防线 · 绘制
 * 背景预渲染一次；每帧画气球、猫猫、弹道和特效
 */
import { BLOONS, type BloonId, type TowerDef } from './data.ts';
import type { Bloon, GameEvent, MeowGame, Proj, Tower } from './engine.ts';
import { FIELD_H, FIELD_W, type MapDef, type PathGeo } from './maps.ts';

type G = CanvasRenderingContext2D;

const LIGHT: Record<BloonId, string> = {
  red: '#ffd3dc',
  blue: '#d4f1ff',
  green: '#ecffc4',
  yellow: '#fff3c4',
  pink: '#ffd6ee',
  black: '#64748b',
  white: '#ffffff',
  lead: '#e2e8f0',
  zebra: '#ffffff',
  rainbow: '#ffffff',
  ceramic: '#fcd9a8',
  boss: '#e9d5ff',
};

/* ---------------- 背景 ---------------- */

function strokePath(g: G, pts: [number, number][]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

/** 伪随机，保证每次装饰位置一致 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function paintBackground(map: MapDef, geo: PathGeo, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W * dpr;
  c.height = FIELD_H * dpr;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = g.createLinearGradient(0, 0, 0, FIELD_H);
  bg.addColorStop(0, '#080b15');
  bg.addColorStop(1, '#04060d');
  g.fillStyle = bg;
  g.fillRect(0, 0, FIELD_W, FIELD_H);

  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 13; x < FIELD_W; x += 26) {
    for (let y = 13; y < FIELD_H; y += 26) g.fillRect(x, y, 1.2, 1.2);
  }

  // 猫薄荷草丛：路边的霓虹小叶子
  const rand = rng(7);
  for (let i = 0; i < 40; i++) {
    const x = rand() * FIELD_W;
    const y = rand() * FIELD_H;
    const hue = rand() < 0.85 ? '163,230,53' : '167,139,250';
    const s = 3 + rand() * 4;
    g.fillStyle = `rgba(${hue},0.04)`;
    g.beginPath();
    g.arc(x, y, s * 1.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${hue},0.26)`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y + s);
    g.quadraticCurveTo(x - s, y, x - s * 0.4, y - s);
    g.moveTo(x, y + s);
    g.quadraticCurveTo(x + s, y - s * 0.2, x + s * 0.6, y - s * 0.9);
    g.stroke();
  }

  g.lineJoin = 'round';
  g.lineCap = 'round';

  g.save();
  g.shadowColor = 'rgba(34,211,238,0.8)';
  g.shadowBlur = 22;
  g.strokeStyle = 'rgba(34,211,238,0.5)';
  g.lineWidth = map.width + 4;
  strokePath(g, geo.pts);
  g.restore();

  g.strokeStyle = '#0c1322';
  g.lineWidth = map.width;
  strokePath(g, geo.pts);

  g.strokeStyle = 'rgba(167,139,250,0.12)';
  g.lineWidth = map.width - 12;
  strokePath(g, geo.pts);

  g.strokeStyle = '#0c1322';
  g.lineWidth = map.width - 14;
  strokePath(g, geo.pts);

  // 入口箭头
  const sy = geo.pts[1][1];
  g.fillStyle = 'rgba(34,211,238,0.6)';
  g.font = '600 10px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillText('IN ▸', 8, sy - map.width / 2 - 8);

  // 鱼干仓库
  const [ex, ey] = geo.pts[geo.pts.length - 2];
  const hx = Math.min(FIELD_W - 46, ex + 48);
  const hy = ey;
  g.save();
  g.translate(hx, hy);
  g.shadowColor = 'rgba(251,191,36,0.8)';
  g.shadowBlur = 16;
  g.fillStyle = '#141826';
  g.strokeStyle = '#fbbf24';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-26, -6);
  g.lineTo(0, -30);
  g.lineTo(26, -6);
  g.lineTo(26, 26);
  g.lineTo(-26, 26);
  g.closePath();
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  // 小鱼招牌
  g.fillStyle = '#fbbf24';
  g.beginPath();
  g.ellipse(-3, 6, 10, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(6, 6);
  g.lineTo(14, 0);
  g.lineTo(14, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#141826';
  g.beginPath();
  g.arc(-8, 4.5, 1.4, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.fillStyle = 'rgba(251,191,36,0.75)';
  g.font = '600 10px ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText('鱼干仓库', hx, hy + 42);

  return c;
}

/* ---------------- 气球 ---------------- */

function balloonBody(g: G, r: number) {
  g.beginPath();
  g.ellipse(0, 0, r * 0.92, r * 1.06, 0, 0, Math.PI * 2);
}

function drawBoss(g: G, b: Bloon, time: number) {
  const r = BLOONS.boss.r;
  g.save();
  g.translate(b.x, b.y);

  g.fillStyle = 'rgba(167,139,250,0.14)';
  g.beginPath();
  g.ellipse(0, 0, r * 2.2, r * 1.4, b.ang, 0, Math.PI * 2);
  g.fill();

  g.rotate(b.ang);
  // 尾巴
  g.strokeStyle = '#f9a8d4';
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-r * 1.55, 0);
  const wag = Math.sin(time * 6) * 6;
  g.bezierCurveTo(-r * 2.1, -10 + wag, -r * 2.3, 12 + wag, -r * 2.6, wag);
  g.stroke();
  // 尾翼
  g.fillStyle = '#6d28d9';
  g.beginPath();
  g.moveTo(-r * 1.2, -r * 0.5);
  g.lineTo(-r * 1.8, -r * 1.05);
  g.lineTo(-r * 1.55, -r * 0.2);
  g.closePath();
  g.moveTo(-r * 1.2, r * 0.5);
  g.lineTo(-r * 1.8, r * 1.05);
  g.lineTo(-r * 1.55, r * 0.2);
  g.closePath();
  g.fill();
  // 艇身
  const body = g.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, '#c4b5fd');
  body.addColorStop(0.5, '#8b5cf6');
  body.addColorStop(1, '#4c1d95');
  g.fillStyle = body;
  g.strokeStyle = '#ede9fe';
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(0, 0, r * 1.6, r * 0.85, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(237,233,254,0.35)';
  g.lineWidth = 1;
  for (const k of [-0.6, 0, 0.6]) {
    g.beginPath();
    g.ellipse(r * k, 0, r * 0.16, r * 0.82, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // 鼠脸
  g.fillStyle = '#f9a8d4';
  g.beginPath();
  g.arc(r * 1.05, -r * 0.72, r * 0.34, 0, Math.PI * 2);
  g.arc(r * 1.05, r * 0.72, r * 0.34, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fb7185';
  g.beginPath();
  g.arc(r * 1.62, 0, r * 0.14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ef4444';
  g.shadowColor = '#ef4444';
  g.shadowBlur = 8;
  g.beginPath();
  g.arc(r * 1.22, -r * 0.26, r * 0.1, 0, Math.PI * 2);
  g.arc(r * 1.22, r * 0.26, r * 0.1, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 0.8;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(r * 1.55, s * r * 0.1);
    g.lineTo(r * 1.95, s * r * 0.32);
    g.moveTo(r * 1.55, s * r * 0.14);
    g.lineTo(r * 1.9, s * r * 0.5);
  }
  g.stroke();
  g.restore();

  // 血条：放在艇身投影的正上方，竖着飞时也不压住
  const w = 52;
  const ratio = Math.max(0, b.hp / b.maxHp);
  const top = Math.abs(Math.sin(b.ang)) * r * 1.6 + Math.abs(Math.cos(b.ang)) * r * 1.05;
  const by = b.y - top - 11;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(b.x - w / 2, by, w, 5);
  g.fillStyle = ratio > 0.5 ? '#a78bfa' : ratio > 0.25 ? '#fbbf24' : '#fb7185';
  g.fillRect(b.x - w / 2, by, w * ratio, 5);
}

export function drawBloon(g: G, b: Bloon, time: number) {
  const def = BLOONS[b.t];
  if (def.boss) {
    drawBoss(g, b, time);
    return;
  }
  const r = def.r;
  g.save();
  g.translate(b.x, b.y + Math.sin(time * 3 + b.id) * 1.2);
  if (b.camo) g.globalAlpha = 0.72;

  // 光晕
  g.fillStyle = b.t === 'black' ? 'rgba(148,163,184,0.12)' : `${def.color}26`;
  g.beginPath();
  g.arc(0, 0, r * 1.65, 0, Math.PI * 2);
  g.fill();

  // 气球嘴
  g.fillStyle = b.t === 'zebra' || b.t === 'rainbow' ? '#e2e8f0' : def.color;
  g.beginPath();
  g.moveTo(0, r * 0.98);
  g.lineTo(-r * 0.22, r * 1.28);
  g.lineTo(r * 0.22, r * 1.28);
  g.closePath();
  g.fill();

  // 球身
  if (b.t === 'rainbow') {
    const lg = g.createLinearGradient(-r, -r, r, r);
    ['#fb7185', '#fbbf24', '#a3e635', '#22d3ee', '#a78bfa'].forEach((c, i) => lg.addColorStop(i / 4, c));
    g.fillStyle = lg;
  } else if (b.t === 'zebra') {
    g.fillStyle = '#f8fafc';
  } else {
    const rg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    rg.addColorStop(0, LIGHT[b.t]);
    rg.addColorStop(1, def.color);
    g.fillStyle = rg;
  }
  balloonBody(g, r);
  g.fill();

  if (b.t === 'zebra') {
    g.save();
    balloonBody(g, r);
    g.clip();
    g.fillStyle = '#111827';
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(-r * 1.2, k * r * 0.5 - r * 0.25);
      g.lineTo(r * 1.2, k * r * 0.5 + r * 0.1);
      g.lineTo(r * 1.2, k * r * 0.5 + r * 0.32);
      g.lineTo(-r * 1.2, k * r * 0.5 - r * 0.03);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  if (b.t === 'ceramic') {
    const cracks = Math.floor((1 - b.hp / b.maxHp) * 4.5);
    g.strokeStyle = 'rgba(69,26,3,0.85)';
    g.lineWidth = 1.3;
    const lines = [
      [-0.5, -0.6, -0.1, -0.1, -0.3, 0.3],
      [0.5, -0.5, 0.1, -0.05, 0.4, 0.4],
      [-0.6, 0.2, -0.2, 0.25, 0, 0.7],
      [0.2, -0.8, 0.05, -0.3, 0.3, 0],
    ];
    for (let i = 0; i < Math.min(cracks, lines.length); i++) {
      const [a, b2, c, d, e, f] = lines[i];
      g.beginPath();
      g.moveTo(a * r, b2 * r);
      g.lineTo(c * r, d * r);
      g.lineTo(e * r, f * r);
      g.stroke();
    }
  }

  // 描边
  g.lineWidth = b.t === 'lead' ? 2.2 : 1.2;
  g.strokeStyle =
    b.t === 'lead'
      ? '#475569'
      : b.t === 'black'
        ? '#64748b'
        : b.t === 'white' || b.t === 'zebra'
          ? '#cbd5e1'
          : 'rgba(255,255,255,0.45)';
  balloonBody(g, r);
  g.stroke();

  // 高光
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(-r * 0.36, -r * 0.42, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
  g.fill();

  if (b.camo) {
    g.fillStyle = 'rgba(77,124,15,0.6)';
    for (const [px, py, pr] of [
      [-0.3, 0.2, 0.28],
      [0.35, -0.2, 0.24],
      [0.1, 0.55, 0.2],
    ]) {
      g.beginPath();
      g.arc(px * r, py * r, pr * r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(163,230,53,0.75)';
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r * 1.35, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  if (b.frozen > 0) {
    g.globalAlpha = 0.8;
    g.fillStyle = 'rgba(186,230,253,0.35)';
    g.strokeStyle = '#e0f2fe';
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(0, 0, r * 1.12, r * 1.24, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else if (b.slow > 0) {
    g.strokeStyle = 'rgba(125,211,252,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r * 1.25, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/* ---------------- 猫猫 ---------------- */

function catHead(g: G, def: TowerDef, size: number, look: number) {
  const c = def.color;
  // 耳朵
  g.fillStyle = '#121828';
  g.strokeStyle = c;
  g.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * size * 0.82, -size * 0.25);
    g.lineTo(s * size * 0.78, -size * 1.12);
    g.lineTo(s * size * 0.18, -size * 0.72);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = `${c}55`;
    g.beginPath();
    g.moveTo(s * size * 0.68, -size * 0.42);
    g.lineTo(s * size * 0.68, -size * 0.92);
    g.lineTo(s * size * 0.32, -size * 0.68);
    g.closePath();
    g.fill();
    g.fillStyle = '#121828';
  }
  // 脸
  g.beginPath();
  g.arc(0, 0, size, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 眼睛（朝向目标）
  const lx = Math.cos(look) * size * 0.08;
  const ly = Math.sin(look) * size * 0.08;
  g.fillStyle = c;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * size * 0.38 + lx, -size * 0.08 + ly, size * 0.17, size * 0.24, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#04070e';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(s * size * 0.38 + lx * 1.6, -size * 0.08 + ly * 1.6, size * 0.06, size * 0.17, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 鼻子和胡须
  g.fillStyle = '#fb7185';
  g.beginPath();
  g.moveTo(-size * 0.1, size * 0.22);
  g.lineTo(size * 0.1, size * 0.22);
  g.lineTo(0, size * 0.34);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 0.8;
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(s * size * 0.3, size * 0.32);
    g.lineTo(s * size * 1.05, size * 0.22);
    g.moveTo(s * size * 0.3, size * 0.4);
    g.lineTo(s * size * 1.0, size * 0.48);
  }
  g.stroke();
}

export function drawTowerShape(g: G, def: TowerDef, x: number, y: number, ang: number, kick: number, tiers?: [number, number]) {
  const r = def.r;
  const c = def.color;
  g.save();
  g.translate(x, y);

  // 底座
  g.fillStyle = `${c}1f`;
  g.beginPath();
  g.arc(0, 0, r + 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0a0f1c';
  g.strokeStyle = `${c}88`;
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r + 1, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  // 喵帝披风
  if (def.id === 'super') {
    g.fillStyle = 'rgba(239,68,68,0.75)';
    g.beginPath();
    g.moveTo(-r * 0.7, 0);
    g.quadraticCurveTo(-r * 1.1, r * 0.9, -r * 0.4, r * 1.15);
    g.lineTo(r * 0.4, r * 1.15);
    g.quadraticCurveTo(r * 1.1, r * 0.9, r * 0.7, 0);
    g.closePath();
    g.fill();
  }

  // 武器（随目标转动）
  if (def.id !== 'ice') {
    g.save();
    g.rotate(ang);
    g.translate(-kick, 0);
    if (def.id === 'claw') {
      g.fillStyle = c;
      g.fillRect(r * 0.4, -2.5, r * 0.75, 5);
      g.strokeStyle = c;
      g.lineWidth = 1.6;
      g.beginPath();
      for (const s of [-1, 0, 1]) {
        g.moveTo(r * 1.1, s * 2.4);
        g.lineTo(r * 1.42, s * 3.6);
      }
      g.stroke();
    } else if (def.id === 'yarn') {
      g.fillStyle = '#7c2d12';
      g.fillRect(r * 0.3, -4.5, r * 0.85, 9);
      g.fillStyle = c;
      g.beginPath();
      g.arc(r * 1.15, 0, 5, 0, Math.PI * 2);
      g.fill();
    } else if (def.id === 'snipe') {
      g.fillStyle = '#1f2937';
      g.fillRect(r * 0.3, -2, r * 1.5, 4);
      g.fillStyle = c;
      g.fillRect(r * 0.55, -3.4, r * 0.4, 2);
      g.fillRect(r * 1.65, -2.6, 3, 5.2);
    } else {
      g.fillStyle = '#fde68a';
      g.fillRect(r * 0.4, -3, r * 0.9, 6);
    }
    g.restore();
  }

  const head = r * 0.8;
  catHead(g, def, head, ang);

  if (def.id === 'ice') {
    g.strokeStyle = '#e0f2fe';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.moveTo(Math.cos(a) * 3.5, -head * 0.62 + Math.sin(a) * 3.5);
      g.lineTo(-Math.cos(a) * 3.5, -head * 0.62 - Math.sin(a) * 3.5);
    }
    g.stroke();
  } else if (def.id === 'snipe') {
    g.strokeStyle = '#a3e635';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-head * 0.95, -head * 0.1);
    g.lineTo(head * 0.95, -head * 0.1);
    g.stroke();
  } else if (def.id === 'super') {
    g.fillStyle = '#fbbf24';
    g.beginPath();
    g.moveTo(-head * 0.5, -head * 0.7);
    g.lineTo(-head * 0.5, -head * 1.2);
    g.lineTo(-head * 0.2, -head * 0.92);
    g.lineTo(0, -head * 1.3);
    g.lineTo(head * 0.2, -head * 0.92);
    g.lineTo(head * 0.5, -head * 1.2);
    g.lineTo(head * 0.5, -head * 0.7);
    g.closePath();
    g.fill();
  } else if (def.id === 'yarn') {
    g.strokeStyle = '#fdba74';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(head * 0.75, head * 0.75, 4, 0, Math.PI * 2);
    g.moveTo(head * 0.75 - 4, head * 0.75);
    g.quadraticCurveTo(head * 0.75, head * 0.75 - 3, head * 0.75 + 4, head * 0.75);
    g.stroke();
  }

  // 升级刻度：左边路线一，右边路线二
  if (tiers) {
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < tiers[p]; i++) {
        g.fillStyle = p === 0 ? c : '#f8fafc';
        const px = (p === 0 ? -1 : 1) * (4 + i * 5);
        g.beginPath();
        g.arc(px, r + 7, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
}

function drawTower(g: G, t: Tower, time: number) {
  const since = time - t.shotAt;
  const kick = since >= 0 && since < 0.1 ? (1 - since / 0.1) * 3 : 0;
  drawTowerShape(g, t.def, t.x, t.y, t.ang, kick, t.tiers);
}

function drawProj(g: G, p: Proj, time: number) {
  if (p.kind === 'yarn') {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(time * 12);
    g.fillStyle = 'rgba(251,146,60,0.25)';
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fb923c';
    g.beginPath();
    g.arc(0, 0, 5.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7c2d12';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-5, -1);
    g.quadraticCurveTo(0, -5, 5, -1);
    g.moveTo(-5, 2);
    g.quadraticCurveTo(0, -2, 5, 2);
    g.stroke();
    g.restore();
    return;
  }
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const ux = p.vx / sp;
  const uy = p.vy / sp;
  const len = p.kind === 'super' ? 13 : 9;
  const color = p.kind === 'super' ? (p.type === 'energy' ? '#fca5a5' : '#fde68a') : '#a5f3fc';
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.globalAlpha = 0.28;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(p.x - ux * len, p.y - uy * len);
  g.lineTo(p.x, p.y);
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(p.x - ux * len, p.y - uy * len);
  g.lineTo(p.x, p.y);
  g.stroke();
}

/* ---------------- 特效 ---------------- */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  fill?: string;
}
interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  max: number;
}

const MAX_PARTICLES = 520;

export class Fx {
  parts: Particle[] = [];
  rings: Ring[] = [];
  lines: Line[] = [];
  flash = 0;

  consume(events: GameEvent[]) {
    for (const e of events) {
      if (e.k === 'pop') {
        const def = BLOONS[e.t];
        const color = e.t === 'black' ? '#94a3b8' : e.t === 'zebra' || e.t === 'rainbow' ? '#f8fafc' : def.color;
        const n = def.boss ? 26 : def.heavy ? 10 : 5;
        this.burst(e.x, e.y, color, n, def.boss ? 220 : 120);
        this.rings.push({ x: e.x, y: e.y, r0: 3, r1: def.r * 1.5, life: 0.2, max: 0.2, color });
      } else if (e.k === 'block') {
        if (this.rings.length < 120) this.rings.push({ x: e.x, y: e.y, r0: 4, r1: 12, life: 0.16, max: 0.16, color: '#64748b' });
      } else if (e.k === 'boom') {
        this.rings.push({ x: e.x, y: e.y, r0: 6, r1: e.r, life: 0.3, max: 0.3, color: '#fb923c', fill: 'rgba(251,146,60,0.14)' });
        this.burst(e.x, e.y, '#fdba74', 8, 160);
      } else if (e.k === 'tracer') {
        this.lines.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.12, max: 0.12 });
      } else if (e.k === 'pulse') {
        this.rings.push({
          x: e.x,
          y: e.y,
          r0: 10,
          r1: e.r,
          life: 0.4,
          max: 0.4,
          color: '#bae6fd',
          fill: 'rgba(125,211,252,0.1)',
        });
      } else if (e.k === 'leak') {
        this.flash = 0.45;
      }
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n && this.parts.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.65);
      const life = 0.3 + Math.random() * 0.3;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color, size: 1.6 + Math.random() * 1.8 });
    }
  }

  update(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const list of [this.rings, this.lines] as { life: number }[][]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
  }

  draw(g: G) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      g.globalAlpha = Math.max(0, r.life / r.max);
      if (r.fill) {
        g.fillStyle = r.fill;
        g.beginPath();
        g.arc(r.x, r.y, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = r.color;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(r.x, r.y, rad, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineCap = 'round';
    for (const l of this.lines) {
      g.globalAlpha = l.life / l.max;
      g.strokeStyle = '#d9f99d';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(l.x1, l.y1);
      g.lineTo(l.x2, l.y2);
      g.stroke();
    }
    for (const p of this.parts) {
      g.globalAlpha = Math.min(1, (p.life / p.max) * 1.4);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }
}

/* ---------------- 整帧 ---------------- */

export interface View {
  time: number;
  hover: { x: number; y: number } | null;
  placing: TowerDef | null;
  placeOk: boolean;
  selected: Tower | null;
  banner: { title: string; sub: string; life: number; max: number } | null;
  speed: number;
}

function rangeCircle(g: G, x: number, y: number, r: number, ok: boolean) {
  g.fillStyle = ok ? 'rgba(34,211,238,0.07)' : 'rgba(251,113,133,0.1)';
  g.strokeStyle = ok ? 'rgba(34,211,238,0.55)' : 'rgba(251,113,133,0.7)';
  g.lineWidth = 1.2;
  g.setLineDash([5, 5]);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.setLineDash([]);
}

export function drawScene(g: G, game: MeowGame, bg: HTMLCanvasElement, fx: Fx, v: View) {
  g.drawImage(bg, 0, 0, FIELD_W, FIELD_H);

  // 路面流光
  g.save();
  g.strokeStyle = 'rgba(34,211,238,0.22)';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.setLineDash([2, 22]);
  g.lineDashOffset = -v.time * 26;
  strokePath(g, game.geo.pts);
  g.restore();

  if (v.selected) {
    const s = v.selected.stats;
    if (s.range < 2000) rangeCircle(g, v.selected.x, v.selected.y, s.range, true);
  }

  for (const b of game.bloons) if (!BLOONS[b.t].boss) drawBloon(g, b, v.time);
  for (const b of game.bloons) if (BLOONS[b.t].boss) drawBloon(g, b, v.time);

  for (const t of game.towers) drawTower(g, t, game.time);

  if (v.selected) {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(v.selected.x, v.selected.y, v.selected.def.r + 7, 0, Math.PI * 2);
    g.stroke();
  }

  for (const p of game.projs) drawProj(g, p, v.time);
  fx.draw(g);

  if (v.placing && v.hover) {
    const range = v.placing.base.range;
    if (range < 2000) rangeCircle(g, v.hover.x, v.hover.y, range, v.placeOk);
    g.globalAlpha = v.placeOk ? 0.92 : 0.5;
    drawTowerShape(g, v.placing, v.hover.x, v.hover.y, -Math.PI / 2, 0);
    g.globalAlpha = 1;
    if (!v.placeOk) {
      g.strokeStyle = '#fb7185';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(v.hover.x, v.hover.y, v.placing.r + 4, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // 漏怪红闪
  if (fx.flash > 0) {
    const a = fx.flash / 0.45;
    const vg = g.createRadialGradient(FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.35, FIELD_W / 2, FIELD_H / 2, FIELD_W * 0.62);
    vg.addColorStop(0, 'rgba(239,68,68,0)');
    vg.addColorStop(1, `rgba(239,68,68,${0.32 * a})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, FIELD_W, FIELD_H);
  }

  // 角标
  g.font = '600 11px ui-monospace, monospace';
  g.textAlign = 'left';
  g.fillStyle = 'rgba(255,255,255,0.35)';
  if (game.state === 'build' && game.wave > 0) g.fillText('建造阶段 · 空格开始下一波', 12, FIELD_H - 12);
  g.textAlign = 'right';
  if (v.speed > 1) {
    g.fillStyle = 'rgba(34,211,238,0.8)';
    g.fillText(`▶▶ ${v.speed}×`, FIELD_W - 12, FIELD_H - 12);
  }

  if (v.banner) {
    const b = v.banner;
    const k = b.life / b.max;
    g.globalAlpha = Math.min(1, k * 3, (1 - k) * 8);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(4,6,13,0.6)';
    g.fillRect(0, 22, FIELD_W, b.sub ? 62 : 44);
    g.fillStyle = '#ffffff';
    g.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    g.fillText(b.title, FIELD_W / 2, 52);
    if (b.sub) {
      g.fillStyle = '#fbbf24';
      g.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      g.fillText(b.sub, FIELD_W / 2, 74);
    }
    g.globalAlpha = 1;
  }
}
