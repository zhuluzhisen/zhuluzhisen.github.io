/* ============================================================
   《签 · OMEN》签谱
   53 张签。改数值只动 vals / upVals，不用碰 omen.astro
   ============================================================ */
import type { CardDef } from './types';

/** 起手三签 */
export const STARTER: { id: string; n: number }[] = [
  { id: 'kou', n: 5 },
  { id: 'hui', n: 4 },
  { id: 'qigua', n: 1 },
];

export const CARDS: CardDef[] = [
  /* ---------------- 起手 ---------------- */
  {
    id: 'kou',
    name: '叩问',
    en: 'KNOCK',
    type: '攻',
    cost: 1,
    rarity: '起',
    text: '造成 {0} 点伤害。',
    vals: [6],
    upVals: [9],
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'hui',
    name: '回避',
    en: 'AVERT',
    type: '守',
    cost: 1,
    rarity: '起',
    text: '获得 {0} 点格挡。',
    vals: [5],
    upVals: [8],
    play: (c) => c.block(c.v[0]),
  },
  {
    id: 'qigua',
    name: '起卦',
    en: 'CAST',
    type: '术',
    cost: 1,
    upCost: 0,
    rarity: '起',
    text: '抽 {0} 张签。',
    vals: [2],
    play: (c) => c.draw(c.v[0]),
  },

  /* ---------------- 攻 ---------------- */
  {
    id: 'duanjin',
    name: '断金',
    en: 'SEVER',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害。耗。',
    vals: [9],
    upVals: [14],
    exhaust: true,
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'lianshan',
    name: '连山',
    en: 'CHAIN',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害；本回合每打出过一张攻，额外 {1} 点。',
    vals: [5, 3],
    upVals: [5, 4],
    play: (c) => c.hit(c.target, c.v[0] + c.v[1] * c.played.攻),
  },
  {
    id: 'guimei',
    name: '归妹',
    en: 'RETURN',
    type: '攻',
    cost: 2,
    rarity: '常',
    text: '造成 {0} 点伤害。',
    vals: [14],
    upVals: [18],
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'shike',
    name: '噬嗑',
    en: 'BITE',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害，两次。',
    vals: [4],
    upVals: [5],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.hit(c.target, c.v[0]);
    },
  },
  {
    id: 'bo',
    name: '剥',
    en: 'FLAKE',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害，施加 {1} 层易。',
    vals: [7, 1],
    upVals: [9, 2],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.statusTo(c.target, '易', c.v[1]);
    },
  },
  {
    id: 'wuwang',
    name: '无妄',
    en: 'BLAMELESS',
    type: '攻',
    cost: 0,
    rarity: '常',
    text: '造成 {0} 点伤害。',
    vals: [3],
    upVals: [4],
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'daguo',
    name: '大过',
    en: 'EXCESS',
    type: '攻',
    cost: 2,
    rarity: '罕',
    text: '造成 {0} 点伤害；若目标带易，改为 {1} 点。',
    vals: [8, 16],
    upVals: [10, 20],
    play: (c) =>
      c.hit(c.target, c.foeStatus(c.target, '易') > 0 ? c.v[1] : c.v[0]),
  },
  {
    id: 'guai',
    name: '夬',
    en: 'BREAK',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害，抽 1 张签。',
    vals: [6],
    upVals: [8],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.draw(1);
    },
  },
  {
    id: 'mingyi',
    name: '明夷',
    en: 'DARKENED',
    type: '攻',
    cost: 2,
    rarity: '罕',
    text: '对所有敌人造成 {0} 点伤害。',
    vals: [8],
    upVals: [11],
    play: (c) => c.hitAll(c.v[0]),
  },
  {
    id: 'jing',
    name: '井',
    en: 'WELL',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害，获得 {1} 点格挡。',
    vals: [5, 5],
    upVals: [7, 7],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.block(c.v[1]);
    },
  },
  {
    id: 'xie',
    name: '解',
    en: 'UNRAVEL',
    type: '攻',
    cost: 1,
    rarity: '常',
    text: '造成 {0} 点伤害。耗。',
    vals: [10],
    upVals: [14],
    exhaust: true,
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'shi',
    name: '师',
    en: 'ARMY',
    type: '攻',
    cost: 3,
    rarity: '罕',
    text: '造成 {0} 点伤害。',
    vals: [20],
    upVals: [26],
    play: (c) => c.hit(c.target, c.v[0]),
  },
  {
    id: 'jiji',
    name: '既济',
    en: 'SETTLED',
    type: '攻',
    cost: 1,
    rarity: '罕',
    text: '造成 {0} 点伤害；本回合打出过守则改为 {1} 点。',
    vals: [6, 12],
    upVals: [8, 14],
    play: (c) => c.hit(c.target, c.played.守 > 0 ? c.v[1] : c.v[0]),
  },
  {
    id: 'xiaoguo',
    name: '小过',
    en: 'SMALL EXCESS',
    type: '攻',
    cost: 0,
    rarity: '常',
    text: '造成 {0} 点伤害三次，每次递增 {0} 点。',
    vals: [1],
    upVals: [2],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.hit(c.target, c.v[0] * 2);
      c.hit(c.target, c.v[0] * 3);
    },
  },
  {
    id: 'kunn',
    name: '困',
    en: 'CONFINED',
    type: '攻',
    cost: 2,
    rarity: '罕',
    text: '造成 {0} 点伤害，失去 {1} 点生命。',
    vals: [12, 4],
    upVals: [16, 4],
    play: (c) => {
      c.hit(c.target, c.v[0]);
      c.hurt(c.v[1]);
    },
  },
  {
    id: 'tongren',
    name: '同人',
    en: 'FELLOWSHIP',
    type: '攻',
    cost: 1,
    rarity: '罕',
    text: '对所有敌人造成 {0} 点伤害并施加 1 层易。',
    vals: [5],
    upVals: [7],
    play: (c) => {
      c.hitAll(c.v[0]);
      c.statusAll('易', 1);
    },
  },

  /* ---------------- 守 ---------------- */
  {
    id: 'gen',
    name: '艮',
    en: 'MOUNTAIN',
    type: '守',
    cost: 1,
    rarity: '常',
    text: '获得 {0} 点格挡。',
    vals: [9],
    upVals: [12],
    play: (c) => c.block(c.v[0]),
  },
  {
    id: 'kunshou',
    name: '坤',
    en: 'EARTH',
    type: '守',
    cost: 2,
    rarity: '常',
    text: '获得 {0} 点格挡。',
    vals: [16],
    upVals: [21],
    play: (c) => c.block(c.v[0]),
  },
  {
    id: 'qianshou',
    name: '谦',
    en: 'MODESTY',
    type: '守',
    cost: 1,
    rarity: '常',
    text: '获得 {0} 点格挡，抽 1 张签。',
    vals: [6],
    upVals: [9],
    play: (c) => {
      c.block(c.v[0]);
      c.draw(1);
    },
  },
  {
    id: 'xushou',
    name: '蓄',
    en: 'ACCUMULATE',
    type: '守',
    cost: 1,
    rarity: '罕',
    text: '获得 {0} 点格挡，本回合结束不清除格挡。',
    vals: [5],
    upVals: [8],
    play: (c) => {
      c.block(c.v[0]);
      c.f.keepBlock = true;
    },
  },
  {
    id: 'dui',
    name: '兑',
    en: 'LAKE',
    type: '守',
    cost: 1,
    rarity: '常',
    text: '获得 {0} 点格挡，施加 1 层弱。',
    vals: [8],
    upVals: [11],
    play: (c) => {
      c.block(c.v[0]);
      c.statusTo(c.target, '弱', 1);
    },
  },
  {
    id: 'jianshou',
    name: '渐',
    en: 'GRADUAL',
    type: '守',
    cost: 2,
    rarity: '常',
    text: '获得 {0} 点格挡。耗。',
    vals: [12],
    upVals: [16],
    exhaust: true,
    play: (c) => c.block(c.v[0]),
  },
  {
    id: 'bishou',
    name: '比',
    en: 'HOLDING',
    type: '守',
    cost: 0,
    rarity: '常',
    text: '获得 {0} 点格挡。',
    vals: [4],
    upVals: [6],
    play: (c) => c.block(c.v[0]),
  },
  {
    id: 'huan',
    name: '涣',
    en: 'DISPERSION',
    type: '守',
    cost: 1,
    rarity: '常',
    text: '获得 {0} 点格挡，回复 {1} 点生命。',
    vals: [7, 3],
    upVals: [10, 5],
    play: (c) => {
      c.block(c.v[0]);
      c.heal(c.v[1]);
    },
  },
  {
    id: 'jieshou',
    name: '节',
    en: 'LIMITING',
    type: '守',
    cost: 1,
    rarity: '罕',
    text: '获得格挡，数值等于剩余卦力的 {0} 倍。',
    vals: [4],
    upVals: [5],
    play: (c) => c.block(Math.max(0, c.energyNow) * c.v[0]),
  },
  {
    id: 'tai',
    name: '泰',
    en: 'PEACE',
    type: '守',
    cost: 2,
    rarity: '罕',
    text: '获得 {0} 点格挡，下回合 +1 点卦力。',
    vals: [14],
    upVals: [18],
    play: (c) => {
      c.block(c.v[0]);
      c.f.nextEnergy += 1;
    },
  },
  {
    id: 'weiji',
    name: '未济',
    en: 'UNSETTLED',
    type: '守',
    cost: 1,
    rarity: '罕',
    text: '获得 {0} 点格挡；本回合打出过攻则改为 {1} 点。',
    vals: [6, 12],
    upVals: [8, 14],
    play: (c) => c.block(c.played.攻 > 0 ? c.v[1] : c.v[0]),
  },
  {
    id: 'dachu',
    name: '大畜',
    en: 'GREAT TAMING',
    type: '守',
    cost: 2,
    rarity: '罕',
    text: '获得 {0} 点格挡，下回合 -1 点卦力。',
    vals: [20],
    upVals: [26],
    play: (c) => {
      c.block(c.v[0]);
      c.f.nextEnergy -= 1;
    },
  },

  /* ---------------- 术 ---------------- */
  {
    id: 'guan',
    name: '观',
    en: 'VIEWING',
    type: '术',
    cost: 1,
    upCost: 0,
    rarity: '常',
    text: '抽 {0} 张签。耗。',
    vals: [3],
    exhaust: true,
    play: (c) => c.draw(c.v[0]),
  },
  {
    id: 'xian',
    name: '咸',
    en: 'INFLUENCE',
    type: '术',
    cost: 0,
    rarity: '常',
    text: '抽 {0} 张签。',
    vals: [1],
    upVals: [2],
    play: (c) => c.draw(c.v[0]),
  },
  {
    id: 'ge',
    name: '革',
    en: 'MOLTING',
    type: '术',
    cost: 1,
    rarity: '常',
    text: '随机弃 1 张签，抽 {0} 张签。',
    vals: [2],
    upVals: [3],
    play: (c) => {
      c.discardRandom(1);
      c.draw(c.v[0]);
    },
  },
  {
    id: 'ding',
    name: '鼎',
    en: 'CAULDRON',
    type: '术',
    cost: 1,
    rarity: '罕',
    text: '获得 {0} 层锐。',
    vals: [2],
    upVals: [3],
    play: (c) => c.status('锐', c.v[0]),
  },
  {
    id: 'lin',
    name: '临',
    en: 'APPROACH',
    type: '术',
    cost: 1,
    rarity: '罕',
    text: '获得 {0} 层韧。',
    vals: [2],
    upVals: [3],
    play: (c) => c.status('韧', c.v[0]),
  },
  {
    id: 'sui',
    name: '随',
    en: 'FOLLOWING',
    type: '术',
    cost: 1,
    rarity: '罕',
    text: '对所有敌人施加 {0} 层易。',
    vals: [2],
    upVals: [3],
    play: (c) => c.statusAll('易', c.v[0]),
  },
  {
    id: 'gushu',
    name: '蛊',
    en: 'WORK ON SPOILED',
    type: '术',
    cost: 1,
    rarity: '罕',
    text: '对所有敌人施加 {0} 层弱。',
    vals: [2],
    upVals: [3],
    play: (c) => c.statusAll('弱', c.v[0]),
  },
  {
    id: 'bense',
    name: '贲',
    en: 'GRACE',
    type: '术',
    cost: 0,
    rarity: '常',
    text: '获得 {0} 点卦力。耗。',
    vals: [1],
    upVals: [2],
    exhaust: true,
    play: (c) => c.energy(c.v[0]),
  },
  {
    id: 'fu',
    name: '复',
    en: 'RETURNING',
    type: '术',
    cost: 1,
    rarity: '常',
    text: '回复 {0} 点生命。耗。',
    vals: [8],
    upVals: [12],
    exhaust: true,
    play: (c) => c.heal(c.v[0]),
  },
  {
    id: 'jiaren',
    name: '家人',
    en: 'FAMILY',
    type: '术',
    cost: 1,
    rarity: '常',
    text: '将 {0} 张「叩问」加入手牌。',
    vals: [1],
    upVals: [2],
    play: (c) => c.addToHand('kou', c.v[0]),
  },
  {
    id: 'kui',
    name: '睽',
    en: 'OPPOSITION',
    type: '术',
    cost: 0,
    rarity: '罕',
    text: '弃掉整手牌，抽相同数量 +{0} 张。',
    vals: [1],
    upVals: [2],
    play: (c) => {
      const n = c.handIds.length;
      c.discardRandom(n);
      c.draw(n + c.v[0]);
    },
  },
  {
    id: 'lv',
    name: '旅',
    en: 'WANDERING',
    type: '术',
    cost: 1,
    rarity: '常',
    text: '从弃牌堆收回 {0} 张签，抽 1 张。',
    vals: [1],
    upVals: [2],
    play: (c) => {
      c.recycle(c.v[0]);
      c.draw(1);
    },
  },
  {
    id: 'jianshu',
    name: '蹇',
    en: 'OBSTRUCTION',
    type: '术',
    cost: 2,
    rarity: '秘',
    text: '获得 {0} 层锐。耗。',
    vals: [3],
    upVals: [4],
    exhaust: true,
    play: (c) => c.status('锐', c.v[0]),
  },
  {
    id: 'cui',
    name: '萃',
    en: 'GATHERING',
    type: '术',
    cost: 1,
    rarity: '罕',
    text: '抽 2 张签，失去 {0} 点生命。',
    vals: [3],
    upVals: [1],
    play: (c) => {
      c.draw(2);
      c.hurt(c.v[0]);
    },
  },
  {
    id: 'zhongfu',
    name: '中孚',
    en: 'INNER TRUTH',
    type: '术',
    cost: 2,
    rarity: '秘',
    text: '复制手牌中随机一张签。',
    vals: [],
    play: (c) => {
      const ids = c.handIds.filter((x) => x !== 'zhongfu');
      if (ids.length) c.addToHand(ids[Math.floor(Math.random() * ids.length)], 1);
    },
  },
  {
    id: 'goushu',
    name: '姤',
    en: 'COMING TO MEET',
    type: '术',
    cost: 1,
    rarity: '秘',
    text: '本回合下一张签的效果翻倍。',
    vals: [],
    play: (c) => {
      c.f.doubleNext = true;
      c.say('下一张签，加倍。');
    },
  },
  {
    id: 'song',
    name: '讼',
    en: 'CONFLICT',
    type: '术',
    cost: 1,
    rarity: '常',
    text: '对随机敌人造成 {0} 点伤害，抽 1 张签。',
    vals: [6],
    upVals: [9],
    play: (c) => {
      c.hitRandom(c.v[0]);
      c.draw(1);
    },
  },

  /* ---------------- 势 ---------------- */
  {
    id: 'qianshi',
    name: '乾',
    en: 'THE CREATIVE',
    type: '势',
    cost: 3,
    upCost: 2,
    rarity: '秘',
    text: '每回合 +{0} 点卦力。',
    vals: [2],
    play: (c) => c.status('卦', c.v[0]),
  },
  {
    id: 'tun',
    name: '屯',
    en: 'DIFFICULTY',
    type: '势',
    cost: 1,
    rarity: '罕',
    text: '每回合开始获得 {0} 点格挡。',
    vals: [3],
    upVals: [5],
    play: (c) => c.status('岩', c.v[0]),
  },
  {
    id: 'xushi',
    name: '需',
    en: 'WAITING',
    type: '势',
    cost: 2,
    upCost: 1,
    rarity: '秘',
    text: '每回合多抽 1 张签。',
    vals: [],
    play: (c) => c.status('裕', 1),
  },
  {
    id: 'meng',
    name: '蒙',
    en: 'YOUTHFUL FOLLY',
    type: '势',
    cost: 2,
    upCost: 1,
    rarity: '秘',
    text: '每打出一张签，回复 {0} 点生命。',
    vals: [1],
    play: (c) => c.status('润', c.v[0]),
  },
  {
    id: 'sheng',
    name: '升',
    en: 'PUSHING UPWARD',
    type: '势',
    cost: 1,
    rarity: '罕',
    text: '本场第一回合 +{0} 点卦力。',
    vals: [2],
    upVals: [3],
    play: (c) => c.energy(c.v[0]),
  },
];

export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** 牌池：非起手、非秘（秘只在精英 / Boss 后给） */
export const POOL_COMMON = CARDS.filter((c) => c.rarity === '常').map((c) => c.id);
export const POOL_RARE = CARDS.filter((c) => c.rarity === '罕').map((c) => c.id);
export const POOL_SECRET = CARDS.filter((c) => c.rarity === '秘').map((c) => c.id);

export function cardName(id: string, up: boolean): string {
  const d = CARD_MAP[id];
  return d ? d.name + (up ? '+' : '') : id;
}

/** 把「造成 {0} 点伤害」渲染成实际数字 */
export function renderText(d: CardDef, up: boolean): string {
  const vals = up && d.upVals ? d.upVals : d.vals;
  return d.text.replace(/\{(\d+)\}/g, (_, i) => String(vals[Number(i)] ?? 0));
}
