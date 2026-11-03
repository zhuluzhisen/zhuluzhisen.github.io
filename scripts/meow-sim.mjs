/**
 * 《喵星防线》无界面平衡模拟：按一套「普通玩家」建造顺序自动打 30 波
 *   node scripts/meow-sim.mjs [plan]
 * 需要 Node 23.6+（原生剥离 TS 类型）
 */
import { MeowGame } from '../src/games/meow/engine.ts';
import { MAPS, FIELD_W, FIELD_H, buildPath, posAt } from '../src/games/meow/maps.ts';
import { TOWERS } from '../src/games/meow/data.ts';

const planName = process.argv[2] || 'normal';

const PLANS = {
  // 普通玩家：先飞爪，再补范围和狙击，后期上喵帝
  normal: [
    ['place', 'claw', 'c1'],
    ['place', 'claw', 'c2'],
    ['up', 'c1', 1],
    ['up', 'c2', 1],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['place', 'claw', 'c3'],
    ['up', 'c3', 0],
    ['up', 'c3', 1],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['place', 'yarn', 'y1'],
    ['place', 'snipe', 's1'],
    ['up', 's1', 1],
    ['up', 'c1', 1],
    ['place', 'ice', 'i1'],
    ['up', 'i1', 1],
    ['up', 'i1', 0],
    ['up', 'y1', 0],
    ['up', 'y1', 1],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['up', 's1', 0],
    ['up', 's1', 0],
    ['up', 'y1', 1],
    ['up', 'c3', 0],
    ['up', 'c3', 0],
    ['up', 's1', 1],
    ['up', 'y1', 0],
    ['place', 'super', 'm1'],
    ['up', 'm1', 1],
    ['up', 'm1', 1],
    ['up', 'm1', 0],
    ['up', 'y1', 0],
    ['up', 's1', 0],
    ['up', 'm1', 0],
    ['place', 'snipe', 's2'],
    ['up', 's2', 1],
    ['up', 's2', 0],
    ['up', 's2', 0],
    ['up', 's2', 1],
  ],
  // 会玩的玩家：先铺量再升级
  good: [
    ['place', 'claw', 'c1'],
    ['place', 'claw', 'c2'],
    ['up', 'c1', 1],
    ['up', 'c2', 1],
    ['place', 'claw', 'c3'],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['up', 'c3', 0],
    ['up', 'c3', 1],
    ['place', 'claw', 'c4'],
    ['up', 'c4', 0],
    ['up', 'c4', 1],
    ['place', 'yarn', 'y1'],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['place', 'snipe', 's1'],
    ['up', 's1', 1],
    ['up', 'y1', 0],
    ['place', 'ice', 'i1'],
    ['up', 'i1', 1],
    ['up', 'c3', 0],
    ['up', 'c4', 0],
    ['place', 'yarn', 'y2'],
    ['up', 'y2', 0],
    ['up', 'c1', 1],
    ['up', 's1', 0],
    ['up', 's1', 1],
    ['up', 'y1', 1],
    ['up', 'y1', 1],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['up', 's1', 0],
    ['place', 'super', 'm1'],
    ['up', 'm1', 1],
    ['up', 'm1', 1],
    ['up', 'm1', 0],
    ['up', 'y1', 0],
    ['up', 'y2', 0],
    ['up', 'm1', 0],
    ['up', 's1', 0],
    ['place', 'snipe', 's2'],
    ['up', 's2', 1],
    ['up', 's2', 0],
    ['up', 's2', 0],
    ['up', 's2', 1],
  ],
  // 只放飞爪猫：应该打不过铅气球那关
  clawOnly: [
    ['place', 'claw', 'c1'],
    ['place', 'claw', 'c2'],
    ['up', 'c1', 1],
    ['up', 'c2', 1],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['place', 'claw', 'c3'],
    ['place', 'claw', 'c4'],
    ['up', 'c1', 0],
    ['up', 'c2', 0],
    ['up', 'c1', 1],
    ['up', 'c2', 1],
    ['up', 'c3', 1],
    ['up', 'c4', 1],
    ['up', 'c3', 1],
    ['up', 'c4', 1],
    ['place', 'claw', 'c5'],
    ['place', 'claw', 'c6'],
  ],
};

const map = MAPS[0];
const geo = buildPath(map.points);
const samples = [];
for (let d = 0; d < geo.total; d += 8) samples.push(posAt(geo, d));

const game = new MeowGame(map);

function bestSpot(kind) {
  const def = TOWERS[kind];
  const range = Math.min(def.base.range, 400);
  let best = null;
  for (let x = 20; x < FIELD_W; x += 10) {
    for (let y = 20; y < FIELD_H; y += 10) {
      if (!game.canPlace(kind, x, y)) continue;
      let cover = 0;
      for (const p of samples) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= range * range) cover++;
      // 前段路径权重更高，更像玩家放在入口附近
      if (!best || cover > best.cover) best = { x, y, cover };
    }
  }
  return best;
}

const plan = PLANS[planName];
const named = {};
const done = new Set();
let pi = 0;
/** 依次执行建造计划；买不起时往后看 3 步，先买得起的（像真人一样不死等） */
function tryPlan() {
  let progressed = true;
  while (progressed) {
    progressed = false;
    while (done.has(pi)) pi++;
    for (let j = pi; j < Math.min(plan.length, pi + 4); j++) {
      if (done.has(j)) continue;
      const [op, a, b] = plan[j];
      if (op === 'place') {
        if (game.money < TOWERS[a].cost) continue;
        const s = bestSpot(a);
        const t = s && game.place(a, s.x, s.y);
        if (!t) continue;
        named[b] = t;
      } else {
        const t = named[a];
        if (!t) continue;
        const c = game.checkUpgrade(t, b);
        if (c.state === 'ok') game.upgrade(t, b);
        else if (c.state === 'poor') continue;
      }
      done.add(j);
      progressed = true;
      break;
    }
  }
}

const log = [];
let leaksThisWave = 0;
let leakTypes = {};
let guard = 0;
while (game.state !== 'over' && game.state !== 'won' && guard++ < 60 * 60 * 60) {
  if (game.state === 'build') {
    tryPlan();
    game.startWave();
    leaksThisWave = 0;
  }
  if (guard % 30 === 0) tryPlan();
  game.update(1 / 60);
  for (const e of game.drain()) {
    if (e.k === 'leak') {
      leaksThisWave += e.n;
      leakTypes[e.t] = (leakTypes[e.t] || 0) + 1;
    }
    if (e.k === 'waveEnd') {
      const lt = Object.entries(leakTypes)
        .map(([k, v]) => `${k}×${v}`)
        .join(' ');
      log.push(
        `W${String(e.wave).padStart(2)}  lives ${String(game.lives).padStart(3)}  money ${String(game.money).padStart(5)}  leak ${leaksThisWave} ${lt}  towers ${game.towers.length}  plan ${pi}/${plan.length}`,
      );
      leakTypes = {};
    }
  }
}

console.log(log.join('\n'));
if (game.state === 'over') console.log('失守波漏怪：', JSON.stringify(leakTypes));
for (const t of game.towers) {
  console.log(`  ${t.def.name.padEnd(6)} (${t.x},${t.y}) ${t.tiers.join('-')}  戳破 ${t.pops}  花费 ${t.spent}`);
}
console.log(
  `\n[${planName}] 结果：${game.state === 'won' ? '通关' : `第 ${game.wave} 波失守`}  鱼干 ${game.lives}  戳破 ${game.pops}  用时 ${(game.time / 60).toFixed(1)} 分钟`,
);
