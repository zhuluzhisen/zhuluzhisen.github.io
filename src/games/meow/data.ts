/**
 * 喵星防线 · 数据表
 * 气球（层层套娃）与猫猫塔（两条升级路线）
 */

/** 伤害类型：sharp 戳不动铅 / blast 炸不动黑与斑马 / cold 冻不住白与斑马 / energy 无视免疫 */
export type DmgType = 'sharp' | 'blast' | 'cold' | 'energy';

export type BloonId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'pink'
  | 'black'
  | 'white'
  | 'lead'
  | 'zebra'
  | 'rainbow'
  | 'ceramic'
  | 'boss';

export interface BloonDef {
  id: BloonId;
  name: string;
  color: string;
  /** 速度倍率，1 = 红气球 */
  speed: number;
  hp: number;
  children: BloonId[];
  immune: DmgType[];
  /** 不会被冻住 */
  noFreeze?: boolean;
  r: number;
  boss?: boolean;
  /** 吃「对陶瓷/飞艇额外伤害」加成 */
  heavy?: boolean;
  /** 「最强」目标排序 */
  rank: number;
}

export const BLOONS: Record<BloonId, BloonDef> = {
  red: { id: 'red', name: '红气球', color: '#fb7185', speed: 1, hp: 1, children: [], immune: [], r: 10, rank: 1 },
  blue: { id: 'blue', name: '蓝气球', color: '#38bdf8', speed: 1.4, hp: 1, children: ['red'], immune: [], r: 10.5, rank: 2 },
  green: { id: 'green', name: '绿气球', color: '#a3e635', speed: 1.8, hp: 1, children: ['blue'], immune: [], r: 11, rank: 3 },
  yellow: { id: 'yellow', name: '黄气球', color: '#fbbf24', speed: 2.8, hp: 1, children: ['green'], immune: [], r: 11.5, rank: 4 },
  pink: { id: 'pink', name: '粉气球', color: '#f472b6', speed: 3.1, hp: 1, children: ['yellow'], immune: [], r: 12, rank: 5 },
  black: {
    id: 'black',
    name: '黑气球',
    color: '#1e2230',
    speed: 1.8,
    hp: 1,
    children: ['pink', 'pink'],
    immune: ['blast'],
    r: 8,
    rank: 6,
  },
  white: {
    id: 'white',
    name: '白气球',
    color: '#f1f5f9',
    speed: 2,
    hp: 1,
    children: ['pink', 'pink'],
    immune: ['cold'],
    noFreeze: true,
    r: 8,
    rank: 6,
  },
  lead: {
    id: 'lead',
    name: '铅气球',
    color: '#94a3b8',
    speed: 1,
    hp: 1,
    children: ['black', 'black'],
    immune: ['sharp', 'cold'],
    r: 12,
    rank: 7,
  },
  zebra: {
    id: 'zebra',
    name: '斑马气球',
    color: '#e2e8f0',
    speed: 1.8,
    hp: 1,
    children: ['black', 'white'],
    immune: ['blast', 'cold'],
    noFreeze: true,
    r: 12,
    rank: 8,
  },
  rainbow: {
    id: 'rainbow',
    name: '彩虹气球',
    color: '#c084fc',
    speed: 2.2,
    hp: 1,
    children: ['zebra', 'zebra'],
    immune: [],
    r: 13,
    rank: 9,
  },
  ceramic: {
    id: 'ceramic',
    name: '陶瓷气球',
    color: '#d97706',
    speed: 2,
    hp: 10,
    children: ['rainbow', 'rainbow'],
    immune: [],
    r: 13.5,
    heavy: true,
    rank: 10,
  },
  boss: {
    id: 'boss',
    name: '鼠王飞艇',
    color: '#a78bfa',
    speed: 0.9,
    hp: 220,
    children: ['ceramic', 'ceramic', 'ceramic', 'ceramic'],
    immune: [],
    noFreeze: true,
    r: 21,
    boss: true,
    heavy: true,
    rank: 20,
  },
};

const rbeCache = new Map<BloonId, number>();
/** 红气球当量：漏掉一个会扣多少鱼干 */
export function rbe(id: BloonId): number {
  const hit = rbeCache.get(id);
  if (hit !== undefined) return hit;
  const d = BLOONS[id];
  const v = d.hp + d.children.reduce((s, c) => s + rbe(c), 0);
  rbeCache.set(id, v);
  return v;
}

/* ---------------- 猫猫塔 ---------------- */

export type TowerKind = 'claw' | 'yarn' | 'snipe' | 'ice' | 'super';
export type TargetMode = 'first' | 'last' | 'strong' | 'close';

export const TARGET_LABEL: Record<TargetMode, string> = {
  first: '最前',
  last: '最后',
  strong: '最强',
  close: '最近',
};

export interface TowerStats {
  range: number;
  /** 攻击间隔（秒） */
  rate: number;
  dmg: number;
  pierce: number;
  /** 弹速 px/s，0 = 瞬间命中 */
  speed: number;
  type: DmgType;
  camo: boolean;
  count: number;
  spread: number;
  splash: number;
  splashPierce: number;
  /** 对陶瓷 / 飞艇的额外伤害 */
  bossDmg: number;
  freeze: number;
  /** 解冻后的速度倍率 */
  slow: number;
  slowTime: number;
  /** 对飞艇的减速比例（0 = 无效） */
  bossSlow: number;
}

export interface Upgrade {
  name: string;
  desc: string;
  cost: number;
  apply: (s: TowerStats) => void;
}

export interface TowerDef {
  id: TowerKind;
  name: string;
  color: string;
  cost: number;
  desc: string;
  r: number;
  target: TargetMode;
  base: TowerStats;
  pathNames: [string, string];
  paths: [Upgrade[], Upgrade[]];
}

const BASE: TowerStats = {
  range: 100,
  rate: 1,
  dmg: 1,
  pierce: 1,
  speed: 500,
  type: 'sharp',
  camo: false,
  count: 1,
  spread: 0,
  splash: 0,
  splashPierce: 0,
  bossDmg: 0,
  freeze: 0,
  slow: 1,
  slowTime: 0,
  bossSlow: 0,
};

export const TOWERS: Record<TowerKind, TowerDef> = {
  claw: {
    id: 'claw',
    name: '飞爪猫',
    color: '#22d3ee',
    cost: 200,
    desc: '甩出飞爪，便宜好用。戳不动铅气球。',
    r: 15,
    target: 'first',
    base: { ...BASE, range: 105, rate: 0.8, pierce: 2, speed: 560 },
    pathNames: ['利爪', '猫眼'],
    paths: [
      [
        { name: '锋利指甲', desc: '穿透 +1', cost: 140, apply: (s) => (s.pierce += 1) },
        {
          name: '钢化爪',
          desc: '穿透 +2，爪子飞得更快',
          cost: 280,
          apply: (s) => {
            s.pierce += 2;
            s.speed += 120;
          },
        },
        {
          name: '三连飞爪',
          desc: '一次甩出三只爪',
          cost: 700,
          apply: (s) => {
            s.count = 3;
            s.spread = 0.26;
          },
        },
      ],
      [
        { name: '猫眼', desc: '射程 +30', cost: 100, apply: (s) => (s.range += 30) },
        { name: '夜视瞳', desc: '能看见迷彩气球', cost: 200, apply: (s) => (s.camo = true) },
        { name: '狂热猫', desc: '攻速翻倍', cost: 600, apply: (s) => (s.rate *= 0.5) },
      ],
    ],
  },
  yarn: {
    id: 'yarn',
    name: '毛线球射手',
    color: '#fb923c',
    cost: 450,
    desc: '毛线球落地炸开，范围伤害，能炸铅气球；炸不动黑气球和斑马气球。',
    r: 16,
    target: 'first',
    base: { ...BASE, range: 120, rate: 1.2, speed: 380, type: 'blast', splash: 40, splashPierce: 16 },
    pathNames: ['大线团', '连发'],
    paths: [
      [
        {
          name: '大团毛线',
          desc: '爆炸范围更大，波及更多',
          cost: 250,
          apply: (s) => {
            s.splash += 14;
            s.splashPierce += 10;
          },
        },
        { name: '重磅毛线', desc: '爆炸伤害 +1', cost: 450, apply: (s) => (s.dmg += 1) },
        {
          name: '克星线团',
          desc: '伤害 +1，对陶瓷/飞艇额外 +10',
          cost: 1300,
          apply: (s) => {
            s.dmg += 1;
            s.bossDmg += 10;
          },
        },
      ],
      [
        { name: '长线', desc: '射程 +30', cost: 180, apply: (s) => (s.range += 30) },
        { name: '快手', desc: '攻速 +40%', cost: 320, apply: (s) => (s.rate *= 0.7) },
        {
          name: '连环爆',
          desc: '攻速再提升，爆炸范围 +8',
          cost: 950,
          apply: (s) => {
            s.rate *= 0.55;
            s.splash += 8;
          },
        },
      ],
    ],
  },
  snipe: {
    id: 'snipe',
    name: '狙击猫',
    color: '#a3e635',
    cost: 350,
    desc: '全图射程，瞬间命中，能打铅气球。默认优先打最强的。',
    r: 15,
    target: 'strong',
    base: { ...BASE, range: 9999, rate: 1.7, dmg: 2, speed: 0, type: 'energy' },
    pathNames: ['穿甲', '战术'],
    paths: [
      [
        { name: '穿甲弹', desc: '伤害 +2', cost: 300, apply: (s) => (s.dmg += 2) },
        { name: '重狙', desc: '伤害 +3', cost: 750, apply: (s) => (s.dmg += 3) },
        {
          name: '碎甲弹',
          desc: '伤害 +7，对陶瓷/飞艇额外 +12',
          cost: 1900,
          apply: (s) => {
            s.dmg += 7;
            s.bossDmg += 12;
          },
        },
      ],
      [
        { name: '夜视镜', desc: '能看见迷彩气球', cost: 250, apply: (s) => (s.camo = true) },
        { name: '速射', desc: '攻速 +65%', cost: 450, apply: (s) => (s.rate *= 0.6) },
        { name: '半自动', desc: '攻速再提升 150%', cost: 1500, apply: (s) => (s.rate *= 0.4) },
      ],
    ],
  },
  ice: {
    id: 'ice',
    name: '冰霜猫',
    color: '#7dd3fc',
    cost: 300,
    desc: '周期性冻住身边的气球。冻不住白气球、斑马气球和飞艇。',
    r: 15,
    target: 'close',
    base: { ...BASE, range: 72, rate: 2.2, dmg: 0, pierce: 28, speed: 0, type: 'cold', camo: true, freeze: 1 },
    pathNames: ['寒气', '冰原'],
    paths: [
      [
        {
          name: '冻伤',
          desc: '解冻后再减速 40%，持续 1.5 秒',
          cost: 200,
          apply: (s) => {
            s.slow = 0.6;
            s.slowTime = 1.5;
          },
        },
        { name: '碎冰', desc: '冻结时造成 1 点伤害', cost: 380, apply: (s) => (s.dmg += 1) },
        {
          name: '极寒',
          desc: '冻结 1.8 秒，伤害 +1，冻住更多',
          cost: 1400,
          apply: (s) => {
            s.freeze = 1.8;
            s.dmg += 1;
            s.pierce = 60;
          },
        },
      ],
      [
        { name: '寒流', desc: '范围 +22', cost: 160, apply: (s) => (s.range += 22) },
        { name: '急冻', desc: '脉冲更频繁', cost: 320, apply: (s) => (s.rate *= 0.65) },
        {
          name: '冰河时代',
          desc: '连飞艇也能减速 50%，范围 +18',
          cost: 900,
          apply: (s) => {
            s.bossSlow = 0.5;
            s.range += 18;
          },
        },
      ],
    ],
  },
  super: {
    id: 'super',
    name: '强力喵帝',
    color: '#fbbf24',
    cost: 2000,
    desc: '弹幕如雨的终极猫猫。很贵，但值得。',
    r: 18,
    target: 'first',
    base: { ...BASE, range: 150, rate: 0.075, speed: 760 },
    pathNames: ['激光眼', '神眼'],
    paths: [
      [
        {
          name: '激光眼',
          desc: '改发激光：能打铅气球，穿透 +1',
          cost: 1600,
          apply: (s) => {
            s.type = 'energy';
            s.pierce += 1;
          },
        },
        {
          name: '等离子',
          desc: '伤害 +1，穿透 +2，射速 +40%',
          cost: 3600,
          apply: (s) => {
            s.dmg += 1;
            s.pierce += 2;
            s.rate *= 0.7;
          },
        },
        {
          name: '太阳神喵',
          desc: '伤害 5、穿透 8，对陶瓷/飞艇额外 +6',
          cost: 14000,
          apply: (s) => {
            s.dmg = 5;
            s.pierce = 8;
            s.bossDmg += 6;
          },
        },
      ],
      [
        { name: '远视', desc: '射程 +40', cost: 500, apply: (s) => (s.range += 40) },
        { name: '全视之眼', desc: '能看见迷彩气球', cost: 900, apply: (s) => (s.camo = true) },
        {
          name: '双子喵',
          desc: '两道弹幕并行',
          cost: 5200,
          apply: (s) => {
            s.count = 2;
            s.spread = 0.12;
          },
        },
      ],
    ],
  },
};

export const TOWER_ORDER: TowerKind[] = ['claw', 'yarn', 'snipe', 'ice', 'super'];

/** 按已购等级重新算一遍属性 */
export function computeStats(def: TowerDef, tiers: [number, number]): TowerStats {
  const s: TowerStats = { ...def.base };
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < tiers[p]; i++) def.paths[p][i].apply(s);
  }
  return s;
}
