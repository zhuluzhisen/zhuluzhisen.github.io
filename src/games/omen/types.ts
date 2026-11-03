/* ============================================================
   《签 · OMEN》类型定义
   数据层与逻辑层之间只靠这些接口通信，改数值不用碰逻辑
   ============================================================ */

/** 签的四类：攻 / 守 / 术 / 势 */
export type CardType = '攻' | '守' | '术' | '势';

/** 稀有度：起＝起手牌，常 / 罕 / 秘＝牌池 */
export type Rarity = '起' | '常' | '罕' | '秘';

/**
 * 状态
 *  锐 攻击 +X    韧 守类签格挡 +X   易 受到伤害 +50%   弱 造成伤害 -25%
 *  静 每回合少抽 X 张              卦 每回合 +X 卦力
 *  岩 每回合开始获得 X 格挡        润 每打出一张签回复 X 生命
 *  裕 每回合多抽 X 张
 */
export type StatusKey = '锐' | '韧' | '易' | '弱' | '静' | '卦' | '岩' | '润' | '裕';

/** 敌人意图 */
export type IntentKind = '攻' | '守' | '术' | '群' | '未知';

export interface Intent {
  kind: IntentKind;
  /** 攻击伤害；kind 为「守」时无意义 */
  value: number;
  /** 攻击次数 */
  times: number;
  /** 界面上显示的动作名 */
  note: string;
  /** 同一回合顺带获得的格挡 */
  block?: number;
  /** 给自己上的状态 */
  self?: [StatusKey, number];
  /** 给玩家上的状态 */
  foe?: [StatusKey, number];
  /** 夺走玩家几点卦力 */
  drain?: number;
}

/** 打出一张签时，效果函数能拿到的全部手段 */
export interface Flags {
  /** 回合结束不清除格挡 */
  keepBlock: boolean;
  /** 下回合额外卦力 */
  nextEnergy: number;
  /** 本回合下一张签效果翻倍 */
  doubleNext: boolean;
}

export interface CastCtx {
  /** 这张签的数值（已算过升级与翻倍） */
  v: readonly number[];
  /** 选中的敌人下标，-1 表示无目标 */
  target: number;
  f: Flags;
  turn: number;
  /** 当前剩余卦力 */
  energyNow: number;
  /** 手牌上的签 id（按顺序） */
  handIds: readonly string[];
  /** 本回合已打出的各类签数量 */
  played: { 攻: number; 守: number; 术: number; 势: number; all: number };

  hit: (i: number, dmg: number) => void;
  hitAll: (dmg: number) => void;
  hitRandom: (dmg: number) => void;
  block: (n: number) => void;
  heal: (n: number) => void;
  hurt: (n: number) => void;
  draw: (n: number) => void;
  discardRandom: (n: number) => void;
  addToHand: (id: string, n?: number) => void;
  addToDiscard: (id: string) => void;
  recycle: (n: number) => void;
  status: (k: StatusKey, n: number) => void;
  statusTo: (i: number, k: StatusKey, n: number) => void;
  statusAll: (k: StatusKey, n: number) => void;
  /** 读某个敌人身上的状态层数 */
  foeStatus: (i: number, k: StatusKey) => number;
  energy: (n: number) => void;
  say: (s: string) => void;
}

export interface CardDef {
  id: string;
  name: string;
  en: string;
  type: CardType;
  /** 卦力消耗；-1 表示 X 费（本项目暂不用） */
  cost: number;
  rarity: Rarity;
  /** 签文，用 {0} {1} 引用 vals */
  text: string;
  vals: number[];
  /** 升级后的数值，不给则不可升级 */
  upVals?: number[];
  /** 升级后的卦力消耗 */
  upCost?: number;
  /** 打出后本场战斗移除 */
  exhaust?: boolean;
  /** 打出后本局永久移除 */
  burn?: boolean;
  /** 是否可以被「焚签」升级 */
  upgradable?: boolean;
  play: (c: CastCtx) => void;
}

/* ---------------- 敌人 ---------------- */

export interface EnemyState {
  id: string;
  name: string;
  glyph: string;
  hue: string;
  hp: number;
  hpMax: number;
  block: number;
  st: Partial<Record<StatusKey, number>>;
  intent: Intent;
  alive: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  en: string;
  glyph: string;
  hue: string;
  hp: [number, number];
  tier: '常' | '精' | '首';
  /** 每回合开始挑一个动作 */
  act: (rng: () => number, turn: number, self: EnemyState) => Intent;
}

/* ---------------- 卜器（遗物） ---------------- */

export interface RelicDef {
  id: string;
  name: string;
  en: string;
  glyph: string;
  text: string;
  rarity: '常' | '罕' | '秘' | '咎';

  battleStartBlock?: number;
  battleStartStatus?: { k: StatusKey; n: number };
  battleStartFoeStatus?: { k: StatusKey; n: number };
  firstTurnEnergy?: number;
  firstTurnDraw?: number;
  energyPerTurn?: number;
  /** 每 N 回合额外 1 点卦力 */
  energyEvery?: number;
  attackBonus?: number;
  handPenalty?: number;
  winHeal?: number;
  /** 本场战斗未受伤时额外回复 */
  noHitHeal?: number;
  shopDiscount?: number;
  /** 每持有一件卜器加的最大生命 */
  maxHpPerRelic?: number;
  /** 回合结束按格挡的比例对随机敌人造成伤害 */
  blockToDamage?: number;
  firstHitHalf?: boolean;
  copyFirstCard?: boolean;
  innateStrike?: number;
  floorMaxHp?: number;
  /** 焚签时可选「研读」——升级一张签 */
  restUpgrade?: boolean;
  /** 提前看到下一层节点 */
  revealNext?: boolean;
  /** 进入新楼层时回复的生命 */
  floorHeal?: number;
  /** 每回合第一张签费用 -N（最低 0） */
  firstCardFree?: number;
}

/* ---------------- 事件 ---------------- */

export interface RunApi {
  heal: (n: number) => void;
  hurt: (n: number) => void;
  maxHp: (n: number) => void;
  gold: (n: number) => void;
  addCard: (id: string) => void;
  removeCard: (id: string) => void;
  upgradeCard: (id: string) => void;
  addRelic: (id: string) => void;
  rng: () => number;
  say: (s: string) => void;
  hasRelic: (id: string) => boolean;
}

export interface EventOption {
  label: string;
  hint: string;
  run: (r: RunApi) => void;
}

export interface EventDef {
  id: string;
  title: string;
  kicker: string;
  body: string;
  options: EventOption[];
}

/* ---------------- 局势 ---------------- */

export type NodeKind = '战' | '精' | '事' | '肆' | '焚' | '首';

export interface MapNode {
  floor: number;
  slot: number;
  kind: NodeKind;
  next: number[];
  visited: boolean;
  reachable: boolean;
}
