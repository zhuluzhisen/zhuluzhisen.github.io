/**
 * 喵星防线 · 波次
 * 前 30 波手工编排，之后进入无尽模式按公式生成
 */
import type { BloonId } from './data.ts';

export const TOTAL_WAVES = 30;

/** 一组：type × n，每隔 gap 秒一个，从 at 秒开始 */
type Group = [t: BloonId, n: number, gap: number, at?: number, camo?: boolean];

export interface Spawn {
  at: number;
  t: BloonId;
  camo: boolean;
}

const WAVES: Group[][] = [
  /* 1 */ [['red', 20, 0.9]],
  /* 2 */ [['red', 30, 0.7]],
  /* 3 */ [['red', 20, 0.7], ['blue', 8, 1, 6]],
  /* 4 */ [['red', 25, 0.55], ['blue', 15, 0.8, 4]],
  /* 5 */ [['blue', 25, 0.6], ['red', 10, 0.5, 8]],
  /* 6 */ [['blue', 20, 0.5], ['green', 8, 1, 5]],
  /* 7 */ [['blue', 30, 0.45], ['green', 12, 0.8, 6]],
  /* 8 */ [['green', 25, 0.6], ['blue', 15, 0.4, 3]],
  /* 9 */ [['green', 35, 0.45]],
  /* 10 */ [['blue', 90, 0.18]],
  /* 11 */ [['yellow', 10, 1], ['green', 25, 0.5, 2]],
  /* 12 */ [['yellow', 18, 0.7], ['blue', 30, 0.25, 4]],
  /* 13 */ [['pink', 12, 0.8], ['yellow', 15, 0.6, 3]],
  /* 14 */ [['pink', 18, 0.65], ['green', 24, 0.35, 2]],
  /* 15 */ [['black', 6, 1], ['white', 6, 1, 4], ['pink', 12, 0.6, 9]],
  /* 16 */ [['green', 20, 0.6, 0, true], ['yellow', 20, 0.4, 3]],
  /* 17 */ [['lead', 5, 1.6], ['black', 10, 0.7, 5]],
  /* 18 */ [['white', 14, 0.6], ['black', 14, 0.6, 3]],
  /* 19 */ [['zebra', 8, 1], ['pink', 25, 0.35, 3]],
  /* 20 */ [['lead', 8, 1.1], ['zebra', 10, 0.8, 4]],
  /* 21 */ [['rainbow', 5, 1.2], ['zebra', 10, 0.7, 3]],
  /* 22 */ [['rainbow', 10, 0.8], ['pink', 20, 0.4, 4, true]],
  /* 23 */ [['ceramic', 3, 2.5], ['rainbow', 7, 0.8, 3]],
  /* 24 */ [['ceramic', 5, 1.6], ['zebra', 10, 0.7, 4, true]],
  /* 25 */ [['ceramic', 7, 1.2], ['rainbow', 8, 0.7, 5]],
  /* 26 */ [['lead', 15, 0.7], ['ceramic', 8, 1.1, 4]],
  /* 27 */ [['ceramic', 11, 0.9], ['rainbow', 8, 0.8, 6, true]],
  /* 28 */ [['boss', 1, 1], ['ceramic', 6, 1.2, 6]],
  /* 29 */ [['ceramic', 14, 0.8], ['rainbow', 8, 0.7, 4, true]],
  /* 30 */ [['boss', 2, 8], ['ceramic', 12, 0.8, 3]],
];

function endless(wave: number): Group[] {
  const k = wave - TOTAL_WAVES;
  return [
    ['boss', 1 + Math.floor(k / 2), Math.max(2.5, 6 - k * 0.2)],
    ['ceramic', 20 + k * 5, Math.max(0.25, 0.6 - k * 0.02), 2],
    ['rainbow', 10 + k * 3, 0.35, 4, true],
  ];
}

export function waveSpawns(wave: number): Spawn[] {
  const groups = wave <= TOTAL_WAVES ? WAVES[wave - 1] : endless(wave);
  const out: Spawn[] = [];
  for (const [t, n, gap, at = 0, camo = false] of groups) {
    for (let i = 0; i < n; i++) out.push({ at: at + i * gap, t, camo });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 无尽模式下陶瓷与飞艇的血量倍率 */
export function waveHpMul(wave: number): number {
  return wave <= TOTAL_WAVES ? 1 : 1 + (wave - TOTAL_WAVES) * 0.15;
}

/** 波次开始时的提示 */
export function waveHint(wave: number): string | null {
  const hints: Record<number, string> = {
    11: '黄气球很快，注意火力覆盖',
    15: '黑气球炸不动，白气球冻不住',
    16: '迷彩气球来了：需要「夜视」才能看见',
    17: '铅气球：飞爪戳不动，用毛线球或狙击',
    19: '斑马气球：既炸不动也冻不住',
    23: '陶瓷气球很硬，要集中火力',
    28: '鼠王飞艇来袭！',
    30: '最终波：两艘鼠王飞艇',
  };
  return hints[wave] ?? null;
}
