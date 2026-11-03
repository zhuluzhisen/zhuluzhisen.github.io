/* ============================================================
   《签 · OMEN》卜器谱（20 件）
   全是数据字段，omen.astro 读字段生效，不加 if 分支
   ============================================================ */
import type { RelicDef } from './types';

export const RELICS: RelicDef[] = [
  {
    id: 'tongjiao',
    name: '铜筊',
    en: 'BRASS LOTS',
    glyph: '◈',
    rarity: '常',
    text: '每场战斗第一回合额外抽 1 张签。',
    firstTurnDraw: 1,
  },
  {
    id: 'canqiantong',
    name: '残签筒',
    en: 'CRACKED TUBE',
    glyph: '▣',
    rarity: '咎',
    text: '每回合 +1 点卦力，但每回合少抽 1 张签。',
    energyPerTurn: 1,
    handPenalty: 1,
  },
  {
    id: 'zhushabi',
    name: '朱砂笔',
    en: 'CINNABAR BRUSH',
    glyph: '✦',
    rarity: '常',
    text: '攻类签的伤害 +2。',
    attackBonus: 2,
  },
  {
    id: 'guijia',
    name: '龟甲',
    en: 'PLASTRON',
    glyph: '⚌',
    rarity: '常',
    text: '每场战斗开始获得 8 点格挡。',
    battleStartBlock: 8,
  },
  {
    id: 'xianghuinang',
    name: '香灰囊',
    en: 'ASH POUCH',
    glyph: '◇',
    rarity: '常',
    text: '战斗胜利后回复 4 点生命。',
    winHeal: 4,
  },
  {
    id: 'duanbing',
    name: '断柄',
    en: 'SNAPPED HANDLE',
    glyph: '⚋',
    rarity: '罕',
    text: '每第三回合额外获得 1 点卦力。',
    energyEvery: 3,
  },
  {
    id: 'huangli',
    name: '黄历',
    en: 'ALMANAC',
    glyph: '⚍',
    rarity: '罕',
    text: '每进入新的一层，回复 3 点生命。',
    floorHeal: 3,
  },
  {
    id: 'qianpu',
    name: '签谱',
    en: 'LOT CATALOGUE',
    glyph: '◉',
    rarity: '常',
    text: '卜肆里的东西便宜四分之一。',
    shopDiscount: 25,
  },
  {
    id: 'mengyanbu',
    name: '蒙眼布',
    en: 'BLINDFOLD',
    glyph: '⚎',
    rarity: '罕',
    text: '每场战斗第一次受到的伤害减半。',
    firstHitHalf: true,
  },
  {
    id: 'wudiqian',
    name: '五帝钱',
    en: 'FIVE COINS',
    glyph: '○',
    rarity: '常',
    text: '每场战斗开始获得 1 层锐。',
    battleStartStatus: { k: '锐', n: 1 },
  },
  {
    id: 'shicao',
    name: '蓍草',
    en: 'YARROW',
    glyph: '✱',
    rarity: '罕',
    text: '焚签时可以多一个选择：研读（升级一张签）。',
    restUpgrade: true,
  },
  {
    id: 'kongwan',
    name: '空碗',
    en: 'EMPTY BOWL',
    glyph: '▽',
    rarity: '常',
    text: '每持有一件卜器，最大生命 +4。',
    maxHpPerRelic: 4,
  },
  {
    id: 'tongling',
    name: '铜铃',
    en: 'BELL',
    glyph: '✧',
    rarity: '常',
    text: '每场战斗开始对所有敌人施加 1 层弱。',
    battleStartFoeStatus: { k: '弱', n: 1 },
  },
  {
    id: 'qianwangyin',
    name: '籤王印',
    en: 'SEAL OF LOTS',
    glyph: '■',
    rarity: '秘',
    text: '每回合打出的第一张签，卦力消耗 -1（最低 0）。',
    firstCardFree: 1,
  },
  {
    id: 'huijin',
    name: '灰烬',
    en: 'EMBER',
    glyph: '▲',
    rarity: '罕',
    text: '战斗胜利后回复 2 点生命；本场未受伤则改为 8 点。',
    winHeal: 2,
    noHitHeal: 6,
  },
  {
    id: 'shuangmianjing',
    name: '双面镜',
    en: 'TWIN MIRROR',
    glyph: '◐',
    rarity: '秘',
    text: '每场战斗开始，复制手牌中随机一张签。',
    copyFirstCard: true,
  },
  {
    id: 'tieqian',
    name: '铁籤',
    en: 'IRON SLIP',
    glyph: '⚊',
    rarity: '罕',
    text: '回合结束时，按当前格挡的四分之一对随机敌人造成伤害。',
    blockToDamage: 25,
  },
  {
    id: 'yinlufan',
    name: '引路幡',
    en: 'GUIDE BANNER',
    glyph: '❋',
    rarity: '常',
    text: '地图上可以看见下一层的节点。',
    revealNext: true,
  },
  {
    id: 'weiranqian',
    name: '未燃签',
    en: 'UNBURNED SLIP',
    glyph: '✜',
    rarity: '常',
    text: '每场战斗开始，将 1 张「叩问」加入手牌。',
    innateStrike: 1,
  },
  {
    id: 'guapan',
    name: '卦盘',
    en: 'DIAL',
    glyph: '☯',
    rarity: '罕',
    text: '每进入新的一层，最大生命 +1。',
    floorMaxHp: 1,
  },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export function relicPool(taken: string[], rng: () => number): RelicDef | null {
  const left = RELICS.filter((r) => !taken.includes(r.id) && r.rarity !== '咎');
  if (!left.length) return null;
  // 秘 15% · 罕 35% · 常 50%
  const roll = rng();
  const want = roll < 0.15 ? '秘' : roll < 0.5 ? '罕' : '常';
  const tier = left.filter((r) => r.rarity === want);
  const src = tier.length ? tier : left;
  return src[Math.floor(rng() * src.length)];
}
