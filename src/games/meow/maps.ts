/**
 * 喵星防线 · 地图
 * 一条折线路径；新增地图只需再写一组拐点
 */

export const FIELD_W = 800;
export const FIELD_H = 520;

export interface MapDef {
  id: string;
  name: string;
  /** 路径拐点，首尾应落在场地外 */
  points: [number, number][];
  /** 路面宽度 */
  width: number;
}

export interface PathGeo {
  pts: [number, number][];
  cum: number[];
  total: number;
}

export interface PathPos {
  x: number;
  y: number;
  ang: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'garden',
    name: '猫薄荷花园',
    width: 34,
    points: [
      [-30, 80],
      [200, 80],
      [200, 250],
      [80, 250],
      [80, 430],
      [340, 430],
      [340, 140],
      [520, 140],
      [520, 380],
      [680, 380],
      [680, 200],
      [830, 200],
    ],
  },
];

export function buildPath(points: [number, number][]): PathGeo {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return { pts: points, cum, total: cum[cum.length - 1] };
}

export function posAt(g: PathGeo, d: number): PathPos {
  const { pts, cum } = g;
  if (d <= 0) {
    const [ax, ay] = pts[0];
    const [bx, by] = pts[1];
    const ang = Math.atan2(by - ay, bx - ax);
    return { x: ax + Math.cos(ang) * d, y: ay + Math.sin(ang) * d, ang };
  }
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const [ax, ay] = pts[i - 1];
  const [bx, by] = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, (d - cum[i - 1]) / seg);
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ang: Math.atan2(by - ay, bx - ax) };
}

/** 点到路径中线的最短距离 */
export function distToPath(g: PathGeo, x: number, y: number): number {
  let best = Infinity;
  const { pts } = g;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}
