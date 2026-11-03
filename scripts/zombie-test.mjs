/**
 * 丧尸 RPG 实测：起静态服务 → 开始 → 推进对话 → 走过门 → 战斗 → 截图 + 收集报错
 *   "/c/Program Files/nodejs/node.exe" scripts/zombie-test.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve('dist');
const PORT = 4400;
const BASE = `http://127.0.0.1:${PORT}`;

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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function clearDialog(page, max = 40) {
  for (let i = 0; i < max; i++) {
    const hidden = await page.evaluate(() => document.getElementById('gzDialog')?.hidden);
    if (hidden) return true;
    await page.keyboard.press('Space');
    await wait(200);
  }
  return false;
}

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
}

/** 朝目标格逼近（分轴按键，能绕开撞墙） */
async function moveTo(page, tx, ty, maxSteps = 50) {
  for (let k = 0; k < maxSteps; k++) {
    const p = await page.evaluate(() => window.__gz?.player);
    if (!p) return false;
    const cx = tx * 16 + 8;
    const cy = ty * 16 + 14;
    const dx = cx - p.x;
    const dy = cy - p.y;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 7) return true;
    const downs = [];
    if (dx > 5) downs.push('d');
    else if (dx < -5) downs.push('a');
    if (dy > 7) downs.push('s');
    else if (dy < -7) downs.push('w');
    if (!downs.length) return true;
    for (const d of downs) await page.keyboard.down(d);
    await wait(170);
    for (const d of downs) await page.keyboard.up(d);
  }
  return false;
}

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(BASE + '/games/zombie', { waitUntil: 'networkidle0' });
await wait(800);

await page.screenshot({ path: 'shots/zombie-1-title.png' });

await page.click('#gzBtn');
await wait(500);
const introDone = await clearDialog(page);
await wait(300);
await page.screenshot({ path: 'shots/zombie-2-ward.png' });

// 走向门口：先右后下
const reachedDoor = await moveTo(page, 11, 11);
await wait(1200);

const areaAfterDoor = await page.evaluate(() => document.getElementById('gzArea')?.textContent);
const sceneNow = await page.evaluate(() => window.__gz?.scene);
const sceneDone = await clearDialog(page);
await wait(300);
await page.screenshot({ path: 'shots/zombie-3-corridor.png' });

// 向右推进并持续挥砍
await page.keyboard.down('d');
for (let i = 0; i < 14; i++) {
  await wait(260);
  await page.keyboard.press('Space');
}
await page.keyboard.up('d');
await wait(250);
await page.screenshot({ path: 'shots/zombie-4-fight.png' });

for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Space');
  await wait(180);
}
await page.screenshot({ path: 'shots/zombie-5-fight2.png' });

const state = await page.evaluate(() => {
  const c = document.querySelector('#gzCanvas');
  const r = c.getBoundingClientRect();
  const big = document.createElement('canvas');
  big.width = c.width * 4;
  big.height = c.height * 4;
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, big.width, big.height);
  return {
    hp: document.getElementById('gzHpNum')?.textContent,
    kills: document.getElementById('gzKills')?.textContent,
    area: document.getElementById('gzArea')?.textContent,
    scene: document.getElementById('gzScene')?.textContent,
    dialogHidden: document.getElementById('gzDialog')?.hidden,
    overlayHidden: document.getElementById('gzOverlay')?.hidden,
    cssW: Math.round(r.width),
    cssH: Math.round(r.height),
    gz: window.__gz
      ? {
          scene: window.__gz.scene,
          phase: window.__gz.phase,
          kills2: window.__gz.kills,
          player: window.__gz.player,
          zombies: window.__gz.zombies,
        }
      : null,
    data: big.toDataURL('image/png'),
  };
});

fs.writeFileSync('shots/zombie-canvas-raw.png', Buffer.from(state.data.split(',')[1], 'base64'));
delete state.data;

console.log('reached door =', reachedDoor, '| intro cleared =', introDone, '| corridor dialog cleared =', sceneDone);
console.log('area after walking =', areaAfterDoor, '| scene attr =', sceneNow);
console.log('canvas css =', state.cssW + 'x' + state.cssH);
console.log('state =', JSON.stringify(state.gz));
console.log('errors =', errors.length);
errors.slice(0, 8).forEach((e) => console.log('  ' + e));

// 顺便看一眼游戏厅列表卡片
const arc = await browser.newPage();
await arc.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
await arc.goto(BASE + '/games', { waitUntil: 'networkidle0' });
await wait(900);
await arc.screenshot({ path: 'shots/arcade-with-zombie.png', fullPage: true });

await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
