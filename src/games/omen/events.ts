/* ============================================================
   《签 · OMEN》事件谱（10 个）
   run 里的 r 是 RunApi，由 omen.astro 提供实现
   ============================================================ */
import type { EventDef } from './types';
import { POOL_COMMON, POOL_RARE, POOL_SECRET } from './cards';

const pick = <T,>(a: T[], rng: () => number): T => a[Math.floor(rng() * a.length)];

export const EVENTS: EventDef[] = [
  {
    id: 'kongqian',
    title: '空签筒',
    kicker: 'EVENT · 一',
    body: '路边的签筒倒着，签洒了一地。竹片还是新的，没人抽过。你弯腰，捡还是不捡。',
    options: [
      {
        label: '取一签',
        hint: '随机一张常签加入牌组',
        run: (r) => r.addCard(pick(POOL_COMMON, r.rng)),
      },
      { label: '不取，歇口气', hint: '回复 12 点生命', run: (r) => r.heal(12) },
      {
        label: '把整筒收走',
        hint: '获得一件卜器，失去 8 点生命',
        run: (r) => {
          r.hurt(8);
          r.addRelic('');
        },
      },
    ],
  },
  {
    id: 'shenqian',
    title: '神前',
    kicker: 'EVENT · 二',
    body: '一尊没有脸的像，香炉是冷的。签文在案上摊开，字迹自己会动。',
    options: [
      {
        label: '焚一炷香',
        hint: '失去 6 点生命，获得一张秘签',
        run: (r) => {
          r.hurt(6);
          r.addCard(pick(POOL_SECRET, r.rng));
        },
      },
      {
        label: '伸手取签',
        hint: '获得一件卜器，牌组混入一张「困」',
        run: (r) => {
          r.addCard('kunn');
          r.addRelic('');
        },
      },
      { label: '绕过去', hint: '无事发生', run: (r) => r.say('你低头走开了。') },
    ],
  },
  {
    id: 'jing',
    title: '井',
    kicker: 'EVENT · 三',
    body: '井水很清，清得看不见底。你俯身，水面浮出一张不是你的脸。',
    options: [
      { label: '照影', hint: '回复 10 点生命', run: (r) => r.heal(10) },
      { label: '饮一口', hint: '最大生命 +6', run: (r) => r.maxHp(6) },
      { label: '退开', hint: '无事发生', run: (r) => r.say('你退了一步。') },
    ],
  },
  {
    id: 'jiuqiantan',
    title: '旧签摊',
    kicker: 'EVENT · 四',
    body: '摊主不在，签码压着一张纸：「自己算，钱放桌上。」',
    options: [
      {
        label: '留钱取签',
        hint: '花 40 签金，获得一张罕签',
        run: (r) => {
          r.gold(-40);
          r.addCard(pick(POOL_RARE, r.rng));
        },
      },
      {
        label: '留钱烧签',
        hint: '花 40 签金，从牌组移除一张签',
        run: (r) => {
          r.gold(-40);
          r.removeCard('');
        },
      },
      { label: '空手走', hint: '无事发生', run: (r) => r.say('你把钱袋按紧了。') },
    ],
  },
  {
    id: 'yatong',
    title: '哑童',
    kicker: 'EVENT · 五',
    body: '一个不会说话的孩子伸出两只手：一只摊开，一只握着。',
    options: [
      {
        label: '给他一张签',
        hint: '移除一张随机签，获得一件卜器',
        run: (r) => {
          r.removeCard('');
          r.addRelic('');
        },
      },
      { label: '摇头', hint: '回复 8 点生命', run: (r) => r.heal(8) },
    ],
  },
  {
    id: 'huijindui',
    title: '灰烬堆',
    kicker: 'EVENT · 六',
    body: '一堆刚熄的纸灰，还冒着细烟。底下压着没烧尽的签。',
    options: [
      {
        label: '伸手翻',
        hint: '随机：一件卜器 / 失去 6 点生命 / 得到 60 签金',
        run: (r) => {
          const x = r.rng();
          if (x < 0.4) r.addRelic('');
          else if (x < 0.7) r.hurt(6);
          else r.gold(60);
        },
      },
      { label: '不碰', hint: '无事发生', run: (r) => r.say('灰还有温度。') },
    ],
  },
  {
    id: 'sanchakou',
    title: '三岔口',
    kicker: 'EVENT · 七',
    body: '三条路，一块无字碑。碑面朝哪边，没人记得了。',
    options: [
      { label: '走碑指的方向', hint: '获得一件卜器', run: (r) => r.addRelic('') },
      { label: '走有水的那条', hint: '回复 15 点生命', run: (r) => r.heal(15) },
      {
        label: '走中间的',
        hint: '一张罕签加入牌组',
        run: (r) => r.addCard(pick(POOL_RARE, r.rng)),
      },
    ],
  },
  {
    id: 'duanbei',
    title: '断碑',
    kicker: 'EVENT · 八',
    body: '碑断成两截，上半截的字还在，下半截埋在土里。',
    options: [
      {
        label: '把碑拼起来读',
        hint: '最大生命 +10，失去 5 点生命',
        run: (r) => {
          r.maxHp(10);
          r.hurt(5);
        },
      },
      {
        label: '只拓上半截',
        hint: '获得一张秘签',
        run: (r) => r.addCard(pick(POOL_SECRET, r.rng)),
      },
      { label: '不读', hint: '无事发生', run: (r) => r.say('有些字，读不得。') },
    ],
  },
  {
    id: 'houshi',
    title: '卜肆后门',
    kicker: 'EVENT · 九',
    body: '卜肆打烊了，后门虚掩。柜台上的卜器隔着门缝发亮。',
    options: [
      {
        label: '推门进去',
        hint: '获得一件卜器，失去 10 点生命',
        run: (r) => {
          r.hurt(10);
          r.addRelic('');
        },
      },
      {
        label: '敲门',
        hint: '花 50 签金，获得一件卜器',
        run: (r) => {
          r.gold(-50);
          r.addRelic('');
        },
      },
      { label: '走开', hint: '无事发生', run: (r) => r.say('门里的光灭了。') },
    ],
  },
  {
    id: 'wumingpaiwei',
    title: '无名牌位',
    kicker: 'EVENT · 十',
    body: '牌位上没有名字，只有一道被香火熏黑的刻痕。前面三炷香，一炷刚点上。',
    options: [
      { label: '上香', hint: '升级牌组中一张随机签', run: (r) => r.upgradeCard('') },
      { label: '拂去灰尘', hint: '回复 20 点生命', run: (r) => r.heal(20) },
      { label: '无视', hint: '得到 30 签金', run: (r) => r.gold(30) },
    ],
  },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
