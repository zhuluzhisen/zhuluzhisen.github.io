/* ============================================================
   《签 · OMEN》敌谱
   12 名敌人 + 1 位首（Boss，三阶段）
   每个敌人用一个卦象符号代替立绘，零贴图
   ============================================================ */
import type { EnemyDef, Intent, StatusKey } from './types';

const atk = (v: number, t = 1, note = '出手'): Intent => ({ kind: '攻', value: v, times: t, note });
const def = (v: number, note = '结印'): Intent => ({ kind: '守', value: 0, times: 0, note, block: v });
const hex = (note: string, self?: [StatusKey, number], foe?: [StatusKey, number]): Intent => ({
  kind: '术',
  value: 0,
  times: 0,
  note,
  self,
  foe,
});

export const ENEMIES: EnemyDef[] = [
  {
    id: 'youhun',
    name: '游魂',
    en: 'DRIFTER',
    glyph: '☳',
    hue: '#7f9cf5',
    hp: [20, 24],
    tier: '常',
    act: (_r, t) => (t % 3 === 2 ? def(6) : atk(8)),
  },
  {
    id: 'huique',
    name: '灰雀',
    en: 'ASH BIRD',
    glyph: '☴',
    hue: '#a3e635',
    hp: [15, 19],
    tier: '常',
    act: (_r, t) => (t % 3 === 2 ? hex('聒噪', undefined, ['弱', 1]) : atk(5, 2, '啄')),
  },
  {
    id: 'jiankou',
    name: '缄口',
    en: 'SEALED',
    glyph: '☶',
    hue: '#94a3b8',
    hp: [26, 30],
    tier: '常',
    act: (_r, t) => (t % 3 === 2 ? hex('封口', undefined, ['弱', 2]) : atk(11)),
  },
  {
    id: 'huijinpu',
    name: '灰烬仆',
    en: 'CINDER SERVANT',
    glyph: '☷',
    hue: '#fb923c',
    hp: [30, 34],
    tier: '常',
    act: (_r, t) => {
      if (t % 3 === 0) return def(8);
      if (t % 3 === 1) return atk(7);
      return atk(14, 1, '扬灰');
    },
  },
  {
    id: 'shuangying',
    name: '双影',
    en: 'TWIN SHADE',
    glyph: '☱',
    hue: '#c084fc',
    hp: [20, 22],
    tier: '常',
    act: (_r, t) => (t % 3 === 2 ? atk(6, 2, '分身') : atk(6)),
  },
  {
    id: 'shiying',
    name: '噬影',
    en: 'SHADE EATER',
    glyph: '☲',
    hue: '#f87171',
    hp: [32, 36],
    tier: '常',
    act: (_r, t) => (t % 3 === 1 ? hex('剥落', undefined, ['易', 2]) : atk(13)),
  },
  {
    id: 'chenyu',
    name: '谶语者',
    en: 'PROPHECY',
    glyph: '☵',
    hue: '#22d3ee',
    hp: [26, 30],
    tier: '常',
    act: (_r, t) => (t % 3 === 0 ? hex('低语', undefined, ['易', 2]) : atk(9)),
  },
  {
    id: 'kongjiao',
    name: '空筊',
    en: 'HOLLOW LOT',
    glyph: '☰',
    hue: '#e2e8f0',
    hp: [17, 21],
    tier: '常',
    act: (_r, t) => (t % 3 === 1 ? hex('哑卦', undefined, ['静', 1]) : atk(t % 3 === 2 ? 11 : 6)),
  },

  /* ---------------- 精英 ---------------- */
  {
    id: 'sanqianshi',
    name: '三签使',
    en: 'THREE LOTS',
    glyph: '☵',
    hue: '#f472b6',
    hp: [60, 66],
    tier: '精',
    act: (r, t) => {
      const p = t % 4;
      if (p === 0) return atk(16, 1, '重签');
      if (p === 1) return hex('消音', undefined, ['弱', 2]);
      if (p === 2) return { ...def(12), value: 8, times: 1, note: '结印并出手' };
      return r() < 0.5 ? atk(8, 2, '连签') : atk(18);
    },
  },
  {
    id: 'shijiao',
    name: '石筊',
    en: 'STONE LOT',
    glyph: '☶',
    hue: '#fbbf24',
    hp: [68, 74],
    tier: '精',
    act: (r, t) => {
      const p = t % 3;
      if (p === 0) return atk(9, 2, '双掷');
      if (p === 1) return def(15);
      return r() < 0.5 ? atk(18, 1, '砸落') : atk(6, 3, '碎石');
    },
  },
  {
    id: 'yabu',
    name: '哑卜',
    en: 'MUTE ORACLE',
    glyph: '☷',
    hue: '#a78bfa',
    hp: [56, 62],
    tier: '精',
    act: (_r, t) => {
      const p = t % 4;
      if (p === 0) return atk(10);
      if (p === 1) return hex('积势', ['锐', 3]);
      if (p === 2) return atk(14, 1, '爆发');
      return def(10);
    },
  },
  {
    id: 'nigua',
    name: '逆卦',
    en: 'REVERSED',
    glyph: '☱',
    hue: '#ef4444',
    hp: [64, 70],
    tier: '精',
    act: (_r, t) => {
      const p = t % 3;
      if (p === 0) return { ...atk(14, 1, '夺卦'), drain: 1 };
      if (p === 1) return atk(7, 3, '乱卦');
      return def(14);
    },
  },

  /* ---------------- 首 ---------------- */
  {
    id: 'wuming',
    name: '问卜者 · 无名',
    en: 'THE NAMELESS',
    glyph: '☰',
    hue: '#fb7185',
    hp: [220, 220],
    tier: '首',
    act: (r, t, self) => {
      const ratio = self.hp / self.hpMax;
      if (ratio > 0.66) {
        const p = t % 3;
        if (p === 0) return atk(18, 1, '初问');
        if (p === 1) return hex('指认', undefined, ['易', 2]);
        return def(20);
      }
      if (ratio > 0.33) {
        const p = t % 3;
        if (p === 0) return atk(12, 2, '再问');
        if (p === 1) return hex('封喉', undefined, ['弱', 2]);
        return { ...def(14), value: 10, times: 1, note: '结印并出手' };
      }
      const p = t % 2;
      if (p === 0) return { ...hex('自燃', ['锐', 4]), value: 25, times: 1, note: '终问' };
      return atk(25, 1, '终问');
    },
  },
];

export const ENEMY_MAP: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/** 每层抽到的敌人组合：[楼层上下界, 组合] */
export interface Encounter {
  min: number;
  max: number;
  foes: string[];
}

export const ENCOUNTERS: Encounter[] = [
  { min: 0, max: 1, foes: ['youhun'] },
  { min: 0, max: 2, foes: ['huique', 'huique'] },
  { min: 1, max: 4, foes: ['jiankou'] },
  { min: 1, max: 5, foes: ['huijinpu'] },
  { min: 2, max: 6, foes: ['shuangying', 'shuangying'] },
  { min: 2, max: 7, foes: ['shiying'] },
  { min: 3, max: 9, foes: ['chenyu', 'huique'] },
  { min: 3, max: 10, foes: ['kongjiao', 'youhun'] },
  { min: 5, max: 12, foes: ['shiying', 'jiankou'] },
  { min: 6, max: 13, foes: ['huijinpu', 'shuangying'] },
  { min: 7, max: 14, foes: ['chenyu', 'kongjiao', 'huique'] },
];

/** 精英池 */
export const ELITES = ['sanqianshi', 'shijiao', 'yabu', 'nigua'];

export function pickEncounter(floor: number, rng: () => number): string[] {
  const ok = ENCOUNTERS.filter((e) => floor >= e.min && floor <= e.max);
  if (!ok.length) return ['youhun'];
  return ok[Math.floor(rng() * ok.length)].foes;
}
