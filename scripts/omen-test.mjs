/**
 * 《签 · OMEN》实测：起静态服务 → 真机走一程 → 截图 + 收集报错
 *   PATH=$PWD/.tools/node:$PATH node scripts/omen-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = 4405;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url);
  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500);
    res.end('err');
  }
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    if (el.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }, sel);
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const text = (sel) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? '', sel);

const report = [];
const log = (s) => {
  report.push(s);
  console.log(s);
};

await page.goto(`${BASE}/games/omen`, { waitUntil: 'networkidle0' });
await wait(400);

log(`标题遮罩可见: ${await visible('#omOverlay')}`);
await page.screenshot({ path: path.join(SHOTS, 'omen-title.png') });

/* ---------- 起一卦 ---------- */
await page.click('#omBtn');
await wait(500);
const nodes = await count('#omMapSvg .om-node');
const live = await count('#omMapSvg .om-node--live');
log(`地图可见: ${await visible('#omMapView')} · 节点 ${nodes} 个 · 可走 ${live} 条`);
if (nodes !== 15 * 0 + nodes) log(`节点总数 ${nodes}（15 层，正常应在 32–46 之间）`);
await page.screenshot({ path: path.join(SHOTS, 'omen-map.png') });

/* ---------- 走一程 ---------- */
let steps = 0;
let battles = 0;
let scenes = 0;
let turns = 0;
let played = 0;
let shotBattle = false;
let shotScene = false;
let inBattle = false;
let lastPick = '-';
const seen = [];

while (steps < 220) {
  steps += 1;

  if (await visible('#omBattleView')) {
    if (!inBattle) {
      inBattle = true;
      battles += 1;
      if (!shotBattle) {
        await page.screenshot({ path: path.join(SHOTS, 'omen-battle.png') });
        shotBattle = true;

        // 合成压测：把手里只有 5 张的牌强行复制到 12 张，看会不会换行 / 挤出 / 裁字
        const stress = await page.evaluate(() => {
          const h = document.getElementById('omHand');
          const proto = h?.querySelector('.om-card');
          if (!h || !proto) return null;
          const n = 12;
          const gap = 6;
          const budget = 848;
          const w = n <= 7 ? 104 : Math.max(60, Math.floor((budget - (n - 1) * gap) / n));
          const keep = h.style.getPropertyValue('--om-card-w');
          h.style.setProperty('--om-card-w', `${w}px`);
          const added = [];
          for (let i = 0; i < n - 1; i++) {
            const c = proto.cloneNode(true);
            h.appendChild(c);
            added.push(c);
          }
          const cards = [...h.querySelectorAll('.om-card')];
          const r = {
            张数: cards.length,
            卡宽: Math.round(cards[0].getBoundingClientRect().width),
            行数: new Set(cards.map((c) => c.offsetTop)).size,
            手牌横溢: h.scrollWidth - h.clientWidth,
            文字被裁: cards.filter((c) => c.scrollHeight > c.clientHeight + 2).length,
          };
          added.forEach((c) => c.remove());
          h.style.setProperty('--om-card-w', keep || '104px');
          return r;
        });
        log(`12 张合成压测：${JSON.stringify(stress)}`);
      }
      log(
        `战斗 #${battles}（第 ${await text('#omFloor')} 层）：敌人 ${await count('.om-foe')} 个 · 手牌 ${await count('#omHand .om-card')} 张 · ${await text('#omEnergy')}`,
      );
    }
    // 满手牌时单独截一张，看会不会撑破容器
    const handN = await count('#omHand .om-card');
    if (handN >= 8 && !globalThis.__fullShot) {
      globalThis.__fullShot = true;
      const fit = await page.evaluate(() => {
        const s = document.querySelector('.om-screen');
        const h = document.getElementById('omHand');
        const cards = h ? [...h.querySelectorAll('.om-card')] : [];
        return {
          张数: cards.length,
          卡宽: cards.length ? Math.round(cards[0].getBoundingClientRect().width) : 0,
          行数: h ? new Set(cards.map((c) => c.offsetTop)).size : 0,
          手牌横溢: h ? h.scrollWidth - h.clientWidth : 0,
          文字被裁的卡: cards.filter((c) => c.scrollHeight > c.clientHeight + 2).length,
          屏高: s ? Math.round(s.getBoundingClientRect().height) : 0,
        };
      });
      log(`满手牌（${handN} 张）布局：${JSON.stringify(fit)}`);
      await page.screenshot({ path: path.join(SHOTS, 'omen-battle-full.png') });
    }
    // 把能打的签全打出去
    for (let i = 0; i < 12; i++) {
      const ok = await page.evaluate(() => {
        const c = document.querySelector('.om-card:not(.om-card--off)');
        if (!c) return false;
        c.click();
        return true;
      });
      if (!ok) break;
      played += 1;
      await wait(110);
    }
    await page.evaluate(() => document.getElementById('omEnd')?.click());
    turns += 1;
    await wait(300);
    continue;
  }
  inBattle = false;

  if (await visible('#omSceneView')) {
    if (!shotScene) {
      await page.screenshot({ path: path.join(SHOTS, 'omen-scene.png') });
      shotScene = true;
    }
    scenes += 1;
    const title = await text('.om-sc-title') || await text('.om-sc-kicker');
    if (!seen.includes(title)) seen.push(title);
    // 按优先级点：奖励取签 > 事件选项 > 焚签/研读选牌 > 卜肆离开 > 焚签台睡觉
    const moved = await page.evaluate(() => {
      const order = [
        '.om-pick [data-hand]', // 奖励三选一（卜肆也有，下面用 mini-btn 排除）
        '[data-opt]',
        '[data-deck]',
        '[data-up]',
        '[data-act="leave"]',
        '[data-act="back"]',
        '[data-act="sleep"]',
        '[data-act="skip"]',
        '[data-act="burn"]',
      ];
      const isShop = !!document.querySelector('.om-pick .om-mini-btn');
      for (const sel of order) {
        if (isShop && sel === '.om-pick [data-hand]') continue;
        const el = document.querySelector(sel);
        if (el) {
          el.click();
          return sel;
        }
      }
      return false;
    });
    if (moved) lastPick = moved;
    if (!moved) {
      log(`场景没有可点的选项，停在「${title}」（上次点的是 ${lastPick}）`);
      break;
    }
    await wait(1250);
    continue;
  }

  if (await visible('#omMapView')) {
    const moved = await page.evaluate(() => {
      const n = document.querySelector('.om-node--live');
      if (!n) return false;
      n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    if (!moved) {
      log('地图上没有可走的节点');
      break;
    }
    await wait(420);
    continue;
  }

  if (await visible('#omOverlay')) {
    log(`结算：${await text('#omTitle')} / ${await text('#omKicker')}`);
    await page.screenshot({ path: path.join(SHOTS, 'omen-over.png') });
    break;
  }

  await wait(200);
}

log(`共走 ${steps} 步 · 战斗 ${battles} 场 · 场景 ${scenes} 个 · 回合 ${turns} 次 · 打出 ${played} 张签`);
log(`走过的场景：${seen.join(' / ')}`);
if (turns > 90) log('⚠ 回合数偏多，可能有打不完的战斗');

/* ---------- 侧栏 / 存档 ---------- */
log(
  `侧栏：生命 ${await text('#omHp')}/${await text('#omHpMax')} · 签金 ${await text('#omGold')} · 牌组 ${await text('#omDeckN')} 张 · 卜器 ${await text('#omRelicN')} 件`,
);
const saved = await page.evaluate(() => {
  try {
    const raw = localStorage.getItem('sen.guest.v1');
    if (!raw) return 'no guest key';
    const d = JSON.parse(raw);
    return JSON.stringify(d?.games?.omen ?? null);
  } catch (e) {
    return 'err ' + e.message;
  }
});
log(`存档 games.omen: ${saved}`);

/* ---------- 游戏厅入口 ---------- */
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`${BASE}/games`, { waitUntil: 'networkidle0' });
await wait(500);
const cards = await count('.arc-card');
const omenCard = await page.evaluate(() => {
  const a = [...document.querySelectorAll('.arc-card')].find((x) => x.getAttribute('href') === '/games/omen');
  if (!a) return null;
  return {
    name: a.querySelector('.arc-name')?.textContent?.trim(),
    tag: a.querySelector('.arc-badge')?.textContent?.trim(),
    hasArt: !!a.querySelector('.arc-art svg'),
  };
});
log(`游戏厅卡片 ${cards} 张 · 签卡片：${JSON.stringify(omenCard)}`);
const rows = await count('.arc-row');
log(`战绩表行数 ${rows}（表头 1 + 游戏 ${cards} + 合计 1 = ${cards + 2}）`);
await page.screenshot({ path: path.join(SHOTS, 'omen-arcade.png') });

/* ---------- 手机视图 ---------- */
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/games/omen`, { waitUntil: 'networkidle0' });
await wait(400);
await page.click('#omBtn');
await wait(500);

// 一直走到第一个战斗节点
for (let i = 0; i < 8; i++) {
  if (await visible('#omBattleView')) break;
  await page.evaluate(() => {
    const n = document.querySelector('.om-node--live');
    n?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(500);
  if (await visible('#omSceneView')) {
    await page.evaluate(() => {
      document.querySelector('.om-sc-opts .om-opt')?.click();
    });
    await wait(1300);
  }
}

await page.evaluate(() => document.querySelector('.om-screen')?.scrollIntoView({ block: 'start' }));
await wait(300);
await page.screenshot({ path: path.join(SHOTS, 'omen-mobile.png') });

const btn = await page.evaluate(() => {
  const b = document.getElementById('omEnd');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    在视口内: r.top >= 0 && r.bottom <= window.innerHeight,
  };
});
log(`手机「结束回合」按钮：${JSON.stringify(btn)}`);
const rowsN = await page.evaluate(() => {
  const h = document.getElementById('omHand');
  if (!h) return 0;
  return new Set(
    [...h.querySelectorAll('.om-card')].map((c) => c.offsetTop),
  ).size;
});
log(`手机手牌行数：${rowsN}（应为 1）`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
log(`手机横向溢出: ${overflow}px`);

await browser.close();
server.close();

console.log('\n──────── 报错 ────────');
if (!errors.length) console.log('无');
else errors.slice(0, 20).forEach((e) => console.log(e));
process.exit(errors.length ? 1 : 0);
